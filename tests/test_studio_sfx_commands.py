"""SFX uses canonical admissions and the existing queue, with no model calls."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

from routers.image_generation_commands import create_image_generation_commands_router, image_command_handlers
from services.studio_sfx_commands import create_sfx_operation, check_sfx_models
from services.studio_sfx_execution import prepared_sfx_execution
from services.studio_sfx_resources import StudioSfxResources, required_mmaudio_files
from tests.test_image_generation_commands import FakeNative, _run


class SfxNative(FakeNative):
    def make_job(self, *args, **kwargs):
        job = super().make_job(*args, **kwargs)
        job["task_id"] = f"task-{job['id']}"
        return job


def command(intent="sound-intent"):
    return {"version": 2, "operation": "generation.sfx", "intent_id": intent,
            "input": {"workspace": "sound-output", "params": {
                "model_type": "mmaudio_v2", "prompt": "  Rain against glass.\n  ",
                "duration_seconds": 3, "seed": 42,
            }}}


def setup_service(tmp_path):
    native = SfxNative(tmp_path / "registry")
    weights = tmp_path / "weights"
    for name in required_mmaudio_files("v2"):
        path = weights / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"installed test file; no model is loaded")
    runtime = {"wgp": SimpleNamespace(fl=SimpleNamespace(
        locate_file=lambda name, **_kwargs: str(weights / name) if (weights / name).exists() else None,
    )), "_run_generation": lambda _job_id: True}
    resources = StudioSfxResources(
        workspace_dir=lambda name: str(tmp_path / name), uploads_dir=lambda: str(tmp_path / "uploads"),
        list_workspaces=lambda: [{"name": name} for name in ("source", "sound-output", "default")],
        lora_search_dirs=lambda _model: [], lora_compatible=lambda *_args: False,
    )
    service = native.service()
    service.runtime_defaults = lambda: {"model_type": "wrong-video-model", "prompt": "global residue"}
    service.operations["generation.sfx"] = create_sfx_operation(
        runtime, resources=lambda: resources, execution_policy=lambda _workspace: None,
    )
    return native, service, runtime, weights


def test_http_and_external_mcp_replay_share_one_literal_native_admission(tmp_path):
    native, service, runtime, _ = setup_service(tmp_path)
    app = FastAPI()
    app.include_router(create_image_generation_commands_router(service))
    request = command()
    with TestClient(app) as client:
        first = client.post('/api/v1/generation/commands', json=request,
                            headers={"X-Hocus-UI-Surface": "wizard"})
        assert first.status_code == 200, first.text
    replay = _run(image_command_handlers(service)['generation.sfx'](
        {key: value for key, value in request.items() if key != 'operation'}))
    assert replay == {"receipt": first.json()["receipt"], "replayed": True}
    assert len(native.dispatch_calls) == 1
    job = native.dispatch_calls[0]
    assert job['params']['model_type'] == 'mmaudio_v2'
    assert job['params']['prompt'] == request['input']['params']['prompt']
    assert service.native_worker(job) is runtime['_run_generation']
    assert prepared_sfx_execution(job, job['params'], registry=native.registry('sound-output'),
                                  check_models=lambda variant: check_sfx_models(runtime, variant))


def test_concurrent_retries_keep_one_claim_and_new_intent_creates_one_more(tmp_path):
    native, service, _, _ = setup_service(tmp_path)
    with ThreadPoolExecutor(max_workers=4) as executor:
        replies = list(executor.map(lambda _: _run(service.submit(command())), range(8)))
    assert all(reply['receipt'] == replies[0]['receipt'] for reply in replies)
    assert len(native.dispatch_calls) == 1
    _run(service.submit(command('another-intent')))
    assert len(native.dispatch_calls) == 2
    changed = command()
    changed['input']['params']['duration_seconds'] = 4
    with pytest.raises(HTTPException) as conflict:
        _run(service.submit(changed))
    assert conflict.value.status_code == 409


def test_video_scope_and_inspected_duration_survive_admission(tmp_path, monkeypatch):
    native, service, runtime, _ = setup_service(tmp_path)
    source = tmp_path / 'source' / 'guide.mp4'
    source.parent.mkdir()
    source.write_bytes(b'inspected source video')
    monkeypatch.setattr('services.studio_sfx_resources.probe_media', lambda _path: {
        'duration': 6.25, 'width': 640, 'height': 360,
    })
    request = command()
    request['input']['params']['video_guide'] = '/api/v1/file/guide.mp4?workspace=source'
    _run(service.submit(request))
    job = native.dispatch_calls[0]
    assert job['params']['video_guide'] == str(source)
    assert job['params']['duration_seconds'] == 6.25
    record = native.registry('sound-output').command_admission(request['intent_id'])
    assert record['original'] == request
    assert record['effective']['resources'][0]['workspace'] == 'source'
    assert prepared_sfx_execution(job, job['params'], registry=native.registry('sound-output'),
                                  check_models=lambda variant: check_sfx_models(runtime, variant))
    source.unlink()
    with pytest.raises(ValueError, match='no longer available'):
        prepared_sfx_execution(job, job['params'], registry=native.registry('sound-output'),
                               check_models=lambda variant: check_sfx_models(runtime, variant))


def test_missing_dependency_prevents_admission_and_removed_dependency_stops_worker(tmp_path):
    native, service, runtime, weights = setup_service(tmp_path)
    first = _run(service.submit(command()))
    (weights / required_mmaudio_files('v2')[0]).unlink()
    replay = _run(service.submit(command()))
    assert replay == {"receipt": first['receipt'], "replayed": True}
    with pytest.raises(HTTPException) as missing:
        _run(service.submit(command('new-request')))
    assert missing.value.status_code == 409
    assert native.registry('sound-output').command_admission('new-request') is None
    job = native.dispatch_calls[0]
    with pytest.raises(ValueError, match='not installed'):
        prepared_sfx_execution(job, job['params'], registry=native.registry('sound-output'),
                               check_models=lambda variant: check_sfx_models(runtime, variant))


def test_provenance_alone_cannot_select_the_sfx_worker(tmp_path):
    native, service, _, _ = setup_service(tmp_path)
    _run(service.submit(command()))
    forged = deepcopy(native.dispatch_calls[0])
    forged['id'] = 'unadmitted'
    with pytest.raises(HTTPException) as mismatch:
        service.native_worker(forged)
    assert mismatch.value.status_code == 503
