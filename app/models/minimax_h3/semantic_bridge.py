"""Optional conditioning adapter; independent implementation of published math.

See SEMANTIC_BRIDGE.md for provenance, scope, and limitations. No teacher model
or third-party ComfyUI node is loaded. Disabled means no download or tensor work.
"""
from __future__ import annotations
from functools import lru_cache
import hashlib
import math
from pathlib import Path

REPO = 'speach1sdef178/MiniMax-H3-Semantic-Bridge'
REVISION = '8c2d9b0edb844d6002864a9addd61458dbe81c22'
FILENAME = 'MiniMaxH3_SemanticBridge_v1.safetensors'
SHA256 = 'ac0dc8ac05f545ebdee12e2fcebe4515b049f9cfd9558eb4887a9bf3fd6d562e'
SIZE = 11023032
MAGNITUDE_MODES = {'per_token', 'global', 'none'}
SHAPES = {'fc1.weight': (512, 5120), 'fc1.bias': (512,),
          'fc2.weight': (512, 512), 'fc2.bias': (512,),
          'fc3.weight': (5120, 512), 'fc3.bias': (5120,)}


def supports_bridge(model_def: dict, model_type: str = '') -> bool:
    architecture = str(model_def.get('architecture') or '')
    return (architecture.startswith('minimax_h3')
            and 'legacy' not in architecture and 'legacy' not in model_type
            and not model_def.get('omni_reference')
            and not model_def.get('minimax_h3_fused_turbo'))


def validate_options(alpha, magnitude: str, model_def: dict, model_type: str = '') -> float:
    if isinstance(alpha, bool):
        raise ValueError('Semantic Bridge strength must be numeric, not a boolean.')
    try:
        strength = float(0 if alpha is None else alpha)
    except (TypeError, ValueError) as error:
        raise ValueError('Semantic Bridge strength must be a number from 0 to 1.') from error
    if not math.isfinite(strength) or not 0 <= strength <= 1:
        raise ValueError('Semantic Bridge strength must be finite and between 0 and 1.')
    if not isinstance(magnitude, str) or magnitude not in MAGNITUDE_MODES:
        raise ValueError('Semantic Bridge magnitude must be per_token, global or none.')
    if strength and not supports_bridge(model_def, model_type):
        raise ValueError('Semantic Bridge v1 supports standard H3 First/Last Pruned and Full only; Ref2VA, Fused and Legacy are not supported.')
    return strength


def normalize_request(body: dict, model_def: dict) -> None:
    alpha_key = 'minimax_h3_semantic_bridge_alpha'
    magnitude_key = 'minimax_h3_semantic_bridge_magnitude'
    if alpha_key not in body and magnitude_key not in body:
        return
    mode = body.get(magnitude_key, 'per_token')
    if mode is None:
        mode = 'per_token'
    body[alpha_key] = validate_options(body.get(alpha_key, 0), mode, model_def,
                                       str(body.get('model_type') or ''))
    body[magnitude_key] = mode


def _verify(path: Path) -> None:
    if path.stat().st_size != SIZE:
        raise ValueError('Semantic Bridge adapter has an unexpected size.')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != SHA256:
        raise ValueError('Semantic Bridge adapter SHA256 verification failed.')


def _asset_path() -> Path:
    from shared.utils import files_locator as fl
    relative = 'minimax_h3/semantic_bridge/' + FILENAME
    found = fl.locate_file(relative, error_if_none=False)
    if found:
        return Path(found)
    from huggingface_hub import hf_hub_download
    destination = Path(fl.get_smart_download_location(relative)).parent
    destination.mkdir(parents=True, exist_ok=True)
    print('[MiniMax H3 Semantic Bridge] Downloading the pinned 11 MB adapter.')
    return Path(hf_hub_download(REPO, filename=FILENAME, revision=REVISION,
                               local_dir=str(destination)))


@lru_cache(maxsize=2)
def _load_weights(path: str, modified_ns: int, size: int):
    from safetensors.torch import load_file
    _verify(Path(path))
    weights = load_file(path, device='cpu')
    if set(weights) != set(SHAPES):
        raise ValueError('Semantic Bridge adapter tensor names do not match v1.')
    for name, shape in SHAPES.items():
        if tuple(weights[name].shape) != shape:
            raise ValueError(f'Semantic Bridge adapter has an invalid shape for {name}.')
    return weights


def _project(native, weights):
    import torch
    import torch.nn.functional as F
    h = native.float()
    normalized = h / torch.sqrt(h.square().mean(dim=-1, keepdim=True) + 1e-6)
    # Keep only CPU weights cached: the small device copies die after this call.
    device_weights = {name: tensor.to(device=native.device, dtype=torch.float32)
                      for name, tensor in weights.items()}
    hidden = F.silu(F.linear(normalized, device_weights['fc1.weight'], device_weights['fc1.bias']))
    hidden = F.silu(F.linear(hidden, device_weights['fc2.weight'], device_weights['fc2.bias']))
    return F.linear(hidden, device_weights['fc3.weight'], device_weights['fc3.bias'])


def blend_projection(native, projected, alpha: float, magnitude: str):
    """RMS-match and blend without modifying native conditioning or its tags."""
    import torch
    h, projected = native.float(), projected.float()
    if magnitude == 'per_token':
        source = projected.square().mean(dim=-1, keepdim=True)
        target = h.square().mean(dim=-1, keepdim=True)
        projected = projected * torch.sqrt((target + 1e-8) / (source + 1e-8))
    elif magnitude == 'global':
        projected = projected * torch.sqrt((h.square().mean() + 1e-8) /
                                           (projected.square().mean() + 1e-8))
    return (h + alpha * (projected - h)).to(native.dtype)


def apply_bridge(native, alpha=0, magnitude='per_token', *, model_def: dict):
    strength = validate_options(alpha, magnitude, model_def)
    if strength == 0:
        return native
    import torch
    if native.ndim != 3 or native.shape[-1] != 5120:
        raise ValueError('Semantic Bridge expects native H3 conditioning [B,T,5120].')
    path = _asset_path()
    stat = path.stat()
    weights = _load_weights(str(path.resolve()), stat.st_mtime_ns, stat.st_size)
    with torch.inference_mode():
        result = blend_projection(native, _project(native, weights), strength, magnitude)
    print(f'[MiniMax H3 Semantic Bridge] Applied v1, alpha={strength:g}, magnitude={magnitude}.')
    return result
