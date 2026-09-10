"""Optional installed-only RoFormer speech analysis, isolated from the GPU runtime."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading

from services.scene3d_speech import SpeechAnalysisUnavailable, validate_voice_wav

MODEL_NAME = 'model_bs_roformer_ep_317_sdr_12.9755'
MODEL_DIR = Path(__file__).resolve().parents[1] / 'ckpts' / 'roformer'
_LOCK = threading.BoundedSemaphore(1)


def isolation_capability():
    installed = all((MODEL_DIR / (MODEL_NAME + ext)).is_file() for ext in ('.ckpt', '.yaml'))
    available = installed and importlib.util.find_spec('audio_separator') is not None
    return {'available': available, 'model': 'BS-RoFormer', 'device': 'cpu',
            'maxSeconds': 90, 'downloads': False,
            'reason': 'ready' if available else 'optional_model_missing'}


def isolate_voice(data: bytes) -> bytes:
    duration = validate_voice_wav(data)
    if not isolation_capability()['available']:
        raise SpeechAnalysisUnavailable('Optional BS-RoFormer model and audio-separator must already be installed. No files were downloaded.')
    if not _LOCK.acquire(blocking=False):
        raise SpeechAnalysisUnavailable('Another vocal isolation is running. Try again shortly.')
    try:
        with tempfile.TemporaryDirectory(prefix='hocuspocus-vocals-') as folder:
            source, target = Path(folder) / 'source.wav', Path(folder) / 'voice.wav'
            source.write_bytes(data)
            environment = {**os.environ, 'CUDA_VISIBLE_DEVICES': '-1', 'HF_HUB_OFFLINE': '1',
                           'TRANSFORMERS_OFFLINE': '1', 'OMP_NUM_THREADS': '2', 'MKL_NUM_THREADS': '2'}
            try:
                done = subprocess.run([sys.executable, str(Path(__file__).with_name('vocal_isolation_worker.py')),
                                       str(source), str(target), str(MODEL_DIR), MODEL_NAME],
                                      env=environment, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                      stderr=subprocess.DEVNULL, timeout=900, check=False,
                                      creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            except (OSError, subprocess.TimeoutExpired) as error:
                raise SpeechAnalysisUnavailable('Local vocal isolation failed or exceeded 15 minutes. Existing lip cues are unchanged.') from error
            if done.returncode or not target.is_file() or target.stat().st_size > 3_000_000:
                raise SpeechAnalysisUnavailable('Local vocal isolation failed. Check the installed model and audio-separator; no downloads were attempted.')
            result = target.read_bytes()
            if abs(validate_voice_wav(result) - duration) > 1 / 16000:
                raise SpeechAnalysisUnavailable('Isolated voice changed the source timing.')
            return result
    finally:
        _LOCK.release()
