"""Provider-free tests for the closed Studio speech command envelope."""

from copy import deepcopy
import hashlib
import json
from pathlib import Path

import pytest

from services.studio_speech_spec import (
    STUDIO_SPEECH_DEFAULTS,
    StudioSpeechSpecError,
    freeze_studio_speech_spec,
    studio_speech_schema,
)


FIXTURE = Path(__file__).parent / "fixtures" / "studio_speech_native_request.json"


def speech_command(intent="speech-intent"):
    native = json.loads(FIXTURE.read_text())
    workspace = native.pop("workspace")
    return {
        "version": 2,
        "operation": "generation.speech",
        "intent_id": intent,
        "input": {"workspace": workspace, "params": native},
    }


def test_captured_studio_body_round_trips_without_trimming_or_dropping_fields():
    command = speech_command()
    before = deepcopy(command)
    frozen = freeze_studio_speech_spec(command)

    assert command == before
    assert frozen["original"] == before
    assert frozen["original"] is not command
    assert frozen["original"]["input"]["params"]["prompt"] == "The system is watching.\nEvery warning matters."
    assert frozen["effective"]["input"]["params"]["_tts_original_prompt"] == before["input"]["params"]["_tts_original_prompt"]
    assert frozen["effective"]["input"]["params"]["duration_seconds"] == 20.0
    assert set(before["input"]["params"]) <= set(frozen["effective"]["input"]["params"])


def test_effective_defaults_are_native_speech_selectors_and_original_omissions_survive():
    command = speech_command()
    params = command["input"]["params"]
    for key in (
        "generation_mode",
        "_audio_sub_mode",
        "video_length",
        "image_mode",
        "multi_prompts_gen_type",
        "negative_prompt",
        "repeat_generation",
        "activated_loras",
        "loras_multipliers",
    ):
        params.pop(key, None)
    params.pop("_tts_original_prompt")
    frozen = freeze_studio_speech_spec(command)
    effective = frozen["effective"]["input"]["params"]

    assert "generation_mode" not in command["input"]["params"]
    assert "_tts_original_prompt" not in command["input"]["params"]
    for key, value in STUDIO_SPEECH_DEFAULTS.items():
        assert effective[key] == value
    assert effective["_tts_original_prompt"] == params["prompt"]


@pytest.mark.parametrize("value", ["cinematic", 1, False, [], {}])
def test_prompt_enhancer_is_rejected_when_active_or_wrongly_typed(value):
    command = speech_command()
    command["input"]["params"]["prompt_enhancer"] = value

    with pytest.raises(StudioSpeechSpecError):
        freeze_studio_speech_spec(command)


@pytest.mark.parametrize("value", ["", None])
def test_prompt_enhancer_inactive_sentinels_are_preserved(value):
    command = speech_command()
    command["input"]["params"]["prompt_enhancer"] = value

    frozen = freeze_studio_speech_spec(command)

    assert frozen["effective"]["input"]["params"]["prompt_enhancer"] == value


def test_fingerprint_excludes_transport_intent_but_covers_workspace_and_native_content():
    first = freeze_studio_speech_spec(speech_command("one"))
    second = freeze_studio_speech_spec(speech_command("two"))
    assert first["fingerprint"] == second["fingerprint"]
    changed = speech_command("three")
    changed["input"]["params"]["prompt"] += " changed"
    assert freeze_studio_speech_spec(changed)["fingerprint"] != first["fingerprint"]
    other_workspace = speech_command("four")
    other_workspace["input"]["workspace"] = "another-workspace"
    assert freeze_studio_speech_spec(other_workspace)["fingerprint"] != first["fingerprint"]


def test_fingerprint_is_stable_and_uses_canonical_json():
    frozen = freeze_studio_speech_spec(speech_command())
    content = {
        "version": 2,
        "operation": "generation.speech",
        "input": frozen["effective"]["input"],
    }
    expected = hashlib.sha256(
        json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()
    assert frozen["fingerprint"] == expected
    assert len(frozen["fingerprint"]) == 64


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("generation_mode", "image"),
        ("_audio_sub_mode", "music"),
        ("image_mode", 1),
        ("video_length", 1),
        ("multi_prompts_gen_type", 1),
        ("minimax_h3_turbo_mode", True),
        ("audio_prompt_type", "A/host-path"),
    ],
)
def test_speech_mode_rejects_video_music_and_active_h3_values(field, value):
    command = speech_command()
    command["input"]["params"][field] = value
    with pytest.raises(StudioSpeechSpecError):
        freeze_studio_speech_spec(command)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("num_inference_steps", True),
        ("num_inference_steps", 1.0),
        ("_tts_voice_count", "1"),
        ("_tts_voice_count", True),
        ("duration_seconds", "20"),
        ("duration_seconds", float("nan")),
        ("temperature", True),
        ("top_k", 2.5),
        ("tts_dynaudnorm", 2),
    ],
)
def test_native_scalars_are_strict_and_finite(field, value):
    command = speech_command()
    command["input"]["params"][field] = value
    with pytest.raises(StudioSpeechSpecError):
        freeze_studio_speech_spec(command)


@pytest.mark.parametrize(
    "value",
    [
        "/etc/passwd",
        "../voice.wav",
        "C:\\voice.wav",
        "https://example.test/voice.wav",
        "/api/v1/file/voice.wav",
        "/api/v1/file/../voice.wav?workspace=speech-test",
        "/api/v1/uploads/voice.wav?workspace=other",
        "asset_abc?workspace=other",
    ],
)
def test_audio_references_are_canonical_and_workspace_explicit(value):
    command = speech_command()
    command["input"]["params"].update(
        {"audio_prompt_type": "A", "_tts_voice_count": 1, "audio_guide": value}
    )
    with pytest.raises(StudioSpeechSpecError):
        freeze_studio_speech_spec(command)


@pytest.mark.parametrize(
    "value",
    [
        "",
        None,
        "asset_abc123",
        "/api/v1/uploads/voice.wav",
        "/api/v1/file/voice.wav?workspace=speech-test",
        "/api/v1/assets/asset_abc123",
    ],
)
def test_audio_reference_sentinels_and_canonical_urls_are_retained(value):
    command = speech_command()
    command["input"]["params"].update(
        {"audio_prompt_type": "", "_tts_voice_count": 0, "audio_guide": value}
    )
    frozen = freeze_studio_speech_spec(command)
    assert frozen["original"]["input"]["params"]["audio_guide"] == value
    assert frozen["effective"]["input"]["params"]["audio_guide"] == value


def test_inactive_shared_state_is_retained_only_as_empty_sentinels():
    command = speech_command()
    params = command["input"]["params"]
    params.update(
        {
            "image_start": ["", ""],
            "image_refs": [],
            "h3_ref_videos": [],
            "spatial_upsampling": "",
            "wangp_processor_settings": {},
            "MMAudio_setting": 0,
            "MMAudio_prompt": None,
        }
    )
    frozen = freeze_studio_speech_spec(command)
    assert frozen["effective"]["input"]["params"]["image_start"] == ["", ""]
    assert frozen["effective"]["input"]["params"]["MMAudio_setting"] == 0
    params["image_start"] = ["/api/v1/uploads/image.png"]
    with pytest.raises(StudioSpeechSpecError):
        freeze_studio_speech_spec(command)


def test_custom_settings_are_closed_and_authority_fields_are_rejected():
    command = speech_command()
    command["input"]["params"]["custom_settings"] = {"auto_split_every_s": 5}
    frozen = freeze_studio_speech_spec(command)
    assert frozen["effective"]["input"]["params"]["custom_settings"] == {"auto_split_every_s": 5.0}
    for key, value in (("unknown", 1), ("provenance", {}), ("actor", "user")):
        invalid = speech_command()
        if key in {"provenance", "actor"}:
            invalid["input"]["params"][key] = value
        else:
            invalid["input"]["params"]["custom_settings"] = {key: value}
        with pytest.raises(StudioSpeechSpecError):
            freeze_studio_speech_spec(invalid)


def test_schema_exposes_closed_speech_boundary_and_supported_models():
    schema = studio_speech_schema()
    assert schema["version"] == 2
    assert schema["operation"] == "generation.speech"
    params_schema = schema["input"]["$defs"]["StudioSpeechParams"]
    assert params_schema["additionalProperties"] is False
    assert "_tts_original_prompt" in params_schema["properties"]
    assert "kugelaudio_0_open" in schema["speech_model_types"]
    assert "minimax_music3" not in schema["speech_model_types"]
    assert "provenance" in schema["excluded"]
