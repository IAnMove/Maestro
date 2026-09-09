"""Adversarial tests for the closed Studio SFX command envelope."""

from copy import deepcopy
import hashlib
import json

import pytest

from services.studio_sfx_spec import (
    StudioSfxSpecError,
    freeze_studio_sfx_spec,
    studio_sfx_schema,
)


def command(**overrides):
    params = {
        "model_type": "mmaudio_v2",
        "prompt": "  rain on a tin roof\nwith distant thunder  ",
        "duration_seconds": 7,
    }
    params.update(overrides)
    return {
        "version": 2,
        "operation": "generation.sfx",
        "intent_id": "sfx-intent-1",
        "input": {"workspace": "sfx-output", "params": params},
    }


def test_freeze_preserves_literal_original_and_derives_native_selectors():
    submitted = command(MMAudio_neg_prompt="speech, singing", seed=20260909)
    before = deepcopy(submitted)
    frozen = freeze_studio_sfx_spec(submitted)
    assert submitted == before
    assert frozen["original"] == before
    assert frozen["original"] is not submitted
    effective = frozen["effective"]["input"]["params"]
    assert effective["prompt"] == before["input"]["params"]["prompt"]
    assert effective["MMAudio_prompt"] == before["input"]["params"]["prompt"]
    assert effective["MMAudio_neg_prompt"] == "speech, singing"
    assert effective["_mmaudio_variant"] == "v2"
    assert effective["generation_mode"] == "audio"
    assert effective["_audio_sub_mode"] == "sfx"
    assert effective["MMAudio_setting"] == 1
    assert effective["sfx_mode"] is True
    assert effective["duration_seconds_requested"] == 7.0
    assert effective["duration_seconds_effective"] is None
    assert effective["duration_source"] == "text"


def test_mmaudio_prompt_spelling_is_preserved_and_mismatch_fails_closed():
    frozen = freeze_studio_sfx_spec(command(prompt=None, MMAudio_prompt="  exact\ntext  "))
    assert frozen["original"]["input"]["params"]["MMAudio_prompt"] == "  exact\ntext  "
    assert frozen["effective"]["input"]["params"]["prompt"] == "  exact\ntext  "

    with pytest.raises(StudioSfxSpecError, match="must match"):
        freeze_studio_sfx_spec(command(MMAudio_prompt="different"))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("generation_mode", "video"),
        ("_audio_sub_mode", "music"),
        ("image_mode", 1),
        ("video_length", 1),
        ("MMAudio_setting", 0),
        ("sfx_mode", False),
        ("_mmaudio_variant", "nsfw"),
        ("model_type", "carrier_video_model"),
        ("num_inference_steps", 24),
        ("guidance_scale", True),
        ("sfx_text_weight", float("nan")),
    ],
)
def test_incompatible_selectors_and_authority_markers_are_rejected(field, value):
    with pytest.raises(StudioSfxSpecError):
        freeze_studio_sfx_spec(command(**{field: value}))


@pytest.mark.parametrize(
    "value",
    [
        "/etc/passwd",
        "../guide.mp4",
        "C:\\guide.mp4",
        "https://example.test/guide.mp4",
        "/api/v1/file/guide.mp4",
        "/api/v1/file/../guide.mp4?workspace=source",
        "/api/v1/uploads/guide.mp4?workspace=source",
    ],
)
def test_video_guide_accepts_only_canonical_local_references(value):
    with pytest.raises(StudioSfxSpecError):
        freeze_studio_sfx_spec(command(video_guide=value))


@pytest.mark.parametrize("value", [None, "", "asset_video_123", "/api/v1/uploads/guide.mp4"])
def test_video_guide_sentinels_and_asset_references_remain_literal(value):
    frozen = freeze_studio_sfx_spec(command(video_guide=value))
    assert frozen["original"]["input"]["params"]["video_guide"] == value
    assert frozen["effective"]["input"]["params"]["video_guide"] == value


def test_text_only_duration_is_limited_but_video_control_is_preserved_for_preparation():
    with pytest.raises(StudioSfxSpecError, match="at most 20"):
        freeze_studio_sfx_spec(command(duration_seconds=20.01))
    frozen = freeze_studio_sfx_spec(
        command(duration_seconds=60, video_guide="/api/v1/file/long.mp4?workspace=source")
    )
    params = frozen["effective"]["input"]["params"]
    assert params["duration_seconds"] == 60.0
    assert params["duration_seconds_requested"] == 60.0
    assert params["duration_source"] == "video"
    assert params["duration_seconds_effective"] is None


def test_fingerprint_is_stable_and_excludes_intent_id():
    first = freeze_studio_sfx_spec(command())
    second_command = command()
    second_command["intent_id"] = "sfx-intent-2"
    second = freeze_studio_sfx_spec(second_command)
    assert first["fingerprint"] == second["fingerprint"]
    content = {
        "version": 2,
        "operation": "generation.sfx",
        "input": first["effective"]["input"],
    }
    expected = hashlib.sha256(
        json.dumps(content, ensure_ascii=False, sort_keys=True,
                   separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()
    assert first["fingerprint"] == expected


def test_collection_id_is_transport_metadata_and_is_fingerprinted():
    first = freeze_studio_sfx_spec(command())
    with_collection = command()
    with_collection["input"] = {
        **with_collection["input"],
        "workspace_collection_id": "collection-sfx-1",
    }
    second = freeze_studio_sfx_spec(with_collection)
    assert second["effective"]["input"]["workspace_collection_id"] == "collection-sfx-1"
    assert first["fingerprint"] != second["fingerprint"]


def test_unknown_provider_and_host_authority_fields_do_not_cross_closed_boundary():
    for field, value in (
        ("provider_payload", {"duration": 2}),
        ("provenance", {"actor": "wizard"}),
        ("actor", "wizard"),
        ("video_carrier_model", "ltx2"),
        ("download", True),
        ("workspace", "/tmp/private"),
    ):
        invalid = command()
        if field == "workspace":
            invalid["input"]["workspace"] = value
        else:
            invalid["input"]["params"][field] = value
        with pytest.raises(StudioSfxSpecError):
            freeze_studio_sfx_spec(invalid)


def test_schema_publishes_video_derived_duration_and_no_host_paths():
    schema = studio_sfx_schema()
    assert schema["version"] == 2
    assert schema["operation"] == "generation.sfx"
    params_schema = schema["input"]["$defs"]["StudioSfxParams"]
    assert params_schema["additionalProperties"] is False
    assert "video_guide" in params_schema["properties"]
    assert "maximum" not in params_schema["properties"]["duration_seconds"]
    assert schema["limits"]["text_duration_seconds"]["maximum"] == 20
    assert "video_duration_seconds" in schema["limits"]
    assert "filesystem paths" in schema["excluded"]


@pytest.mark.parametrize("blank", ["", " ", "\n"])
@pytest.mark.parametrize("field", ["prompt", "MMAudio_prompt"])
def test_explicit_blank_alias_cannot_override_the_other_literal(field, blank):
    submitted = command(prompt="literal sound", MMAudio_prompt="literal sound")
    submitted["input"]["params"][field] = blank
    before = deepcopy(submitted)
    with pytest.raises(StudioSfxSpecError, match="must match"):
        freeze_studio_sfx_spec(submitted)
    assert submitted == before
