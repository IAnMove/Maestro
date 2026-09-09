"""An SFX command must not silently change sources while waiting in the queue."""
from copy import deepcopy
from types import SimpleNamespace

import pytest

from services.studio_image_resources import file_identity
from services.studio_sfx_execution import prepared_sfx_execution


def admitted(tmp_path, *, video=True):
    path = tmp_path / "guide.mp4"
    path.write_bytes(b"inspected video bytes")
    params = {"_mmaudio_variant": "v2", "duration_seconds": 6.25, "guidance_scale": 1,
              "video_guide": str(path) if video else None, "prompt": "  rain\n  "}
    job = {"id": "job-1", "task_id": "task-generation-job-1", "workspace": "sfx-out",
           "provenance": {"capability": "generation.sfx", "command": {"command_id": "intent-1"}}}
    resources = [{"role": "video_guide", **file_identity(path)}] if video else []
    entry = {"operation": "generation.sfx", "task_id": job["task_id"],
             "effective": {"resources": resources, "runtime": {
                 "params": deepcopy(params), "workspace": job["workspace"]}}}
    task = {"id": job["task_id"], "backend_job_id": job["id"], "workspace": job["workspace"]}
    registry = SimpleNamespace(command_admission=lambda intent: entry if intent == "intent-1" else None,
                               get=lambda task_id: task if task_id == task["id"] else None)
    checked = []
    return path, params, job, registry, checked


@pytest.mark.parametrize("video", [False, True])
def test_verified_native_request_keeps_its_exact_duration_and_checks_installed_models(tmp_path, video):
    _, params, job, registry, checked = admitted(tmp_path, video=video)
    before = deepcopy(params)
    assert prepared_sfx_execution(job, params, registry=registry, check_models=checked.append)
    assert params == before
    assert checked == ["v2"]


@pytest.mark.parametrize("change", ["missing", "replacement", "different_task", "different_intent", "duration", "remove_guide", "boolean_as_number"])
def test_changed_queued_request_stops_before_model_work(tmp_path, change):
    path, params, job, registry, checked = admitted(tmp_path)
    if change == "missing":
        path.unlink()
    elif change == "replacement":
        path.write_bytes(b"replaced video bytes!")
    elif change == "different_task":
        job["task_id"] = "another-task"
    elif change == "different_intent":
        job["provenance"]["command"]["command_id"] = "unadmitted"
    elif change == "duration":
        params["duration_seconds"] = 20
    elif change == "remove_guide":
        params["video_guide"] = None
    elif change == "boolean_as_number":
        params["guidance_scale"] = True
    with pytest.raises(ValueError):
        prepared_sfx_execution(job, params, registry=registry, check_models=checked.append)
    assert checked == []


def test_legacy_provenance_does_not_grant_typed_execution(tmp_path):
    _, params, job, registry, checked = admitted(tmp_path)
    job["provenance"] = {"capability": "generate"}
    assert not prepared_sfx_execution(job, params, registry=registry, check_models=checked.append)
    assert checked == []


def test_missing_model_after_admission_fails_without_download_fallback(tmp_path):
    _, params, job, registry, _ = admitted(tmp_path)

    def unavailable(_variant):
        raise FileNotFoundError("The installed model was removed")

    with pytest.raises(FileNotFoundError, match="model was removed"):
        prepared_sfx_execution(job, params, registry=registry, check_models=unavailable)
