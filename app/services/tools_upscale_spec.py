"""Closed, provider-free command contract for ``tools.upscale``.

The Tools worker already has a native implementation for spatial and temporal
upscaling.  This module only freezes the small transport boundary that lets
Wizard, Studio and an external agent submit that implementation through the
shared admission path.  It does not resolve a source, inspect a file, load a
processor or enqueue a job.

The envelope is::

    {
        "version": 2,
        "operation": "tools.upscale",
        "intent_id": "...",
        "input": {
            "workspace": "...",
            "workspace_collection_id": "...",
            "params": {
                "source": "asset_... or /api/v1/...",
                "source_kind": "image" or "video",
                "method": "lanczos2",
                "seed": -1,
                "wangp_processor_settings": { ... }
            }
        }
    }

``original`` is a detached copy of the submitted envelope.  ``effective``
adds only the deterministic seed/settings defaults and retains the source
spelling exactly.  The fingerprint covers operation, workspace and effective
parameters, excluding the transport intent and caller metadata.
"""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from typing import Annotated, Any, Literal
from urllib.parse import unquote, urlsplit

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    StrictInt,
    StrictStr,
    ValidationError,
    field_validator,
    model_validator,
)

from services.image_generation_spec import ImageGenerationSpecError
from services.studio_image_spec import WangpProcessorSettings, _validate_reference
from services.tools_upscale import TOOL_UPSCALE_METHODS


SCHEMA_VERSION = 2
FINGERPRINT_VERSION = 2
OPERATION = "tools.upscale"

_MAX_ID_LENGTH = 240
_MAX_INTENT_LENGTH = 160
_MAX_REFERENCE_LENGTH = 8192
_SEED_MIN = -(2**63)
_SEED_MAX = 2**63 - 1

TOOLS_UPSCALE_DEFAULTS: dict[str, Any] = {
    "seed": -1,
    "wangp_processor_settings": {},
}

SUPPORTED_SOURCE_KINDS = ("image", "video")
SUPPORTED_METHODS = tuple(sorted(TOOL_UPSCALE_METHODS))

# These processors are explicitly temporal or require a video in the existing
# Tools implementation.  The definitive availability/configuration decision
# remains the WangGP processor validator in the preparation boundary.
_VIDEO_ONLY_METHODS = frozenset(
    method
    for method in TOOL_UPSCALE_METHODS
    if method == "h3facerefine" or method.startswith(("rife", "dlssg"))
)


class ToolsUpscaleSpecError(ImageGenerationSpecError):
    """Validation error for the closed Tools upscale envelope."""


class _ClosedModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


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
_Source = Annotated[
    StrictStr,
    StringConstraints(min_length=1, max_length=_MAX_REFERENCE_LENGTH),
]
_Method = Annotated[
    StrictStr,
    StringConstraints(min_length=1, max_length=80),
]
_Seed = Annotated[StrictInt, Field(ge=_SEED_MIN, le=_SEED_MAX)]


class ToolsUpscaleParams(_ClosedModel):
    """Typed native input for one image or video upscale."""

    source: _Source
    source_kind: Literal["image", "video"]
    method: _Method
    seed: _Seed = -1
    wangp_processor_settings: WangpProcessorSettings | None = None

    @field_validator("source")
    @classmethod
    def _canonical_source(cls, value: str) -> str:
        # The shared image reference validator accepts exact asset IDs and the
        # same local API URL families used by Studio resources.  It rejects
        # absolute host paths, remote URLs, fragments, traversal and duplicate
        # source-workspace query values without changing caller spelling.
        try:
            return _validate_reference(value)
        except ValueError as error:
            raise ValueError(str(error)) from error

    @field_validator("method")
    @classmethod
    def _known_method(cls, value: str) -> str:
        if value not in TOOL_UPSCALE_METHODS:
            raise ValueError("method must be one of the installed Tools upscale methods")
        return value

    @model_validator(mode="after")
    def _check_media_method(self):
        if self.source_kind == "image" and self.method in _VIDEO_ONLY_METHODS:
            raise ValueError("the selected processor requires a video source")
        return self


class ToolsUpscaleInput(_ClosedModel):
    workspace: _Workspace
    # Collection identity is transport provenance. It is retained in the
    # receipt/fingerprint but is not forwarded as a native processor option.
    workspace_collection_id: _WorkspaceCollectionId | None = None
    params: ToolsUpscaleParams

    @model_validator(mode="after")
    def _check_collection_id(self):
        if self.workspace_collection_id is not None and not self.workspace_collection_id.strip():
            raise ValueError("workspace_collection_id must contain a non-blank value")
        return self

    @field_validator("workspace")
    @classmethod
    def _nonblank_workspace(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("input.workspace must be a non-blank output workspace")
        return value


class _ToolsUpscaleEnvelope(_ClosedModel):
    version: Literal[SCHEMA_VERSION]
    operation: Literal[OPERATION]
    intent_id: _IntentId
    input: ToolsUpscaleInput


def _validation_error(exc: ValidationError) -> ToolsUpscaleSpecError:
    details: list[dict[str, Any]] = []
    messages: list[str] = []
    for error in exc.errors(include_input=False):
        location = ".".join(str(part) for part in error.get("loc", ())) or "command"
        message = str(error.get("msg") or "Invalid value")
        details.append({"loc": location, "message": message, "type": error.get("type")})
        messages.append(f"{location}: {message}")
    return ToolsUpscaleSpecError(
        "; ".join(messages) or "Invalid Tools upscale command", details=details
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


def _asset_id_from_reference(value: str) -> str | None:
    """Return the exact asset ID represented by a source reference."""
    if value.startswith(("asset_", "asset:", "asset-")):
        return value
    parsed = urlsplit(value)
    if parsed.path.startswith("/api/v1/assets/") and not parsed.query:
        return unquote(parsed.path[len("/api/v1/assets/"):])
    return None


def freeze_tools_upscale_spec(command: Any) -> dict[str, Any]:
    """Validate and detach one Tools upscale command without side effects."""
    if type(command) is not dict:
        raise ToolsUpscaleSpecError("Tools upscale command must be an object")
    try:
        envelope = _ToolsUpscaleEnvelope.model_validate(command)
    except ValidationError as exc:
        raise _validation_error(exc) from exc

    if not envelope.intent_id.strip():
        raise ToolsUpscaleSpecError("intent_id must contain a non-blank value")

    original = deepcopy(command)
    explicit_params = envelope.input.params.model_dump(mode="json", exclude_unset=True)
    effective_params = deepcopy(explicit_params)
    for key, value in TOOLS_UPSCALE_DEFAULTS.items():
        effective_params.setdefault(key, deepcopy(value))
    effective = {
        "version": SCHEMA_VERSION,
        "operation": OPERATION,
        "intent_id": envelope.intent_id,
        "input": {
            "workspace": envelope.input.workspace,
            "params": effective_params,
        },
    }
    # Preserve omission versus an explicit null, matching the image and
    # speech command contracts. The collection id participates in the
    # content fingerprint because it identifies the intended collection.
    explicit_input = envelope.input.model_dump(mode="json", exclude_unset=True)
    if "workspace_collection_id" in explicit_input:
        effective["input"]["workspace_collection_id"] = explicit_input["workspace_collection_id"]
    return {
        "original": original,
        "effective": effective,
        "fingerprint_version": FINGERPRINT_VERSION,
        "fingerprint": _fingerprint(_canonical_content(effective)),
    }


def tools_upscale_schema() -> dict[str, Any]:
    """Return the executable v2 schema used by HTTP, MCP and discovery."""
    input_schema = ToolsUpscaleInput.model_json_schema()
    return {
        "version": SCHEMA_VERSION,
        "operation": OPERATION,
        "intent_id": {
            "type": "string",
            "minLength": 1,
            "maxLength": _MAX_INTENT_LENGTH,
        },
        "input": input_schema,
        "supported_input_fields": [
            "workspace",
            "workspace_collection_id",
            "source",
            "source_kind",
            "method",
            "seed",
            "wangp_processor_settings",
        ],
        "source_kinds": list(SUPPORTED_SOURCE_KINDS),
        "methods": list(SUPPORTED_METHODS),
        "effects": deepcopy(TOOLS_UPSCALE_DEFAULTS),
        "excluded": [
            "actor",
            "client",
            "permission",
            "provenance",
            "workspace inside input.params",
            "filesystem paths",
            "remote URLs",
            "free-form processor settings",
            "generation.image",
            "generation.speech",
        ],
    }


# Compatibility names used by the other shared-command slices.  They all
# point at this one contract and do not create a second schema version.
freeze_tools_upscale_command = freeze_tools_upscale_spec
tools_upscale_schema_v2 = tools_upscale_schema
ToolsUpscaleGenerationInput = ToolsUpscaleInput
ToolsUpscaleGenerationParams = ToolsUpscaleParams


__all__ = [
    "FINGERPRINT_VERSION",
    "OPERATION",
    "SCHEMA_VERSION",
    "SUPPORTED_METHODS",
    "SUPPORTED_SOURCE_KINDS",
    "TOOLS_UPSCALE_DEFAULTS",
    "ToolsUpscaleGenerationInput",
    "ToolsUpscaleGenerationParams",
    "ToolsUpscaleInput",
    "ToolsUpscaleParams",
    "ToolsUpscaleSpecError",
    "freeze_tools_upscale_command",
    "freeze_tools_upscale_spec",
    "tools_upscale_schema",
    "tools_upscale_schema_v2",
]
