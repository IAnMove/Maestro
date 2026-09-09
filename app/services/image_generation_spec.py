"""Strict, provider-free contract for the first shared image command.

This module freezes a text-to-image command before any runtime or queue effect.
It deliberately owns no model catalog, scheduler, request journal, filesystem
path or provenance authority.  The canonical runtime must resolve model
availability and trusted provenance after this boundary.

The transport envelope is::

    {"version": 1, "operation": "generation.image", "intent_id": "...",
     "input": {"workspace": "...", "model_type": "...", "prompt": "...",
               "resolution": "...", "num_inference_steps": 1,
               "seed": -1, "guidance_scale": 1.0}}

``original`` is a detached copy of the validated caller envelope.  ``effective``
adds the native image selectors (``generation_mode=image``, ``image_mode=1``
and ``video_length=1``) without rewriting the original.  The content
fingerprint is over the effective operation and input only; transport identity
(``intent_id``) and client metadata are excluded.  Client metadata is rejected
instead of being accepted or attributed by this module.

The initial scope intentionally excludes references, LoRAs, output counts,
post-processing, audio/video/avatar fields and model3d.  They need explicit
contracts and resource validation before they can be added here.
"""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, StrictFloat, StrictInt, ValidationError


SCHEMA_VERSION = 1
OPERATION = "generation.image"
FINGERPRINT_VERSION = 1
NATIVE_IMAGE_DEFAULTS = {
    "generation_mode": "image", "image_mode": 1, "video_length": 1,
    "multi_prompts_gen_type": 2, "repeat_generation": 1, "batch_size": 1,
    "prompt_enhancer": "",
}

_MAX_ID_LENGTH = 240
_MAX_INTENT_LENGTH = 160
_MAX_PROMPT_LENGTH = 200_000

# This list is the public native subset for the first vertical.  In particular,
# image_mode and video_length are adapter-owned defaults and are accepted only
# as the exact image values; refs/LoRAs are intentionally absent.
SUPPORTED_INPUT_FIELDS = (
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
)


class ImageGenerationSpecError(ValueError):
    """Safe validation error with field paths and no submitted values."""

    def __init__(self, message: str, *, details: list[dict[str, Any]] | None = None):
        super().__init__(message)
        self.details = list(details or [])


class _StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


_Identity = Annotated[
    str,
    StringConstraints(strict=True, min_length=1, max_length=_MAX_ID_LENGTH),
]
_Workspace = Annotated[
    str,
    StringConstraints(strict=True, min_length=1, max_length=_MAX_ID_LENGTH,
                      pattern=r"^(?:default|[A-Za-z0-9][A-Za-z0-9_-]*)$"),
]
_IntentId = Annotated[
    str,
    StringConstraints(strict=True, min_length=1, max_length=_MAX_INTENT_LENGTH),
]
_Prompt = Annotated[
    str,
    StringConstraints(strict=True, min_length=1, max_length=_MAX_PROMPT_LENGTH),
]
_NegativePrompt = Annotated[
    str,
    StringConstraints(strict=True, max_length=_MAX_PROMPT_LENGTH),
]
_Resolution = Annotated[
    str,
    StringConstraints(strict=True, min_length=1, max_length=128),
]
_Steps = Annotated[StrictInt, Field(ge=1, le=1000)]
_Seed = Annotated[StrictInt, Field(ge=-(2**63), le=2**63 - 1)]
_Guidance = Annotated[
    StrictFloat,
    Field(ge=0, le=1000, allow_inf_nan=False),
]
_ImageSelector = Annotated[StrictInt, Field(ge=1, le=1)]


class ImageGenerationInput(_StrictInput):
    """Strict input fields supported by ``generation.image``.

    Defaults on ``negative_prompt``, ``image_mode`` and ``video_length`` are
    contract-owned.  ``exclude_unset=True`` is used for the original input so
    omitted fields remain omitted there, while the effective native map has
    all three deterministic defaults.
    """

    workspace: _Workspace
    model_type: _Identity
    prompt: _Prompt
    negative_prompt: _NegativePrompt = ""
    resolution: _Resolution
    num_inference_steps: _Steps
    seed: _Seed
    guidance_scale: _Guidance
    image_mode: _ImageSelector = 1
    video_length: _ImageSelector = 1


class _ImageGenerationEnvelope(_StrictInput):
    version: Literal[SCHEMA_VERSION]
    operation: Literal[OPERATION]
    intent_id: _IntentId
    input: dict[str, Any]


def _validation_error(exc: ValidationError) -> ImageGenerationSpecError:
    details: list[dict[str, Any]] = []
    messages: list[str] = []
    for error in exc.errors(include_input=False):
        location = ".".join(str(part) for part in error.get("loc", ())) or "command"
        message = str(error.get("msg") or "Invalid value")
        details.append({"loc": location, "message": message, "type": error.get("type")})
        messages.append(f"{location}: {message}")
    return ImageGenerationSpecError("; ".join(messages) or "Invalid image generation command", details=details)


def _require_non_blank(value: str, field: str) -> None:
    # Preserve all characters exactly; only reject an identifier/text field
    # that contains no meaningful character.  No trimming is written back.
    if not value.strip():
        raise ImageGenerationSpecError(f"{field} must contain a non-blank value")


def _validate_semantics(parsed: ImageGenerationInput) -> None:
    _require_non_blank(parsed.workspace, "input.workspace")
    _require_non_blank(parsed.model_type, "input.model_type")
    _require_non_blank(parsed.prompt, "input.prompt")
    _require_non_blank(parsed.resolution, "input.resolution")


def _canonical_content(effective: dict[str, Any]) -> dict[str, Any]:
    """Return only content-bearing fields used for the stable fingerprint."""
    return {
        "version": SCHEMA_VERSION,
        "operation": OPERATION,
        "input": deepcopy(effective["input"]),
    }


def _fingerprint(content: dict[str, Any]) -> str:
    encoded = json.dumps(
        content,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def freeze_image_generation_spec(command: Any) -> dict[str, Any]:
    """Validate and freeze one image command without causing an effect.

    The returned dictionaries are detached snapshots.  ``intent_id`` remains
    in the effective transport projection so the caller can bind it to a
    durable receipt, but it is excluded from ``fingerprint``.  A different
    intent with identical effective input therefore has the same content
    fingerprint and remains eligible for an intentional second execution.
    """
    if type(command) is not dict:
        raise ImageGenerationSpecError("Image generation command must be an object")
    if type(command.get("version")) is not int:
        raise ImageGenerationSpecError("version must be the integer 1")
    if type(command.get("operation")) is not str:
        raise ImageGenerationSpecError("operation must be generation.image")
    if type(command.get("intent_id")) is not str:
        raise ImageGenerationSpecError("intent_id must be a non-empty string")
    if type(command.get("input")) is not dict:
        raise ImageGenerationSpecError("input must be an object")

    try:
        envelope = _ImageGenerationEnvelope.model_validate(command)
        parsed = ImageGenerationInput.model_validate(envelope.input)
    except ValidationError as exc:
        raise _validation_error(exc) from exc

    _require_non_blank(envelope.intent_id, "intent_id")
    _validate_semantics(parsed)
    # Keep the validated caller envelope byte-for-byte at the value level:
    # spelling, omission and numeric representation are part of the receipt's
    # original snapshot.  Pydantic validation above has already rejected any
    # unknown or type-invalid field before this copy is returned.
    original = deepcopy(command)

    effective_input = parsed.model_dump(mode="json")
    effective_input.update(NATIVE_IMAGE_DEFAULTS)
    effective = {
        "version": SCHEMA_VERSION,
        "operation": OPERATION,
        "intent_id": envelope.intent_id,
        "input": effective_input,
    }
    content = _canonical_content(effective)
    return {
        "original": original,
        "effective": effective,
        "fingerprint_version": FINGERPRINT_VERSION,
        "fingerprint": _fingerprint(content),
    }


def image_generation_schema() -> dict[str, Any]:
    """Publish the versioned, implemented input surface for catalog adapters."""
    input_schema = ImageGenerationInput.model_json_schema()
    return {
        "version": SCHEMA_VERSION,
        "operation": OPERATION,
        "intent_id": {
            "type": "string",
            "minLength": 1,
            "maxLength": _MAX_INTENT_LENGTH,
        },
        "input": input_schema,
        "supported_input_fields": list(SUPPORTED_INPUT_FIELDS),
        "effects": deepcopy(NATIVE_IMAGE_DEFAULTS),
        "excluded": [
            "client",
            "actor",
            "permission",
            "provenance",
            "image_refs",
            "image_guide",
            "activated_loras",
            "loras_multipliers",
            "repeat_generation",
            "output_count",
            "generation_mode",
            "model3d",
            "video",
            "audio",
            "avatar",
        ],
    }


__all__ = [
    "FINGERPRINT_VERSION",
    "ImageGenerationInput",
    "ImageGenerationSpecError",
    "OPERATION",
    "SCHEMA_VERSION",
    "SUPPORTED_INPUT_FIELDS",
    "freeze_image_generation_spec",
    "image_generation_schema",
]
