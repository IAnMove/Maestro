"""Cross-transport and recovery checks for full Studio image admissions."""
from copy import deepcopy
import json
from pathlib import Path
import sqlite3

import pytest
from fastapi import HTTPException

from tests.test_image_generation_commands import FakeNative, _command, _command_app, _db_counts, _mcp_call, _run
from routers.image_generation_commands import image_command_catalog
from services.studio_image_spec import freeze_studio_image_spec, studio_image_schema


def studio_command(intent="studio-native-intent"):
    return {"version": 2, "operation": "generation.image", "intent_id": intent, "input": {
        "workspace": "workspace-a", "params": {
            "model_type": "pi_flux2", "prompt": '  Literal "mañana"\nsecond line  ',
            "resolution": "512x512", "num_inference_steps": 4, "seed": 42, "guidance_scale": 1.0,
            "image_refs": ["/api/v1/uploads/a.png", "/api/v1/file/b.png?workspace=source"],
            "activated_loras": ["one.safetensors", "two.safetensors"], "loras_multipliers": "0.7;0.3 0.4;0.5",
            "repeat_generation": 2, "batch_size": 1, "skip_steps_cache_type": "first_block",
            "skip_steps_multiplier": 0.08, "skip_steps_start_step_perc": 25,
            "spatial_upsampling": "lanczos*2", "film_grain_intensity": 0.2,
            "settings_version": 2.52,
        },
    }}


class StudioNative(FakeNative):
    def studio_prepare(self, params):
        self.preflight_calls += 1
        working = deepcopy(params)
        working["image_refs"] = ["/resolved/a.png", "/resolved/b.png"]
        return working, [{"role": "image_refs", "index": 0, "sha256": "a" * 64}]

    def service(self):
        service = super().service()
        service.prepare_studio = self.studio_prepare
        return service


def test_full_studio_snapshot_and_fingerprint_survive_http_mcp_replay(tmp_path):
    native = StudioNative(tmp_path)
    client = _command_app(native, tmp_path)
    command = studio_command()
    before = deepcopy(command)
    first = client.post("/api/v1/generation/commands", json=command)
    assert first.status_code == 200, first.text
    receipt = first.json()["receipt"]
    assert receipt["commandVersion"] == receipt["fingerprintVersion"] == 2
    assert receipt["contentFingerprint"] == freeze_studio_image_spec(command)["fingerprint"]
    arguments = {key: value for key, value in command.items() if key != "operation"}
    replay = _mcp_call(client, "generation.image", arguments).json()["result"]
    assert replay["isError"] is False
    assert replay["structuredContent"] == {"receipt": receipt, "replayed": True}
    assert len(native.dispatch_calls) == native.preflight_calls == 1
    entry = native.registry("workspace-a").command_admission(command["intent_id"])
    assert entry["fingerprint_version"] == 2
    assert entry["original"] == command == before
    assert entry["effective"]["input"]["params"]["image_refs"] == command["input"]["params"]["image_refs"]
    actual = entry["effective"]["runtime"]["params"]
    assert actual["image_refs"] == ["/resolved/a.png", "/resolved/b.png"]
    for key in ("prompt", "activated_loras", "loras_multipliers", "repeat_generation", "skip_steps_multiplier", "spatial_upsampling"):
        assert actual[key] == command["input"]["params"][key]
    assert entry["effective"]["resources"][0]["sha256"] == "a" * 64


def test_new_version_cannot_adopt_a_legacy_intention(tmp_path):
    native = StudioNative(tmp_path)
    service = native.service()
    _run(service.submit(_command("same-id")))
    with pytest.raises(HTTPException) as error:
        _run(service.submit(studio_command("same-id")))
    assert error.value.status_code == 409
    assert len(native.dispatch_calls) == 1


def test_invalid_studio_payload_rejects_before_preflight_and_task(tmp_path):
    native = StudioNative(tmp_path)
    command = studio_command()
    command["input"]["params"]["actor"] = "wizard"
    client = _command_app(native, tmp_path)
    response = client.post("/api/v1/generation/commands", json=command)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_command"
    assert native.preflight_calls == 0
    assert _db_counts(native.registry("workspace-a"))["tasks"] == 0


def test_studio_requires_an_installed_runtime_adapter(tmp_path):
    native = FakeNative(tmp_path)
    with pytest.raises(HTTPException) as error:
        _run(native.service().submit(studio_command()))
    assert error.value.status_code == 422
    assert error.value.detail["code"] == "unsupported_version"
    assert native.prepare_calls == 0


def test_studio_receipt_detects_corrupt_fingerprint_metadata(tmp_path):
    native = StudioNative(tmp_path)
    service = native.service()
    command = studio_command()
    _run(service.submit(command))
    registry = native.registry("workspace-a")
    with sqlite3.connect(registry.path) as connection:
        connection.execute("UPDATE task_command_admissions SET fingerprint_version = 1")
    with pytest.raises(HTTPException) as error:
        service.receipt("workspace-a", command["intent_id"])
    assert error.value.status_code == 503


def test_studio_preserves_collection_target_and_declared_workflow_context(tmp_path):
    native = StudioNative(tmp_path)
    client = _command_app(native, tmp_path)
    command = studio_command()
    command["input"]["workspace_collection_id"] = "collection-one"
    response = client.post("/api/v1/generation/commands", json=command, headers={
        "X-Hocus-UI-Surface": "wizard", "X-Hocus-UI-Context": json.dumps({"workflowId": "wf-one", "runId": "run-one"}),
    })
    assert response.status_code == 200, response.text
    provenance = native.dispatch_calls[0]["provenance"]
    assert provenance["actor"] == "wizard"
    assert provenance["workspace_id"] == "collection-one"
    assert provenance["command"] == {"command_id": command["intent_id"], "workflow_id": "wf-one", "run_id": "run-one"}
    different = deepcopy(command)
    different["input"]["workspace_collection_id"] = "collection-two"
    assert client.post("/api/v1/generation/commands", json=different).status_code == 409
    # Transport metadata on a retry cannot rewrite the original attribution.
    assert client.post("/api/v1/generation/commands", json=command).json()["replayed"] is True
    assert len(native.dispatch_calls) == 1
    entry = native.registry("workspace-a").command_admission(command["intent_id"])
    assert entry["effective"]["runtime"]["provenance"] == provenance


@pytest.mark.parametrize("context", ["{", '[]', '{"actor":"admin"}', '{"workspace_id":"elsewhere"}',
                                      '{"runId":false}', '{"workflowId":" "}', '{"runId":" padded "}'])
def test_invalid_ui_context_fails_before_any_admission(tmp_path, context):
    native = StudioNative(tmp_path)
    response = _command_app(native, tmp_path).post("/api/v1/generation/commands", json=studio_command(),
                                                headers={"X-Hocus-UI-Context": context})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_ui_context"
    assert native.preflight_calls == native.prepare_calls == 0


def test_reference_migration_is_read_only_and_does_not_guess_missing_names(tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from routers.image_generation_commands import create_image_generation_commands_router

    native = StudioNative(tmp_path)
    service = native.service()
    def exact_reference(value):
        if value == "/known/reference.png":
            return "/api/v1/file/reference.png?workspace=source"
        raise ValueError("Unknown exact reference")
    service.canonicalize_reference = exact_reference
    app = FastAPI()
    app.include_router(create_image_generation_commands_router(service))
    with TestClient(app) as client:
        response = client.post("/api/v1/generation/commands/references", json={"references": ["/known/reference.png"]})
        assert response.status_code == 200
        assert response.json() == {"references": ["/api/v1/file/reference.png?workspace=source"]}
        assert client.post("/api/v1/generation/commands/references", json={"references": ["reference.png"]}).status_code == 422
    assert native.preflight_calls == native.prepare_calls == 0


def test_image_catalog_projection_is_current_and_keeps_version_correlation():
    root = Path(__file__).resolve().parents[1]
    catalog = json.loads((root / "ui/src/api/imageCommandCatalog.json").read_text())
    assert catalog == {"version": 2, "operations": image_command_catalog(), "studio": studio_image_schema()}
    schema = catalog["operations"][0]["inputSchema"]
    assert schema["properties"]["version"]["enum"] == [1, 2]
    assert [entry["properties"]["version"]["const"] for entry in schema["oneOf"]] == [1, 2]
    assert schema["$defs"]["StudioCommandInput"]["additionalProperties"] is False
