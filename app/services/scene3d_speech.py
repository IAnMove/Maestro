"""Bounded, offline Rhubarb analysis. No model downloads or cloud calls."""
from __future__ import annotations

import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import wave

MAX_BYTES = 3_000_000
_LOCK = threading.BoundedSemaphore(1)


class SpeechAnalysisError(ValueError):
    pass


class SpeechAnalysisUnavailable(RuntimeError):
    pass


def rhubarb_executable() -> str | None:
    configured = os.environ.get("RHUBARB_EXECUTABLE", "")
    if configured:
        candidate = Path(configured)
        return str(candidate) if candidate.is_absolute() and candidate.is_file() else None
    return shutil.which("rhubarb")


def validate_voice_wav(data: bytes) -> float:
    if len(data) > MAX_BYTES:
        raise SpeechAnalysisError("Use a mono 16 kHz PCM WAV of up to 90 seconds.")
    try:
        with wave.open(io.BytesIO(data), "rb") as audio:
            frames = audio.getnframes()
            duration = frames / audio.getframerate()
            if audio.getnchannels() != 1 or audio.getframerate() != 16000 or audio.getsampwidth() != 2 or audio.getcomptype() != "NONE" or not 0 < duration <= 90:
                raise SpeechAnalysisError("Use a mono 16 kHz PCM WAV of up to 90 seconds.")
            if len(audio.readframes(frames)) != frames * 2:
                raise SpeechAnalysisError("Truncated WAV.")
            return duration
    except (wave.Error, EOFError, ZeroDivisionError) as exc:
        raise SpeechAnalysisError("Invalid PCM WAV.") from exc


def analyze_voice(data: bytes) -> dict:
    duration = validate_voice_wav(data)
    executable = rhubarb_executable()
    if not executable:
        raise SpeechAnalysisUnavailable("Rhubarb is not installed. Set RHUBARB_EXECUTABLE or put rhubarb on PATH; you can also import a cues JSON or use volume analysis.")
    if not _LOCK.acquire(blocking=False):
        raise SpeechAnalysisUnavailable("Another local speech analysis is running. Try again shortly.")
    try:
        # Keep diagnostic files: never delete user audio or imported assets.
        folder = Path(tempfile.mkdtemp(prefix="hocuspocus-speech-"))
        source, output = folder / "voice.wav", folder / "cues.json"
        source.write_bytes(data)
        try:
            completed = subprocess.run(
                [executable, "--threads", "2", "--quiet", "-r", "phonetic",
                 "--extendedShapes", "GHX", "-f", "json", "-o", str(output), str(source)],
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                timeout=90, check=False, shell=False,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
        except (subprocess.TimeoutExpired, OSError) as exc:
            raise SpeechAnalysisUnavailable("Local speech analysis failed or timed out.") from exc
        if completed.returncode or not output.is_file() or output.stat().st_size > 2_000_000:
            raise SpeechAnalysisUnavailable("Local speech analysis produced no valid result.")
        try:
            cues = json.loads(output.read_text(encoding="utf-8"))["mouthCues"]
            if not isinstance(cues, list) or len(cues) > 10000:
                raise ValueError("Invalid cues")
            previous = 0.0
            for cue in cues:
                start, end = float(cue["start"]), float(cue["end"])
                if cue["value"] not in "ABCDEFGHX" or len(cue["value"]) != 1 or not previous <= start < end <= duration + .1:
                    raise ValueError("Invalid cue")
                previous = end
        except (KeyError, ValueError, TypeError, OSError) as exc:
            raise SpeechAnalysisUnavailable("Local speech analysis produced invalid cues.") from exc
        return {"mouthCues": cues, "recognizer": "phonetic", "duration": duration}
    finally:
        _LOCK.release()
