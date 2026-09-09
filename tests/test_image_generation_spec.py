"""Provider-free tests for the first shared text-to-image command."""

from copy import deepcopy
import json

import pytest

from services.image_generation_spec import (
    OPERATION,
    ImageGenerationSpecError,
    freeze_image_generation_spec,
    image_generation_schema,
)


def command(*, intent_id="wizard-command-1", **input_overrides):
    image_input = {
        "workspace": "workspace_with_underscores",
        "model_type": "pi_flux2",
        "prompt": '  Keep this literal: "mañana"\nline two  ',
        "negative_prompt": " avoid blur  ",
        "resolution": "512x512",
        "num_inference_steps": 4,
        "seed": -1,
        "guidance_scale": 1.0,
    }
    image_input.update(input_overrides)
    return {
        "version": 1,
        "operation": OPERATION,
        "intent_id": intent_id,
        "input": image_input,
    }


def test_freezes_original_and_adds_only_image_native_defaults():
    request = command()
    before = deepcopy(request)

    frozen = freeze_image_generation_spec(request)

    assert request == before
    assert frozen["original"] == before
    assert frozen["original"] is not request
    assert frozen["original"]["input"] is not request["input"]
    effective = frozen["effective"]
    assert effective["version"] == 1
    assert effective["operation"] == OPERATION
    assert effective["intent_id"] == request["intent_id"]
    assert effective["input"]["generation_mode"] == "image"
    assert effective["input"]["image_mode"] == 1
    assert effective["input"]["video_length"] == 1
    assert effective["input"]["multi_prompts_gen_type"] == 2
    assert effective["input"]["repeat_generation"] == 1
    assert effective["input"]["batch_size"] == 1
    assert effective["input"]["prompt_enhancer"] == ""
    assert effective["input"]["prompt"] == request["input"]["prompt"]
    assert effective["input"]["negative_prompt"] == request["input"]["negative_prompt"]
    assert effective["input"]["workspace"] == request["input"]["workspace"]
    assert effective["input"]["model_type"] == request["input"]["model_type"]

    request["input"]["prompt"] = "changed after validation"
    assert frozen["original"]["input"]["prompt"] == before["input"]["prompt"]
    assert frozen["effective"]["input"]["prompt"] == before["input"]["prompt"]


def test_omitted_contract_owned_selectors_are_present_only_in_effective():
    request = command()
    assert "image_mode" not in request["input"]
    assert "video_length" not in request["input"]

    frozen = freeze_image_generation_spec(request)

    assert "image_mode" not in frozen["original"]["input"]
    assert "video_length" not in frozen["original"]["input"]
    assert frozen["effective"]["input"]["image_mode"] == 1
    assert frozen["effective"]["input"]["video_length"] == 1


def test_explicit_native_selectors_must_be_the_image_values():
    assert freeze_image_generation_spec(command(image_mode=1, video_length=1))["effective"]["input"]["image_mode"] == 1
    for field, value in (("image_mode", 0), ("image_mode", 2), ("video_length", 0), ("video_length", 2)):
        with pytest.raises(ImageGenerationSpecError, match=field):
            freeze_image_generation_spec(command(**{field: value}))


def test_operation_is_the_explicit_mode_and_input_cannot_smuggle_another_mode():
    frozen = freeze_image_generation_spec(command())
    assert frozen["effective"]["input"]["generation_mode"] == "image"

    with pytest.raises(ImageGenerationSpecError, match="generation_mode"):
        freeze_image_generation_spec(command(generation_mode="video"))
    with pytest.raises(ImageGenerationSpecError, match="operation"):
        freeze_image_generation_spec({**command(), "operation": "generation.video"})


def test_fingerprint_excludes_transport_intent_id():
    first = freeze_image_generation_spec(command(intent_id="intent-one"))
    second = freeze_image_generation_spec(command(intent_id="intent-two"))

    assert first["effective"]["intent_id"] == "intent-one"
    assert second["effective"]["intent_id"] == "intent-two"
    assert first["fingerprint_version"] == 1
    assert first["fingerprint"] == second["fingerprint"]


def test_intent_id_is_exact_but_cannot_be_blank():
    exact = freeze_image_generation_spec(command(intent_id=" exact id "))
    assert exact["original"]["intent_id"] == " exact id "
    assert exact["effective"]["intent_id"] == " exact id "
    with pytest.raises(ImageGenerationSpecError, match="intent_id"):
        freeze_image_generation_spec(command(intent_id=" \n\t"))


@pytest.mark.parametrize("field", [
    "workspace",
    "model_type",
    "prompt",
    "resolution",
    "negative_prompt",
])
@pytest.mark.parametrize("bad", [None, True, 1, [], {}])
def test_text_fields_reject_null_boolean_and_non_string_types(field, bad):
    with pytest.raises(ImageGenerationSpecError, match=field):
        freeze_image_generation_spec(command(**{field: bad}))


@pytest.mark.parametrize("field", ["workspace", "model_type", "prompt", "resolution"])
def test_required_text_fields_reject_empty_or_all_blank_values(field):
    for value in ("", " \n\t"):
        with pytest.raises(ImageGenerationSpecError, match=field):
            freeze_image_generation_spec(command(**{field: value}))


@pytest.mark.parametrize("field", ["num_inference_steps", "seed"])
@pytest.mark.parametrize("bad", [None, True, False, 1.0, "1", [], {}])
def test_integer_fields_reject_null_boolean_float_and_coercible_types(field, bad):
    with pytest.raises(ImageGenerationSpecError, match=field):
        freeze_image_generation_spec(command(**{field: bad}))


@pytest.mark.parametrize("field", ["num_inference_steps", "image_mode", "video_length"])
@pytest.mark.parametrize("bad", [0, -1, 1.5, "1", True, None])
def test_positive_native_integer_fields_are_strict(field, bad):
    with pytest.raises(ImageGenerationSpecError, match=field):
        freeze_image_generation_spec(command(**{field: bad}))


@pytest.mark.parametrize("bad", [None, True, False, "1.0", [], {}, float("nan"), float("inf")])
def test_guidance_scale_rejects_non_finite_or_non_numeric_values(bad):
    with pytest.raises(ImageGenerationSpecError, match="guidance_scale"):
        freeze_image_generation_spec(command(guidance_scale=bad))


def test_seed_minus_one_is_preserved_as_native_random_seed():
    frozen = freeze_image_generation_spec(command(seed=-1))
    assert frozen["original"]["input"]["seed"] == -1
    assert frozen["effective"]["input"]["seed"] == -1


@pytest.mark.parametrize("field", ["num_inference_steps", "seed", "guidance_scale"])
def test_content_fingerprint_changes_when_effective_content_changes(field):
    first = freeze_image_generation_spec(command())
    changed_value = {
        "num_inference_steps": 5,
        "seed": 42,
        "guidance_scale": 2.0,
    }[field]
    second = freeze_image_generation_spec(command(**{field: changed_value}))
    assert first["fingerprint"] != second["fingerprint"]


def test_fingerprint_is_stable_and_has_no_client_or_intent_fields():
    frozen = freeze_image_generation_spec(command())
    content = {
        "version": 1,
        "operation": OPERATION,
        "input": frozen["effective"]["input"],
    }
    assert "intent_id" not in content
    assert "client" not in content
    assert len(frozen["fingerprint"]) == 64
    assert json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


@pytest.mark.parametrize("extra", [
    {"client": "wizard"},
    {"actor": "wizard"},
    {"permission": "admin"},
    {"provenance": {"actor": "wizard"}},
    {"image_refs": ["asset-1"]},
    {"image_guide": "guide.png"},
    {"activated_loras": ["style.safetensors"]},
    {"loras_multipliers": "1.0"},
    {"repeat_generation": 1},
    {"output_count": 1},
])
def test_unsupported_or_attributed_input_is_rejected_before_effect(extra):
    with pytest.raises(ImageGenerationSpecError, match="extra|Extra|input"):
        freeze_image_generation_spec(command(**extra))


@pytest.mark.parametrize("bad", [None, True, False, 1, "1", [], {}])
def test_envelope_fields_are_strict(bad):
    bad_fields = {
        "version": bad,
        "operation": bad,
        "intent_id": bad,
        "input": bad,
    }
    for field, value in bad_fields.items():
        request = command()
        # Keep valid sentinels out of the field-specific checks below.  The
        # envelope validator still handles the shared type boundary.
        if field == "version" and value == 1:
            value = 2
        if field == "operation" and value == "1":
            value = "generation.video"
        if field == "intent_id" and value == "1":
            value = ""
        if field == "input" and value == {}:
            value = []
        request[field] = value
        with pytest.raises(ImageGenerationSpecError):
            freeze_image_generation_spec(request)


def test_unknown_top_level_keys_are_rejected():
    request = command()
    request["client"] = "mcp"
    with pytest.raises(ImageGenerationSpecError, match="client"):
        freeze_image_generation_spec(request)


def test_schema_publishes_only_the_implemented_image_scope():
    schema = image_generation_schema()
    assert schema["version"] == 1
    assert schema["operation"] == OPERATION
    assert schema["input"]["additionalProperties"] is False
    assert set(schema["supported_input_fields"]) == {
        "workspace",
        "model_type",
        "prompt",
        "negative_prompt",
        "resolution",
        "num_inference_steps",
        "seed",
        "guidance_scale",
        "image_mode",
        "video_length",
    }
    assert "generation_mode" in schema["excluded"]
    assert "image_refs" in schema["excluded"]
    assert "activated_loras" in schema["excluded"]
    assert schema["effects"] == {
        "generation_mode": "image",
        "image_mode": 1,
        "video_length": 1,
        "multi_prompts_gen_type": 2,
        "repeat_generation": 1,
        "batch_size": 1,
        "prompt_enhancer": "",
    }
