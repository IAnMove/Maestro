"""Pure preflight tests for the typed Studio SFX adapter."""

from copy import deepcopy

import pytest
from fastapi import HTTPException

from services.studio_sfx_preparation import prepare_studio_sfx
from services.studio_sfx_resources import required_mmaudio_files


def params(**overrides):
    result = {
        "workspace": "sfx-output",
        "model_type": "mmaudio_v2",
        "prompt": "  rain\nwith thunder  ",
        "MMAudio_neg_prompt": "speech",
        "duration_seconds": 5.0,
        "video_guide": None,
    }
    result.update(overrides)
    return result


class FakeResources:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def prepare_media(self, incoming):
        self.calls.append(deepcopy(incoming))
        if self.error:
            raise self.error
        return deepcopy(self.result or (incoming, []))


def invoke(incoming, *, resources=None, downloaded=True, definition=None,
           policy_error=None, model_files=None):
    resources = resources or FakeResources()
    calls = {"policy": [], "definition": [], "downloaded": [], "files": []}

    def policy(workspace):
        calls["policy"].append(workspace)
        if policy_error:
            raise policy_error

    def model_definition(model_type):
        calls["definition"].append(model_type)
        return deepcopy(definition or {"architecture": "mmaudio"})

    def model_downloaded(model_type):
        calls["downloaded"].append(model_type)
        return downloaded

    def files(variant):
        calls["files"].append(variant)
        return model_files(variant) if callable(model_files) else model_files

    result = prepare_studio_sfx(
        incoming,
        model_definition=model_definition,
        model_downloaded=model_downloaded,
        resources=resources,
        execution_policy=policy,
        model_files=files if model_files is not None else None,
    )
    return result, calls, resources


def test_text_preparation_is_detached_and_sets_native_mmaudio_markers():
    incoming = params()
    before = deepcopy(incoming)
    (native, identities), calls, resources = invoke(incoming)
    assert incoming == before
    assert native is not incoming
    assert native["prompt"] == before["prompt"]
    assert native["MMAudio_prompt"] == before["prompt"]
    assert native["MMAudio_neg_prompt"] == "speech"
    assert native["_mmaudio_variant"] == "v2"
    assert native["MMAudio_setting"] == 1
    assert native["sfx_mode"] is True
    assert native["duration_source"] == "text"
    assert native["duration_seconds_requested"] == 5.0
    assert native["duration_seconds_effective"] == 5.0
    assert identities == []
    assert calls["policy"] == ["sfx-output"]
    assert calls["definition"] == ["mmaudio_v2"]
    assert calls["downloaded"] == ["mmaudio_v2"]
    assert resources.calls[0] == before


def test_video_preparation_uses_inspected_duration_and_keeps_requested_control():
    media = FakeResources(
        result=(
            {**params(duration_seconds=60, video_guide="/api/v1/file/guide.mp4?workspace=source"),
             "video_guide": "/srv/source/guide.mp4"},
            [{"role": "video_guide", "workspace": "source", "sha256": "guide-hash",
              "size_bytes": 12, "duration_seconds": 31.25, "width": 640, "height": 360}],
        )
    )
    (native, identities), _, _ = invoke(
        params(duration_seconds=60, video_guide="/api/v1/file/guide.mp4?workspace=source"),
        resources=media,
    )
    assert native["video_guide"] == "/srv/source/guide.mp4"
    assert native["duration_seconds"] == 31.25
    assert native["duration_seconds_requested"] == 60.0
    assert native["duration_seconds_effective"] == 31.25
    assert native["duration_source"] == "video"
    assert identities[0]["workspace"] == "source"
    assert identities[0]["sha256"] == "guide-hash"


def test_missing_selected_video_is_a_preflight_error_without_text_fallback():
    resources = FakeResources(error=ValueError("selected guide is missing"))
    with pytest.raises(HTTPException) as error:
        invoke(params(video_guide="/api/v1/file/missing.mp4?workspace=source"), resources=resources)
    assert error.value.status_code == 422
    assert "missing" in error.value.detail["message"]
    assert len(resources.calls) == 1


@pytest.mark.parametrize(
    ("definition", "downloaded", "status"),
    [
        ({"architecture": "ltx2"}, True, 422),
        ({"architecture": "mmaudio", "variant": "nsfw"}, True, 422),
        ({"architecture": "mmaudio"}, False, 409),
    ],
)
def test_model_definition_and_installed_state_are_checked_before_media(
    definition, downloaded, status
):
    resources = FakeResources()
    with pytest.raises(HTTPException) as error:
        invoke(params(), definition=definition, downloaded=downloaded, resources=resources)
    assert error.value.status_code == status
    assert resources.calls == []


def test_policy_runs_before_model_or_resource_inspection():
    resources = FakeResources()
    with pytest.raises(HTTPException) as error:
        invoke(params(), resources=resources, policy_error=HTTPException(403, "isolated workspace"))
    assert error.value.status_code == 403
    assert resources.calls == []


def test_optional_installed_file_report_requires_all_variant_dependencies():
    required = list(required_mmaudio_files("v2"))
    (native, _), calls, _ = invoke(params(), model_files=required)
    assert native["_mmaudio_variant"] == "v2"
    assert calls["files"] == ["v2"]

    missing = required[:-1]
    with pytest.raises(HTTPException) as error:
        invoke(params(), model_files=missing)
    assert error.value.status_code == 409


def test_model_file_callback_never_receives_host_paths_or_controls():
    seen = []

    def inspect(variant):
        seen.append(variant)
        return True

    invoke(params(), model_files=inspect)
    assert seen == ["v2"]


@pytest.mark.parametrize("duration", [0, -1, float("nan"), float("inf")])
def test_invalid_duration_fails_before_media(duration):
    resources = FakeResources()
    with pytest.raises(HTTPException) as error:
        invoke(params(duration_seconds=duration), resources=resources)
    assert error.value.status_code == 422
    assert resources.calls == []
