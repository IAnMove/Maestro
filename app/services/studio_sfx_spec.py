"""Closed, provider-free contract for a Studio sound-effects command.

Studio SFX is backed by the existing MMAudio worker.  The worker accepts a
video path (or ``None``), a positive and negative text prompt, a seed, a
duration and a text-conditioning weight.  This module freezes that small
native surface before model/resource lookup or task admission.

The versioned envelope is::

    {
        "version": 2,
        "operation": "generation.sfx",
        "intent_id": "...",
        "input": {
            "workspace": "...",
            "workspace_collection_id": "...",
            "params": {
                "model_type": "mmaudio_v2",
                "prompt": "...",
                "MMAudio_neg_prompt": "...",
                "duration_seconds": 5,
                "video_guide": "/api/v1/file/clip.mp4?workspace=source"
            }
        }
    }

``original`` is a detached copy of the submitted envelope.  ``effective``
contains only adapter-owned native sentinels and the derived MMAudio variant;
model defaults and media measurements are added by the pure preparation
boundary.  Host paths, provider payloads and authority flags never belong to
the caller's envelope.  A prepared worker map may contain an already-resolved
path, but that map is an internal handoff and is not the command snapshot.
"""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    StrictBool,
    StrictFloat,
    StrictInt,
    StrictStr,
    ValidationError,
    field_validator,
    model_validator,
)

from services.image_generation_spec import ImageGenerationSpecError
from services.studio_image_spec import _validate_reference


SCHEMA_VERSION = 2
FINGERPRINT_VERSION = 2
OPERATION = "generation.sfx"
STUDIO_SFX_SCHEMA_VERSION = SCHEMA_VERSION
STUDIO_SFX_OPERATION = OPERATION

_MAX_ID_LENGTH = 240
_MAX_INTENT_LENGTH = 160
_MAX_PROMPT_LENGTH = 200_000
_MAX_REFERENCE_LENGTH = 8_192
_MAX_SEED = 2**63 - 1
_MIN_SEED = -(2**63)

# These are the two exact virtual model IDs exposed by the Studio SFX
# selector.  The preparation layer maps them to the worker's model names and
# checks the complete installed-file set through a callback.
SFX_MODEL_TYPES = frozenset({"mmaudio_v2", "mmaudio_nsfw"})
SFX_VARIANTS = frozenset({"v2", "nsfw"})
SFX_MODEL_VARIANTS = {"mmaudio_v2": "v2", "mmaudio_nsfw": "nsfw"}

# These defaults are deterministic adapter selectors.  They do not describe
# model availability or model-derived timing; those facts belong to the
# preparation callback.  ``MMAudio_setting`` and ``sfx_mode`` are internal
# worker markers added to the effective projection.  A caller cannot use them
# to authorize execution or bypass the native admission path.
STUDIO_SFX_DEFAULTS: dict[str, Any] = {
    "generation_mode": "audio",
    "_audio_sub_mode": "sfx",
    "image_mode": 0,
    "video_length": 0,
    "num_inference_steps": 25,
    "guidance_scale": 4.5,
    "seed": -1,
    "MMAudio_neg_prompt": "",
    "sfx_text_weight": 1.0,
    "MMAudio_setting": 1,
    "sfx_mode": True,
}

SUPPORTED_INPUT_FIELDS = (
    "prompt",
    "MMAudio_prompt",
    "MMAudio_neg_prompt",
    "model_type",
    "_mmaudio_variant",
    "duration_seconds",
    "seed",
    "guidance_scale",
    "sfx_text_weight",
    "video_guide",
    "generation_mode",
    "_audio_sub_mode",
    "image_mode",
    "video_length",
    "num_inference_steps",
    "MMAudio_setting",
    "sfx_mode",
)

INACTIVE_SFX_FIELDS = (
    "generation_mode=audio",
    "_audio_sub_mode=sfx",
    "image_mode=0",
    "video_length=0",
    "audio_source=empty_or_null",
    "video_source=empty_or_null",
    "video_mask=empty_or_null",
    "MMAudio_setting=1 (server-derived marker)",
    "sfx_mode=true (server-derived marker)",
)

EXCLUDED_SFX_FIELDS = (
    "actor",
    "client",
    "permission",
    "provenance",
    "filesystem paths",
    "remote URLs",
    "free-form provider payloads",
    "video carrier model selection",
    "download controls",
    "queue or recovery controls",
)


class StudioSfxSpecError(ImageGenerationSpecError):
    """Validation error for the closed Studio SFX envelope."""


class _ClosedModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=False)


_Identity = Annotated[
    StrictStr,
    StringConstraints(min_length=1, max_length=_MAX_ID_LENGTH),
]
_Workspace = Annotated[
    StrictStr,
    StringConstraints(
        min_length=1,
        max_length=_MAX_ID_LENGTH,
        pattern=r"^(?:default|[A-Za-z0-9][A-Za-z0-9_-]*)$",
    ),
]
_WorkspaceCollectionId = Annotated[
    StrictStr,
    StringConstraints(min_length=1, max_length=200),
]
_IntentId = Annotated[
    StrictStr,
    StringConstraints(min_length=1, max_length=_MAX_INTENT_LENGTH),
]
_Text = Annotated[StrictStr, StringConstraints(max_length=_MAX_PROMPT_LENGTH)]
_NonBlankText = Annotated[
    StrictStr,
    StringConstraints(min_length=1, max_length=_MAX_PROMPT_LENGTH),
]
_ShortText = Annotated[StrictStr, StringConstraints(max_length=256)]
_Reference = Annotated[
    StrictStr,
    StringConstraints(min_length=1, max_length=_MAX_REFERENCE_LENGTH),
]
_Seed = Annotated[StrictInt, Field(ge=_MIN_SEED, le=_MAX_SEED)]
_Duration = Annotated[
    StrictFloat,
    Field(gt=0, allow_inf_nan=False),
]
_Guidance = Annotated[
    StrictFloat,
    Field(ge=0, le=1000, allow_inf_nan=False),
]
_TextWeight = Annotated[
    StrictFloat,
    Field(ge=0, le=5, allow_inf_nan=False),
]
_Steps = Annotated[StrictInt, Field(ge=25, le=25)]


class StudioSfxParams(_ClosedModel):
    """Typed native SFX parameters emitted by Studio."""

    # ``prompt`` is the shared Studio field.  ``MMAudio_prompt`` is the
    # worker-native spelling used by the existing SFX panel.  Exactly one is
    # enough; when both are supplied they must agree because the worker gives
    # MMAudio_prompt precedence.
    prompt: _Text | None = None
    mmaudio_prompt: _Text | None = Field(None, alias="MMAudio_prompt")
    mmaudio_negative_prompt: _Text = Field("", alias="MMAudio_neg_prompt")

    # Keep the catalog registration visible to MCP/UI discovery as an enum;
    # accepting an arbitrary model ID here would hide a carrier-model fallback
    # until the later semantic validator.
    model_type: Literal["mmaudio_v2", "mmaudio_nsfw"]
    # The virtual model ID is the authoritative selector.  This optional
    # legacy alias is accepted only when it agrees with that ID; it is derived
    # again in ``effective`` and is never trusted as an execution permission.
    mmaudio_variant: Literal["v2", "nsfw"] | None = Field(None, alias="_mmaudio_variant")

    # A text-only pass is limited to MMAudio's 20 second pass.  For a video
    # guide this value is the user's control/requested duration and is kept
    # separate from the inspected guide duration during preparation.
    duration_seconds: _Duration
    seed: _Seed = -1
    guidance_scale: _Guidance = 4.5
    sfx_text_weight: _TextWeight = 1.0
    num_inference_steps: _Steps = 25

    # The optional reference is an exact asset ID or canonical local API URL.
    # Resource preparation resolves it and replaces it with a confined worker
    # path only in the detached internal native map.
    video_guide: _Reference | Literal["", None] = None

    # Shared Studio sentinels.  Active values belong to other operations and
    # fail closed instead of selecting a carrier model or bypassing preflight.
    generation_mode: Literal["audio"] = "audio"
    audio_sub_mode: Literal["sfx"] = Field("sfx", alias="_audio_sub_mode")
    image_mode: Annotated[StrictInt, Field(ge=0, le=0)] = 0
    video_length: Annotated[StrictInt, Field(ge=0, le=0)] = 0

    # These two fields are present in the old SFX form body.  They are
    # validated as inert markers, then recomputed by the adapter in effective
    # so a JSON caller cannot authorize itself as a prepared/native request.
    mmaudio_setting: Literal[1] | None = Field(None, alias="MMAudio_setting")
    sfx_mode: StrictBool | None = None

    @field_validator("prompt", "mmaudio_prompt")
    @classmethod
    def _prompt_type(cls, value):
        return value

    @field_validator("video_guide")
    @classmethod
    def _canonical_video_reference(cls, value):
        if value in (None, ""):
            return value
        try:
            return _validate_reference(value)
        except ValueError as error:
            raise ValueError(str(error)) from error

    @model_validator(mode="after")
    def _check_semantics(self):
        prompt = self.prompt
        mmaudio_prompt = self.mmaudio_prompt
        if (prompt is None or not prompt.strip()) and (
            mmaudio_prompt is None or not mmaudio_prompt.strip()
        ):
            raise ValueError("prompt or MMAudio_prompt must contain a non-blank value")
        if (
            prompt is not None
            and mmaudio_prompt is not None
            and prompt != mmaudio_prompt
        ):
            raise ValueError("prompt and MMAudio_prompt must match when both are supplied")
        if self.model_type not in SFX_MODEL_TYPES:
            raise ValueError("model_type must be mmaudio_v2 or mmaudio_nsfw")
        # MMAudio's text-only worker path caps its requested duration at 20 s.
        # A video-guided request keeps its control value as provenance, while
        # preparation replaces the worker duration with the inspected guide
        # duration.  Do not apply the text-only cap to that control value.
        if self.video_guide in (None, "") and self.duration_seconds > 20:
            raise ValueError("text-only SFX duration_seconds must be at most 20 seconds")
        expected_variant = SFX_MODEL_VARIANTS[self.model_type]
        if self.mmaudio_variant is not None and self.mmaudio_variant != expected_variant:
            raise ValueError("_mmaudio_variant does not match model_type")
        if self.mmaudio_setting not in (None, 1):
            # Literal validation normally catches this; keep a semantic guard
            # for alternate Pydantic error paths and future aliases.
            raise ValueError("MMAudio_setting is an internal SFX marker")
        if self.sfx_mode not in (None, True):
            raise ValueError("sfx_mode is an internal SFX marker")
        return self


class StudioSfxInput(_ClosedModel):
    workspace: _Workspace
    workspace_collection_id: _WorkspaceCollectionId | None = None
    params: StudioSfxParams

    @model_validator(mode="after")
    def _check_collection_id(self):
        if self.workspace_collection_id is not None and not self.workspace_collection_id.strip():
            raise ValueError("workspace_collection_id must contain a non-blank value")
        return self


class _StudioSfxEnvelope(_ClosedModel):
    version: Literal[SCHEMA_VERSION]
    operation: Literal[OPERATION]
    intent_id: _IntentId
    input: StudioSfxInput

    @model_validator(mode="after")
    def _check_intent(self):
        if not self.intent_id.strip():
            raise ValueError("intent_id must contain a non-blank value")
        return self


def _validation_error(exc: ValidationError) -> StudioSfxSpecError:
    details: list[dict[str, Any]] = []
    messages: list[str] = []
    for error in exc.errors(include_input=False):
        location = ".".join(str(part) for part in error.get("loc", ())) or "command"
        message = str(error.get("msg") or "Invalid value")
        details.append({"loc": location, "message": message, "type": error.get("type")})
        messages.append(f"{location}: {message}")
    return StudioSfxSpecError(
        "; ".join(messages) or "Invalid Studio SFX generation command",
        details=details,
    )


def _canonical_content(effective: dict[str, Any]) -> dict[str, Any]:
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


def freeze_studio_sfx_spec(command: Any) -> dict[str, Any]:
    """Validate and detach one SFX command without I/O or side effects."""
    if type(command) is not dict:
        raise StudioSfxSpecError("Studio SFX generation command must be an object")
    try:
        envelope = _StudioSfxEnvelope.model_validate(command)
    except ValidationError as exc:
        raise _validation_error(exc) from exc

    original = deepcopy(command)
    explicit_params = envelope.input.params.model_dump(
        mode="json", by_alias=True, exclude_unset=True
    )
    effective_params = deepcopy(explicit_params)
    for key, value in STUDIO_SFX_DEFAULTS.items():
        effective_params.setdefault(key, deepcopy(value))

    # The worker reads MMAudio_prompt first.  Fill only the missing spelling;
    # an explicitly supplied value remains byte-for-byte unchanged.
    positive = effective_params.get("MMAudio_prompt") or effective_params.get("prompt")
    if not isinstance(effective_params.get("prompt"), str) or not effective_params["prompt"].strip():
        effective_params["prompt"] = positive
    if (
        not isinstance(effective_params.get("MMAudio_prompt"), str)
        or not effective_params["MMAudio_prompt"].strip()
    ):
        effective_params["MMAudio_prompt"] = positive
    model_type = effective_params["model_type"]
    effective_params["_mmaudio_variant"] = SFX_MODEL_VARIANTS[model_type]
    # Keep the requested control independent from the future guide duration.
    effective_params.setdefault(
        "duration_seconds_requested", effective_params["duration_seconds"]
    )
    effective_params.setdefault("duration_seconds_effective", None)
    effective_params.setdefault("duration_source", "video" if effective_params.get("video_guide") else "text")

    effective = {
        "version": SCHEMA_VERSION,
        "operation": OPERATION,
        "intent_id": envelope.intent_id,
        "input": {
            "workspace": envelope.input.workspace,
            "params": effective_params,
        },
    }
    explicit_input = envelope.input.model_dump(mode="json", exclude_unset=True)
    if "workspace_collection_id" in explicit_input:
        effective["input"]["workspace_collection_id"] = explicit_input["workspace_collection_id"]

    return {
        "original": original,
        "effective": effective,
        "fingerprint_version": FINGERPRINT_VERSION,
        "fingerprint": _fingerprint(_canonical_content(effective)),
    }


def studio_sfx_schema() -> dict[str, Any]:
    """Return the executable discovery schema for ``generation.sfx``."""
    input_schema = StudioSfxInput.model_json_schema()
    envelope_schema = _StudioSfxEnvelope.model_json_schema()
    return {
        "version": SCHEMA_VERSION,
        "operation": OPERATION,
        "intent_id": envelope_schema["properties"]["intent_id"],
        "input": input_schema,
        "supported_input_fields": list(SUPPORTED_INPUT_FIELDS),
        "sfx_model_types": sorted(SFX_MODEL_TYPES),
        "variants": sorted(SFX_VARIANTS),
        "effects": deepcopy(STUDIO_SFX_DEFAULTS),
        "limits": {
            "text_duration_seconds": {"exclusive_minimum": 0, "maximum": 20},
            "video_duration_seconds": "derived from inspected video_guide",
            "video_requested_duration_seconds": {"exclusive_minimum": 0},
        },
        "inactive": list(INACTIVE_SFX_FIELDS),
        "excluded": list(EXCLUDED_SFX_FIELDS),
    }


# Adapter/discovery aliases: these names all point at the one closed schema.
StudioSfxGenerationInput = StudioSfxInput
StudioSfxGenerationParams = StudioSfxParams
sfx_generation_schema_v2 = studio_sfx_schema
freeze_studio_sfx_command = freeze_studio_sfx_spec


__all__ = [
    "EXCLUDED_SFX_FIELDS",
    "FINGERPRINT_VERSION",
    "INACTIVE_SFX_FIELDS",
    "OPERATION",
    "SCHEMA_VERSION",
    "SFX_MODEL_TYPES",
    "SFX_MODEL_VARIANTS",
    "SFX_VARIANTS",
    "STUDIO_SFX_OPERATION",
    "STUDIO_SFX_SCHEMA_VERSION",
    "STUDIO_SFX_DEFAULTS",
    "SUPPORTED_INPUT_FIELDS",
    "StudioSfxGenerationInput",
    "StudioSfxGenerationParams",
    "StudioSfxInput",
    "StudioSfxParams",
    "StudioSfxSpecError",
    "freeze_studio_sfx_command",
    "freeze_studio_sfx_spec",
    "sfx_generation_schema_v2",
    "studio_sfx_schema",
]
