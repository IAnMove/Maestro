"""Provider-free regressions for the typed Tools upscale envelope."""

from copy import deepcopy

import pytest

from services.tools_upscale_spec import (
    ToolsUpscaleSpecError,
    freeze_tools_upscale_spec,
    tools_upscale_schema,
)


def command(*, intent="intent-a", source="/api/v1/file/poster.png?workspace=source",
            source_kind="image", method="lanczos2", **params):
    native = {"source": source, "source_kind": source_kind, "method": method, **params}
    return {
        "version": 2,
        "operation": "tools.upscale",
        "intent_id": intent,
        "input": {"workspace": "destination", "params": native},
    }


def test_freeze_detaches_original_and_adds_only_deterministic_defaults():
    submitted = command()
    before = deepcopy(submitted)
    frozen = freeze_tools_upscale_spec(submitted)

    assert frozen["original"] == before
    assert frozen["original"] is not submitted
    assert frozen["effective"]["input"]["params"]["seed"] == -1
    assert frozen["effective"]["input"]["params"]["wangp_processor_settings"] == {}
    assert frozen["original"]["input"]["params"] == before["input"]["params"]
    submitted["input"]["params"]["source"] = "/api/v1/uploads/other.png"
    assert frozen["original"] == before


def test_fingerprint_excludes_intent_but_includes_source_kind_and_method():
    first = freeze_tools_upscale_spec(command(intent="one"))
    second = freeze_tools_upscale_spec(command(intent="two"))
    different_method = freeze_tools_upscale_spec(command(intent="three", method="lanczos1.5"))
    different_kind = freeze_tools_upscale_spec(
        command(intent="four", source="/api/v1/file/shot.mp4?workspace=source", source_kind="video")
    )

    assert first["fingerprint"] == second["fingerprint"]
    assert first["fingerprint"] != different_method["fingerprint"]
    assert first["fingerprint"] != different_kind["fingerprint"]


def test_collection_identity_is_preserved_and_fingerprinted():
    first_command = command()
    first_command["input"]["workspace_collection_id"] = "collection-one"
    second_command = command(intent="different-intent")
    second_command["input"]["workspace_collection_id"] = "collection-one"
    different_collection = command(intent="another-intent")
    different_collection["input"]["workspace_collection_id"] = "collection-two"

    first = freeze_tools_upscale_spec(first_command)
    second = freeze_tools_upscale_spec(second_command)
    other = freeze_tools_upscale_spec(different_collection)

    assert first["original"]["input"]["workspace_collection_id"] == "collection-one"
    assert first["effective"]["input"]["workspace_collection_id"] == "collection-one"
    assert "workspace_collection_id" not in first["effective"]["input"]["params"]
    assert first["fingerprint"] == second["fingerprint"]
    assert first["fingerprint"] != other["fingerprint"]
    first_command["input"]["workspace_collection_id"] = "changed-after-freeze"
    assert first["effective"]["input"]["workspace_collection_id"] == "collection-one"


def test_collection_identity_distinguishes_omission_from_explicit_null():
    omitted = freeze_tools_upscale_spec(command())
    explicit_null_command = command(intent="explicit-null")
    explicit_null_command["input"]["workspace_collection_id"] = None
    explicit_null = freeze_tools_upscale_spec(explicit_null_command)

    assert "workspace_collection_id" not in omitted["effective"]["input"]
    assert explicit_null["effective"]["input"]["workspace_collection_id"] is None
    assert omitted["fingerprint"] != explicit_null["fingerprint"]


@pytest.mark.parametrize("value", ["", "   ", True, 12, [], {}])
def test_collection_identity_is_strict_and_nonblank(value):
    values = command()
    values["input"]["workspace_collection_id"] = value
    with pytest.raises(ToolsUpscaleSpecError, match="workspace_collection_id"):
        freeze_tools_upscale_spec(values)


@pytest.mark.parametrize(
    "bad",
    [
        {"source": "/tmp/poster.png"},
        {"source": "https://remote.invalid/poster.png?workspace=source"},
        {"source": "/api/v1/file/../poster.png?workspace=source"},
        {"source": "/api/v1/file/poster.png?workspace=source&workspace=source"},
        {"source": "/api/v1/file/poster.png"},
        {"source": "/api/v1/uploads/poster.png?workspace=source"},
        {"method": "unknown"},
        {"seed": True},
        {"seed": 1.0},
        {"wangp_processor_settings": {"unknown": 1}},
        {"wangp_processor_settings": {"spatial_upsampler_strength": float("nan")}},
    ],
)
def test_freeze_rejects_noncanonical_or_untyped_values_before_effects(bad):
    values = command()
    values["input"]["params"].update(bad)
    with pytest.raises(ToolsUpscaleSpecError):
        freeze_tools_upscale_spec(values)


def test_video_only_method_is_rejected_for_image_source():
    with pytest.raises(ToolsUpscaleSpecError, match="video source"):
        freeze_tools_upscale_spec(command(method="rife2"))


def test_processor_prompt_and_references_are_value_preserving():
    prompt = "Face line 1\n  Face line 2  "
    source = "/api/v1/file/ref.png?workspace=source"
    frozen = freeze_tools_upscale_spec(command(
        method="h3facerefine",
        source_kind="video",
        source="/api/v1/file/shot.mp4?workspace=source",
        wangp_processor_settings={
            "spatial_upsampler_prompt": prompt,
            "spatial_upsampler_reference_images": [source],
        },
    ))

    settings = frozen["effective"]["input"]["params"]["wangp_processor_settings"]
    assert settings["spatial_upsampler_prompt"] == prompt
    assert settings["spatial_upsampler_reference_images"] == [source]


def test_schema_publishes_only_the_closed_tools_surface():
    schema = tools_upscale_schema()
    params = schema["input"]["$defs"]["ToolsUpscaleParams"]
    assert schema["version"] == 2
    assert schema["operation"] == "tools.upscale"
    assert params["additionalProperties"] is False
    assert set(schema["supported_input_fields"]) == {
        "workspace", "workspace_collection_id", "source", "source_kind", "method", "seed",
        "wangp_processor_settings",
    }
    assert "actor" in schema["excluded"]
    assert "filesystem paths" in schema["excluded"]
