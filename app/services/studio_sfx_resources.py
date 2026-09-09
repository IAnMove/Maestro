"""Inspect canonical video guides and installed MMAudio dependencies.

SFX is the first Studio operation whose optional guide is a video.  The
resolver intentionally reuses the image resource resolver's source-location
rules, but probes the selected file as video before the native worker sees it.
Only portable identities are returned in the command record; the resolved path
is kept in the detached worker map and is never serialized as provenance.
"""

from __future__ import annotations

from copy import deepcopy
import math
import subprocess
from collections.abc import Callable

from services.studio_image_resources import StudioImageResources, file_identity
from services.studio_sfx_spec import SFX_MODEL_TYPES, SFX_MODEL_VARIANTS
from services.video_editor import probe_media


SFX_VIDEO_FIELDS = ("video_guide",)

# These are the files opened by ``postprocessing.mmaudio`` for the two typed
# variants.  The paths are relative names understood by the trusted model
# installer/locator.  This list is only an inspection contract: no function in
# this module downloads, creates or mutates any of them.
MMAUDIO_SHARED_FILES = (
    "mmaudio/synchformer_state_dict.pth",
    "mmaudio/v1-44.pth",
    "DFN5B-CLIP-ViT-H-14-378/open_clip_config.json",
    "DFN5B-CLIP-ViT-H-14-378/open_clip_pytorch_model.bin",
    "bigvgan_v2_44khz_128band_512x/config.json",
    "bigvgan_v2_44khz_128band_512x/bigvgan_generator.pt",
)
MMAUDIO_VARIANT_FILES = {
    "v2": ("mmaudio/mmaudio_large_44k_v2.pth",),
    "nsfw": ("mmaudio/mmaudio_large_44k_nsfw_gold_8.5k_final_fp16.safetensors",),
}


def required_mmaudio_files(model_or_variant: str) -> tuple[str, ...]:
    """Return the trusted relative files needed by one typed MMAudio variant.

    Callers may provide the public virtual model ID or its derived variant.
    Unknown values fail closed instead of selecting a server-configured
    fallback model.
    """
    if model_or_variant in SFX_MODEL_TYPES:
        variant = SFX_MODEL_VARIANTS[model_or_variant]
    elif model_or_variant in MMAUDIO_VARIANT_FILES:
        variant = model_or_variant
    else:
        raise ValueError("Choose a registered MMAudio SFX variant")
    return (*MMAUDIO_SHARED_FILES, *MMAUDIO_VARIANT_FILES[variant])


def missing_mmaudio_files(
    model_or_variant: str,
    file_exists: Callable[[str], bool],
) -> tuple[str, ...]:
    """Return missing dependency names using an injected read-only check."""
    if not callable(file_exists):
        raise TypeError("file_exists must be a callable installed-file inspection")
    required = required_mmaudio_files(model_or_variant)
    missing: list[str] = []
    for filename in required:
        try:
            present = file_exists(filename)
        except (OSError, TypeError, ValueError) as error:
            raise ValueError("Installed MMAudio files could not be inspected") from error
        if not isinstance(present, bool):
            raise ValueError("Installed-file inspection must return booleans")
        if not present:
            missing.append(filename)
    return tuple(missing)


def validate_mmaudio_files(
    model_or_variant: str,
    file_exists: Callable[[str], bool],
) -> tuple[str, ...]:
    """Fail closed if any MMAudio dependency is absent; never download it."""
    required = required_mmaudio_files(model_or_variant)
    missing = missing_mmaudio_files(model_or_variant, file_exists)
    if missing:
        joined = ", ".join(missing)
        raise ValueError(f"Required MMAudio files are not installed: {joined}")
    return required


class StudioSfxResources(StudioImageResources):
    """Resolve one canonical optional video guide for typed SFX."""

    media_kind = "video"

    def prepare_media(self, params):
        """Return a detached worker map and portable guide identities.

        A missing guide is valid for text-only SFX.  Once a guide is selected,
        resolution, confinement, media kind and timing are all mandatory; a
        missing or unreadable source never falls back to the output workspace.
        """
        working = deepcopy(params)
        value = working.get("video_guide")
        if value in (None, ""):
            working["video_guide"] = None
            return working, []
        if not isinstance(value, str):
            raise ValueError("input.params.video_guide must be a canonical video reference")

        # ``_media`` enforces an explicit uploads/workspace root and checks
        # that an asset ID resolves to one unique video location.
        path, workspace = self._media(value)
        identity = file_identity(path)
        try:
            information = probe_media(path)
        except subprocess.TimeoutExpired as error:
            raise ValueError("A selected SFX video guide could not be inspected in time") from error
        except (OSError, TypeError, ValueError) as error:
            raise ValueError("A selected SFX video guide is not a readable video") from error

        duration = information.get("duration")
        width = information.get("width")
        height = information.get("height")
        if (isinstance(duration, bool) or not isinstance(duration, (int, float))
                or not math.isfinite(float(duration)) or float(duration) <= 0):
            raise ValueError("A selected SFX video guide has no finite positive duration")
        if type(width) is not int or width <= 0 or type(height) is not int or height <= 0:
            raise ValueError("A selected SFX video guide has invalid dimensions")

        duration = float(duration)
        # Keep the path only in the native handoff.  Resource records are
        # deliberately made of API identity and media measurements.
        working["video_guide"] = path
        record = {
            "role": "video_guide",
            "index": 0,
            "url": value,
            "workspace": workspace,
            "duration_seconds": duration,
            "width": width,
            "height": height,
            "fps": information.get("fps"),
            "has_audio": information.get("has_audio"),
            "pixel_format": information.get("pixel_format"),
            "has_alpha": information.get("has_alpha"),
            **identity,
        }
        return working, [record]


# The shared names are useful to the runtime/catalog adapter and make the
# no-download boundary explicit without exposing a filesystem implementation.
SFXResources = StudioSfxResources
mmaudio_required_files = required_mmaudio_files


__all__ = [
    "MMAUDIO_SHARED_FILES",
    "MMAUDIO_VARIANT_FILES",
    "SFX_VIDEO_FIELDS",
    "SFXResources",
    "StudioSfxResources",
    "missing_mmaudio_files",
    "mmaudio_required_files",
    "required_mmaudio_files",
    "validate_mmaudio_files",
]
