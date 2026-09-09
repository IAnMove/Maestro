"""Provider-free contract tests for the Studio image preparation boundary."""

from copy import deepcopy

import pytest
from fastapi import HTTPException

from services.studio_image_preparation import prepare_studio_image


BASE_DEFINITION = {
    "image_outputs": True,
    "returns_audio": False,
    "guidance_max_phases": 1,
}


def base_params(**overrides):
    params = {
        "workspace": "studio-output",
        "model_type": "model-image",
        "prompt": '  literal "mañana"\nsecond line  ',
        "resolution": "512x512",
        "negative_prompt": "",
        "num_inference_steps": 4,
        "guidance_scale": 1.0,
        "guidance_phases": 1,
        "activated_loras": [],
        "loras_multipliers": "",
        "spatial_upsampling": "",
        "temporal_upsampling": "",
        "wangp_processor_settings": {},
    }
    params.update(overrides)
    return params


class FakeResources:
    def __init__(self, *, media_result=None, lora_result=None, media_error=None):
        self.media_result = media_result if media_result is not None else (
            {"workspace": "studio-output", "prompt": "literal"},
            [{"role": "image_refs", "sha256": "media-hash"}],
        )
        self.lora_result = lora_result if lora_result is not None else []
        self.media_error = media_error
        self.media_calls = []
        self.lora_calls = []

    def prepare_media(self, params):
        self.media_calls.append(deepcopy(params))
        if self.media_error is not None:
            raise self.media_error
        return deepcopy(self.media_result)

    def prepare_loras(self, params, model_definition):
        self.lora_calls.append((deepcopy(params), deepcopy(model_definition)))
        return deepcopy(self.lora_result)


def invoke(
    params,
    *,
    definition=None,
    downloaded=True,
    resources=None,
    execution_policy=None,
    processor_capabilities=None,
    validate_processors=None,
    processor_settings=None,
):
    definition = deepcopy(definition or BASE_DEFINITION)
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
        if execution_policy is not None:
            return execution_policy(workspace)
        return None

    capabilities = processor_capabilities or (lambda: [])
    selection = validate_processors or (lambda _spatial, _temporal, _image: "")
    settings = processor_settings or (lambda _method, values: deepcopy(values))
    result = prepare_studio_image(
        params,
        model_definition=model_definition,
        model_downloaded=model_downloaded,
        resources=resources,
        execution_policy=policy,
        processor_capabilities=capabilities,
        validate_processors=selection,
        processor_settings=settings,
    )
    return result, {
        "resources": resources,
        "policy_calls": policy_calls,
        "definition_calls": definition_calls,
        "download_calls": download_calls,
    }


def assert_http_error(error_info, *, status=422, code="invalid_studio_input"):
    assert error_info.value.status_code == status
    assert error_info.value.detail["code"] == code
    return error_info.value.detail["message"]


@pytest.mark.parametrize("values,definition,field", [
    ({"num_inference_steps": 1}, {"inference_steps_min": 4}, "num_inference_steps"),
    ({"num_inference_steps": 60}, {"inference_steps_max": 50}, "num_inference_steps"),
    ({"sample_solver": "unavailable"}, {"sample_solvers": [("Euler", "euler")]}, "sample_solver"),
    ({"skip_steps_cache_type": "first_block"}, {"first_block_cache": False}, "skip_steps_cache_type"),
])
def test_declared_model_option_limits_fail_before_resource_preparation(values, definition, field):
    resources = FakeResources()
    with pytest.raises(HTTPException) as error:
        invoke(base_params(**values), definition={**BASE_DEFINITION, **definition}, resources=resources)
    assert field in assert_http_error(error)
    assert resources.media_calls == resources.lora_calls == []


def test_declared_model_options_preserve_valid_sampling_and_cache_parameters():
    params = base_params(sample_solver="euler", skip_steps_cache_type="first_block", skip_steps_multiplier=0.08)
    resources = FakeResources(media_result=(deepcopy(params), []))
    (native, _), _ = invoke(params, definition={**BASE_DEFINITION, "sample_solvers": [("Euler", "euler")],
                                              "first_block_cache": True}, resources=resources)
    assert native == params


def test_empty_optional_frame_slots_do_not_request_model_conditioning():
    params = base_params(image_start=[""], image_end=["", ""], image_mask=[""])
    resources = FakeResources(media_result=(deepcopy(params), []))
    (native, _), _ = invoke(params, resources=resources)
    assert native == params


def test_installed_still_image_model_without_audio_returns_native_snapshot_and_resources():
    resources = FakeResources(
        media_result=(
            {"workspace": "studio-output", "prompt": '  literal "mañana"\nsecond line  ', "nested": {"keep": [1]}},
            [{"role": "image_refs", "sha256": "media-hash"}],
        ),
        lora_result=[{"role": "lora", "name": "style.safetensors", "sha256": "lora-hash"}],
    )
    params = base_params()
    before = deepcopy(params)

    (native, resources_out), calls = invoke(params, resources=resources)

    assert params == before
    assert native == resources.media_result[0]
    assert native is not resources.media_result[0]
    assert resources_out == [
        {"role": "image_refs", "sha256": "media-hash"},
        {"role": "lora", "name": "style.safetensors", "sha256": "lora-hash"},
    ]
    assert calls["policy_calls"] == ["studio-output"]
    assert calls["definition_calls"] == ["model-image"]
    assert calls["download_calls"] == ["model-image"]
    assert calls["resources"].media_calls == [before]
    assert calls["resources"].lora_calls[0][0] == before
    native["nested"]["keep"].append(2)
    assert resources.media_result[0]["nested"] == {"keep": [1]}
    assert params == before


@pytest.mark.parametrize(
    ("definition", "downloaded", "status", "code"),
    [
        ({"image_outputs": False, "returns_audio": False}, True, 422, "unsupported_model"),
        ({"image_outputs": True, "returns_audio": True}, True, 422, "unsupported_model"),
        ({"image_outputs": True, "returns_audio": False}, False, 409, "model_unavailable"),
    ],
)
def test_model_must_be_installed_image_only_and_non_audio(definition, downloaded, status, code):
    resources = FakeResources()
    with pytest.raises(HTTPException) as error:
        invoke(base_params(), definition=definition, downloaded=downloaded, resources=resources)

    assert_http_error(error, status=status, code=code)
    assert resources.media_calls == []
    assert resources.lora_calls == []


def test_unsupported_image_references_are_rejected_before_resource_lookup():
    resources = FakeResources()
    with pytest.raises(HTTPException) as error:
        invoke(
            base_params(image_refs=["/api/v1/uploads/ref.png"]),
            resources=resources,
        )

    assert "image_refs" in assert_http_error(error)
    assert resources.media_calls == []


def test_model_requiring_a_reference_rejects_missing_reference_at_model_boundary():
    resources = FakeResources()
    with pytest.raises(HTTPException) as error:
        invoke(
            base_params(),
            definition={**BASE_DEFINITION, "at_least_one_image_ref_needed": True},
            resources=resources,
        )

    assert_http_error(error, code="reference_required")
    assert resources.media_calls == []


def test_supported_reference_reaches_resource_preparation():
    resources = FakeResources(
        media_result=(
            {"workspace": "studio-output", "image_refs": ["/tmp/ref.png"]},
            [{"role": "image_refs", "sha256": "ref-hash"}],
        ),
    )
    params = base_params(image_refs=["/api/v1/uploads/ref.png"])
    definition = {
        **BASE_DEFINITION,
        "image_ref_choices": {"choices": [("Reference", "I")]},
    }

    (native, _resource_ids), _calls = invoke(params, definition=definition, resources=resources)

    assert native["image_refs"] == ["/tmp/ref.png"]
    assert resources.media_calls[0]["image_refs"] == ["/api/v1/uploads/ref.png"]


def test_model_without_negative_prompt_rejects_nonempty_negative_input():
    resources = FakeResources()
    with pytest.raises(HTTPException) as error:
        invoke(
            base_params(negative_prompt="must be rejected"),
            definition={**BASE_DEFINITION, "no_negative_prompt": True},
            resources=resources,
        )

    assert "negative_prompt" in assert_http_error(error)
    assert resources.media_calls == []


def test_guidance_phases_cannot_exceed_the_model_capability():
    resources = FakeResources()
    with pytest.raises(HTTPException) as error:
        invoke(
            base_params(guidance_phases=3),
            definition={**BASE_DEFINITION, "guidance_max_phases": 2},
            resources=resources,
        )

    assert "guidance_phases" in assert_http_error(error)
    assert resources.media_calls == []


def test_supported_guidance_phases_are_preserved_for_native_preparation():
    params = base_params(
        guidance_phases=2,
        activated_loras=["style.safetensors"],
        loras_multipliers="1;0",
    )
    (native, _resource_ids), _calls = invoke(
        params,
        definition={**BASE_DEFINITION, "guidance_max_phases": 2},
    )

    assert native == {"workspace": "studio-output", "prompt": "literal"}


def test_unknown_processor_settings_are_rejected_instead_of_silently_dropped():
    resources = FakeResources()
    params = base_params(
        spatial_upsampling="image-refiner",
        wangp_processor_settings={"unknown": 7},
    )
    capabilities = lambda: [{
        "value": "image-refiner",
        "kind": "spatial",
        "enabled": True,
        "media": ["image"],
    }]
    seen = []

    def settings(method, values):
        seen.append((method, deepcopy(values)))
        return {}

    with pytest.raises(HTTPException) as error:
        invoke(
            params,
            resources=resources,
            processor_capabilities=capabilities,
            processor_settings=settings,
        )

    assert "not supported" in assert_http_error(error)
    assert seen == [("image-refiner", {"unknown": 7})]
    assert resources.media_calls == []


@pytest.mark.parametrize(
    "capability",
    [
        {"value": "video-only", "kind": "spatial", "enabled": True, "media": ["video"]},
        {"value": "disabled-refiner", "kind": "spatial", "enabled": False, "media": ["image"]},
    ],
)
def test_processor_with_bad_media_or_disabled_status_is_rejected(capability):
    resources = FakeResources()
    with pytest.raises(HTTPException) as error:
        invoke(
            base_params(spatial_upsampling=capability["value"]),
            resources=resources,
            processor_capabilities=lambda: [capability],
        )

    assert "installed image processor" in assert_http_error(error)
    assert resources.media_calls == []


def test_processor_selection_error_is_propagated_as_invalid_input():
    resources = FakeResources()
    params = base_params(spatial_upsampling="image-refiner")
    capabilities = lambda: [{
        "value": "image-refiner",
        "kind": "spatial",
        "enabled": True,
        "media": ["image"],
    }]

    with pytest.raises(HTTPException) as error:
        invoke(
            params,
            resources=resources,
            processor_capabilities=capabilities,
            validate_processors=lambda _spatial, _temporal, _image: "bad media selection",
        )

    assert "bad media selection" in assert_http_error(error)
    assert resources.media_calls == []


def test_resource_media_failure_is_wrapped_before_loras_are_looked_up():
    resources = FakeResources(media_error=ValueError("bad media reference"))
    with pytest.raises(HTTPException) as error:
        invoke(base_params(), resources=resources)

    assert "bad media reference" in assert_http_error(error)
    assert resources.media_calls == [base_params()]
    assert resources.lora_calls == []
