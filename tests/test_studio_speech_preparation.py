"""Provider-free tests for Studio speech model/resource preparation."""

from copy import deepcopy
import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from services.studio_speech_preparation import prepare_studio_speech


FIXTURE = Path(__file__).parent / "fixtures" / "studio_speech_native_request.json"

KUGEL_DEFINITION = {
    "audio_only": True,
    "image_outputs": False,
    "guidance_max_phases": 1,
    "no_negative_prompt": True,
    "inference_steps": False,
    "temperature": True,
    "duration_slider": {"min": 1, "max": 600, "default": 20},
    "audio_prompt_type_sources": {"selection": ["", "A", "AB"], "default": ""},
    "audio_mode_from_voice_count": True,
    "max_voice_count": 6,
    "custom_settings": [{"id": "auto_split_every_s", "type": "float", "min": 5, "max": 90}],
}


def base_params(**overrides):
    params = json.loads(FIXTURE.read_text())
    params.update(overrides)
    return params


class FakeResources:
    def __init__(self, *, media_result=None, lora_result=None, media_error=None):
        self.media_result = media_result
        self.lora_result = lora_result if lora_result is not None else []
        self.media_error = media_error
        self.media_calls = []
        self.lora_calls = []

    def prepare_media(self, params):
        self.media_calls.append(deepcopy(params))
        if self.media_error is not None:
            raise self.media_error
        return deepcopy(self.media_result if self.media_result is not None else (params, []))

    def prepare_loras(self, params, definition):
        self.lora_calls.append((deepcopy(params), deepcopy(definition)))
        return deepcopy(self.lora_result)


def invoke(
    params,
    *,
    definition=None,
    downloaded=True,
    resources=None,
    policy_error=None,
):
    definition = deepcopy(definition or KUGEL_DEFINITION)
    resources = resources or FakeResources()
    policy_calls = []
    definition_calls = []
    download_calls = []

    def model_definition(model_type):
        definition_calls.append(model_type)
        return deepcopy(definition)

    def model_downloaded(model_type):
        download_calls.append(model_type)
        return downloaded

    def policy(workspace):
        policy_calls.append(workspace)
        if policy_error is not None:
            raise policy_error

    result = prepare_studio_speech(
        params,
        model_definition=model_definition,
        model_downloaded=model_downloaded,
        resources=resources,
        execution_policy=policy,
    )
    return result, {
        "resources": resources,
        "policy_calls": policy_calls,
        "definition_calls": definition_calls,
        "download_calls": download_calls,
    }


def assert_http_error(error_info, *, status=422):
    assert error_info.value.status_code == status
    assert error_info.value.detail["code"] == (
        "model_unavailable" if status == 409 else "invalid_studio_speech_input"
    )
    return error_info.value.detail["message"]


def test_installed_speech_model_returns_detached_native_snapshot_and_resources():
    params = base_params()
    before = deepcopy(params)
    resources = FakeResources(
        media_result=(
            {**params, "duration_seconds": 20.0, "nested": {"keep": [1]}},
            [{"role": "audio_guide", "sha256": "audio-hash"}],
        ),
        lora_result=[{"role": "lora", "name": "voice-style", "sha256": "lora-hash"}],
    )

    (native, identities), calls = invoke(params, resources=resources)

    assert params == before
    assert native == resources.media_result[0]
    assert native is not resources.media_result[0]
    assert identities == [
        {"role": "audio_guide", "sha256": "audio-hash"},
        {"role": "lora", "name": "voice-style", "sha256": "lora-hash"},
    ]
    assert calls["policy_calls"] == ["speech-test"]
    assert calls["definition_calls"] == ["kugelaudio_0_open"]
    assert calls["download_calls"] == ["kugelaudio_0_open"]
    assert resources.media_calls[0] == before
    assert resources.lora_calls[0][0] == before
    native["nested"]["keep"].append(2)
    assert resources.media_result[0]["nested"] == {"keep": [1]}
    assert params == before


@pytest.mark.parametrize("model_type", ["minimax_music3", "ace_step_v1", "yue", "mmaudio_v2", "unknown_audio"])
def test_music_sfx_and_unknown_audio_models_are_not_speech(model_type):
    resources = FakeResources()
    params = base_params(model_type=model_type)
    with pytest.raises(HTTPException) as error:
        invoke(params, resources=resources)
    message = assert_http_error(error)
    assert "speech" in message.lower() or "music" in message.lower()
    assert resources.media_calls == resources.lora_calls == []


@pytest.mark.parametrize(
    ("definition", "downloaded", "status"),
    [
        ({**KUGEL_DEFINITION, "audio_only": False}, True, 422),
        ({**KUGEL_DEFINITION, "image_outputs": True}, True, 422),
        (KUGEL_DEFINITION, False, 409),
    ],
)
def test_model_must_be_installed_audio_only_and_downloaded(definition, downloaded, status):
    resources = FakeResources()
    with pytest.raises(HTTPException) as error:
        invoke(base_params(), definition=definition, downloaded=downloaded, resources=resources)
    assert_http_error(error, status=status)
    assert resources.media_calls == resources.lora_calls == []


def test_model_mode_default_is_declared_by_model_and_invalid_mode_fails_early():
    definition = {
        **KUGEL_DEFINITION,
        "model_modes": {"choices": [("English", "en"), ("Spanish", "es")], "default": "en"},
        "audio_mode_from_voice_count": False,
    }
    params = base_params()
    (native, _), _ = invoke(params, definition=definition)
    assert native["model_mode"] == "en"

    bad = base_params(model_mode="de")
    with pytest.raises(HTTPException) as error:
        invoke(bad, definition=definition)
    assert "model_mode" in assert_http_error(error)


def test_duration_zero_is_preserved_when_the_selected_model_declares_auto_duration():
    definition = {
        **KUGEL_DEFINITION,
        "audio_mode_from_voice_count": False,
        "inference_steps": True,
        "guidance_max_phases": 0,
        "temperature": False,
        "duration_slider": {"min": 0, "max": 60, "default": 0},
        "audio_prompt_type_sources": {"selection": ["", "A", "AB"], "default": ""},
    }
    params = base_params(
        model_type="dramabox_audio",
        duration_seconds=0,
        guidance_phases=0,
    )
    params.pop("temperature")
    (native, _), _ = invoke(params, definition=definition)
    assert native["duration_seconds"] == 0


def test_locked_scenema_step_count_is_preserved_even_without_an_editable_step_control():
    definition = {
        **KUGEL_DEFINITION,
        "audio_mode_from_voice_count": False,
        "inference_steps": False,
        "lock_inference_steps": True,
        "guidance_max_phases": 0,
        "temperature": False,
        "duration_slider": {"min": 1, "max": 1800, "default": 120},
        "audio_prompt_type_sources": {"selection": ["", "A2", "AB2"], "default": ""},
    }
    params = base_params(guidance_phases=0, num_inference_steps=8, temperature=None)
    (native, _), _ = invoke(params, definition=definition)
    assert native["num_inference_steps"] == 8


@pytest.mark.parametrize(
    ("params", "definition", "needle"),
    [
        (base_params(negative_prompt="forbidden"), KUGEL_DEFINITION, "negative_prompt"),
        (base_params(num_inference_steps=2), KUGEL_DEFINITION, "num_inference_steps"),
        (base_params(guidance_phases=2), KUGEL_DEFINITION, "guidance_phases"),
        (
            base_params(temperature=1),
            {**KUGEL_DEFINITION, "temperature": False},
            "temperature",
        ),
        (
            base_params(top_k=10),
            KUGEL_DEFINITION,
            "top_k",
        ),
    ],
)
def test_declared_native_capabilities_fail_before_resource_inspection(params, definition, needle):
    resources = FakeResources()
    with pytest.raises(HTTPException) as error:
        invoke(params, definition=definition, resources=resources)
    assert needle in assert_http_error(error)
    assert resources.media_calls == resources.lora_calls == []


def test_audio_prompt_selector_and_references_must_be_coherent():
    missing = base_params(audio_prompt_type="A", _tts_voice_count=1)
    with pytest.raises(HTTPException) as error:
        invoke(missing)
    assert "audio_guide" in assert_http_error(error)

    orphan = base_params(audio_prompt_type="", _tts_voice_count=1, audio_guide="/api/v1/uploads/voice.wav")
    with pytest.raises(HTTPException) as error:
        invoke(orphan)
    assert "audio_prompt_type" in assert_http_error(error)

    missing_second = base_params(
        audio_prompt_type="AB", _tts_voice_count=2,
        audio_guide="/api/v1/uploads/one.wav",
    )
    with pytest.raises(HTTPException) as error:
        invoke(missing_second)
    assert "audio_guide2" in assert_http_error(error)

    valid = base_params(
        audio_prompt_type="AB", _tts_voice_count=2,
        audio_guide="/api/v1/uploads/one.wav",
        audio_guide2="/api/v1/file/two.wav?workspace=speech-test",
    )
    resources = FakeResources()
    (native, _), _ = invoke(valid, resources=resources)
    assert native["audio_guide"] == valid["audio_guide"]
    assert native["audio_guide2"] == valid["audio_guide2"]
    assert resources.media_calls[0]["audio_guide2"] == valid["audio_guide2"]


def test_voice_mode_modifiers_are_preserved_while_the_declared_base_mode_is_checked():
    definition = {
        **KUGEL_DEFINITION,
        "audio_prompt_type_sources": {
            "selection": ["", "A2", "AB2"],
            "default": "",
            "custom_flags": {"2": "SeedVC"},
        },
        "audio_mode_from_voice_count": True,
        "max_voice_count": 2,
    }
    params = base_params(
        audio_prompt_type="AB2NV",
        _tts_voice_count=2,
        audio_guide="/api/v1/uploads/one.wav",
        audio_guide2="/api/v1/uploads/two.wav",
    )
    (native, _), _ = invoke(params, definition=definition)
    assert native["audio_prompt_type"] == "AB2NV"


def test_voice_count_cannot_exceed_model_declared_limit():
    params = base_params(_tts_voice_count=3, audio_prompt_type="AB")
    definition = {**KUGEL_DEFINITION, "max_voice_count": 2}
    with pytest.raises(HTTPException) as error:
        invoke(params, definition=definition)
    assert "voice" in assert_http_error(error).lower()


def test_custom_settings_use_model_metadata_for_keys_types_and_ranges():
    bad_range = base_params(custom_settings={"auto_split_every_s": 4})
    with pytest.raises(HTTPException) as error:
        invoke(bad_range)
    assert "minimum" in assert_http_error(error)

    bad_unknown = base_params(custom_settings={"not_declared": 1})
    with pytest.raises(HTTPException) as error:
        invoke(bad_unknown)
    assert "unknown" in assert_http_error(error)

    valid = base_params(custom_settings={"auto_split_every_s": 5.0})
    (native, _), _ = invoke(valid)
    assert native["custom_settings"] == valid["custom_settings"]


def test_loras_are_rejected_without_explicit_audio_lora_capability_and_resolved_when_enabled():
    params = base_params(activated_loras=["voice-style"])
    resources = FakeResources(lora_result=[{"role": "lora", "name": "voice-style"}])
    with pytest.raises(HTTPException) as error:
        invoke(params, resources=resources)
    assert "lora" in assert_http_error(error).lower()
    assert resources.media_calls == resources.lora_calls == []

    definition = {**KUGEL_DEFINITION, "enabled_audio_lora": True}
    (native, identities), _ = invoke(params, definition=definition, resources=resources)
    assert native["activated_loras"] == ["voice-style"]
    assert identities == [{"role": "lora", "name": "voice-style"}]
    assert len(resources.lora_calls) == 1


def test_resource_failure_is_wrapped_and_loras_are_not_looked_up_after_media_failure():
    resources = FakeResources(media_error=ValueError("bad voice reference"))
    with pytest.raises(HTTPException) as error:
        invoke(base_params(), resources=resources)
    assert "bad voice reference" in assert_http_error(error)
    assert len(resources.media_calls) == 1
    assert resources.lora_calls == []


def test_execution_policy_runs_before_model_lookup():
    resources = FakeResources()
    with pytest.raises(HTTPException) as error:
        invoke(
            base_params(),
            resources=resources,
            policy_error=HTTPException(409, {"code": "execution_policy", "message": "busy"}),
        )
    assert error.value.status_code == 409
    assert resources.media_calls == resources.lora_calls == []
