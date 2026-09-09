"""Model-free music worker for reserved attempts.

Writes a tiny WAV and publishes through music_finalization. No GPU, no
provider HTTP, no launch import.
"""
from __future__ import annotations

import wave
from pathlib import Path
from typing import Any, Mapping

from .music_finalization import MusicFinalizationError, finalize_reserved_music
from .music_submission import public_music_job


def portable_audio_filename(candidate_id: str) -> str:
    raw = str(candidate_id or "").strip()
    if (
        not raw
        or raw in {".", ".."}
        or "/" in raw
        or "\\" in raw
        or raw != Path(raw).name
    ):
        raise MusicFinalizationError("audio_filename must be a portable file name")
    return raw if raw.endswith(".wav") else f"{raw}.wav"


def write_silent_wav(path: Path, *, seconds: float = 0.25, rate: int = 8000) -> Path:
    frames = int(rate * seconds)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(b"\x00\x00" * frames)
    return path


def run_fake_music_worker(workspace_dir: str, record: Mapping[str, Any]) -> dict[str, Any]:
    filename = portable_audio_filename(str(record.get("candidate_id") or "song"))
    destination = Path(workspace_dir) / filename
    write_silent_wav(destination)
    return finalize_reserved_music(
        workspace_dir=workspace_dir,
        generation_id=str(record.get("generation_id") or ""),
        audio_filename=filename,
    )


def public_job_from_record(workspace_dir: str, record: Mapping[str, Any]) -> dict[str, Any]:
    body = public_music_job(record)
    publication = record.get("publication") if isinstance(record.get("publication"), Mapping) else {}
    filename = str(publication.get("audio_filename") or "").strip()
    if str(record.get("status") or "") != "published" or not filename:
        return body
    body["status"] = "completed"
    body["phase"] = "completed"
    body["progress"] = 100
    body["current"] = 1
    body["candidates"] = [{
        "filename": filename,
        "audio_path": str(Path(workspace_dir) / filename),
        "source": f"/api/v1/file/{filename}",
        "duration_seconds": publication.get("measured_duration_seconds") or 0,
        "provider": body["provider"],
        "model": body["model"],
        "taskId": body["taskId"],
        "rootTaskId": body["rootTaskId"],
    }]
    return body
