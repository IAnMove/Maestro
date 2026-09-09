"""HTTP → reservation → fake worker → Story candidate. No GPU or providers."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.services.music_fake_worker import portable_audio_filename, public_job_from_record, run_fake_music_worker
from app.services.music_finalization import MusicFinalizationError
from app.services.music_submission import (
    MusicSubmissionError,
    MusicSubmissionStore,
    submit_music_generation,
)
from app.services.story_library import read_story_library, write_story_library


def _library(tmp_path: Path) -> None:
    write_story_library(
        str(tmp_path),
        {
            "version": 2,
            "revision": 0,
            "activeId": "story-1",
            "projects": {
                "story-1": {
                    "id": "story-1",
                    "title": "Night Choir",
                    "music": {
                        "cues": [{
                            "id": "cue-1",
                            "title": "Opening",
                            "candidates": [{"id": "song-1", "status": "pending", "source": "", "name": ""}],
                        }],
                    },
                },
            },
        },
        base_revision=0,
    )


def _app(tmp_path: Path) -> FastAPI:
    workspace_dir = str(tmp_path)
    app = FastAPI()

    @app.post("/api/v1/stories/music-candidates/jobs", status_code=202)
    def start_job(body: dict):
        try:
            stored = submit_music_generation(
                workspace_dir=workspace_dir,
                request=body,
                after_persist=lambda record: run_fake_music_worker(workspace_dir, record),
            )
        except MusicSubmissionError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
        record = MusicSubmissionStore(workspace_dir).get_by_job_id(str(stored.get("job_id") or "")) or stored
        return public_job_from_record(workspace_dir, record)

    @app.get("/api/v1/stories/music-candidates/jobs/{job_id}")
    def get_job(job_id: str):
        record = MusicSubmissionStore(workspace_dir).get_by_job_id(job_id)
        if record is None:
            raise HTTPException(status_code=404, detail="MiniMax Music job not found")
        return public_job_from_record(workspace_dir, record)

    return app


def test_http_fake_worker_publishes_reserved_candidate(tmp_path: Path):
    _library(tmp_path)
    client = TestClient(_app(tmp_path))
    started = client.post("/api/v1/stories/music-candidates/jobs", json={
        "prompt": "cinematic dream pop",
        "lyrics": "[Verse]\nLa noche canta",
        "model": "music-3.0",
        "count": 1,
        "output_folder": "night-shift",
        "idempotency_key": "p5-http-1",
        "project_id": "story-1",
        "cue_id": "cue-1",
        "candidate_id": "song-1",
    })
    assert started.status_code == 202
    body = started.json()
    assert body["jobId"]
    assert body["candidateId"] == "song-1"
    assert body["status"] == "completed"
    assert body["candidates"][0]["filename"] == "song-1.wav"
    polled = client.get(f"/api/v1/stories/music-candidates/jobs/{body['jobId']}")
    assert polled.status_code == 200
    assert polled.json()["candidates"][0]["filename"] == "song-1.wav"
    cue = read_story_library(str(tmp_path))["projects"]["story-1"]["music"]["cues"][0]
    assert cue["candidates"][0]["id"] == "song-1"
    assert cue["candidates"][0]["status"] == "ready"
    assert cue["candidates"][0]["name"] == "song-1.wav"
    assert (tmp_path / "song-1.wav").is_file()


def test_fake_worker_rejects_path_candidate_ids_before_writing(tmp_path: Path):
    try:
        portable_audio_filename("../escape")
        raise AssertionError("expected MusicFinalizationError")
    except MusicFinalizationError:
        pass
    try:
        portable_audio_filename("nested/song")
        raise AssertionError("expected MusicFinalizationError")
    except MusicFinalizationError:
        pass
    assert portable_audio_filename("song-1") == "song-1.wav"
    assert not (tmp_path / "escape.wav").exists()


def test_http_fake_worker_replay_does_not_duplicate(tmp_path: Path):
    _library(tmp_path)
    client = TestClient(_app(tmp_path))
    payload = {
        "prompt": "cinematic dream pop",
        "lyrics": "[Verse]\nLa noche canta",
        "model": "music-3.0",
        "count": 1,
        "output_folder": "night-shift",
        "idempotency_key": "p5-http-replay",
        "project_id": "story-1",
        "cue_id": "cue-1",
        "candidate_id": "song-1",
    }
    first = client.post("/api/v1/stories/music-candidates/jobs", json=payload)
    second = client.post("/api/v1/stories/music-candidates/jobs", json=payload)
    assert first.status_code == 202
    assert second.status_code == 202
    assert first.json()["jobId"] == second.json()["jobId"]
    library = read_story_library(str(tmp_path))
    assert len(library["projects"]["story-1"]["music"]["cues"][0]["candidates"]) == 1
