"""Provider-free preparation for the closed Studio SFX command.

This boundary performs model catalog and installed-file checks through
injected callbacks, then asks :class:`StudioSfxResources` to resolve an
optional canonical video guide.  It never downloads MMAudio files, schedules a
task or mutates the submitted parameters.  The returned path-bearing mapping
is an internal handoff to the already-admitted native worker; resource
identities remain portable and are suitable for the durable receipt.
"""

from __future__ import annotations

from copy import deepcopy
import math
from collections.abc import Callable, Mapping
from typing import Any

from fastapi import HTTPException

from services.image_generation_commands import command_error
from services.studio_sfx_resources import (
    SFX_MODEL_VARIANTS,
    required_mmaudio_files,
)
from services.studio_sfx_spec import SFX_MODEL_TYPES


def _definition_for(model_definition, model_type: str) -> dict[str, Any]:
    if callable(model_definition):
        definition = model_definition(model_type)
    elif isinstance(model_definition, Mapping):
        definition = model_definition.get(model_type)
    else:
        definition = None
    if not isinstance(definition, Mapping):
        raise ValueError("Choose an installed MMAudio SFX model from the model catalog")
    return deepcopy(dict(definition))


def _validate_model_definition(
    model_type: str,
    definition: Mapping[str, Any],
    model_downloaded: Callable[[str], bool],
) -> str:
    if model_type not in SFX_MODEL_TYPES:
        raise ValueError("Choose a registered MMAudio SFX model")
    expected_variant = SFX_MODEL_VARIANTS[model_type]
    declared_type = definition.get("model_type")
    if declared_type is not None and declared_type != model_type:
        raise ValueError("The selected MMAudio model definition does not match its model ID")
    declared_variant = definition.get("mmaudio_variant", definition.get("variant"))
    if declared_variant is not None and declared_variant != expected_variant:
        raise ValueError("The selected MMAudio model definition does not match its variant")
    architecture = definition.get("architecture")
    if architecture is not None and str(architecture).lower() not in {"mmaudio", "mmaudio_sfx", "sfx"}:
        raise ValueError("The selected model definition is not an MMAudio SFX handler")
    if not callable(model_downloaded) or not model_downloaded(model_type):
        raise command_error(
            409,
            "model_unavailable",
            "Required MMAudio files are not installed; install them before submitting",
        )
    return expected_variant


def _validate_file_report(model_or_variant: str, report: Any) -> None:
    """Validate an optional trusted installed-file report without inspecting paths.

    ``model_downloaded`` remains the required boolean admission callback.  A
    caller may additionally supply ``model_files`` to expose the concrete
    relative names used by the installed-file check.  Accepted reports are a
    truthy boolean, a mapping with ``missing``/``available`` or an iterable of
    relative names.  Host paths and download controls are never interpreted.
    """
    required = set(required_mmaudio_files(model_or_variant))
    if isinstance(report, bool):
        if not report:
            raise command_error(
                409,
                "model_unavailable",
                "Required MMAudio files are not installed; install them before submitting",
            )
        return
    if isinstance(report, Mapping):
        if report.get("available") is False:
            raise command_error(
                409,
                "model_unavailable",
                "Required MMAudio files are not installed; install them before submitting",
            )
        missing = report.get("missing")
        if missing:
            if not isinstance(missing, (list, tuple, set)):
                raise ValueError("Installed MMAudio file report has an invalid missing list")
            raise command_error(
                409,
                "model_unavailable",
                "Required MMAudio files are not installed; install them before submitting",
            )
        names = report.get("files", report.get("available_files"))
        if names is None:
            return
        report = names
    if isinstance(report, (str, bytes)) or not isinstance(report, (list, tuple, set, frozenset)):
        raise ValueError("model_files must return an installed-file report")
    names = set(report)
    if any(not isinstance(item, str) for item in names):
        raise ValueError("model_files must contain relative file names")
    if required - names:
        raise command_error(
            409,
            "model_unavailable",
            "Required MMAudio files are not installed; install them before submitting",
        )


def _check_model_files(model_files, variant: str) -> None:
    if model_files is None:
        return
    if not callable(model_files):
        raise TypeError("model_files must be a trusted installed-file inspection callback")
    try:
        report = model_files(variant)
    except (OSError, TypeError, ValueError) as error:
        raise ValueError("Installed MMAudio files could not be inspected") from error
    _validate_file_report(variant, report)


def _finite_duration(value: Any, *, video: bool) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("input.params.duration_seconds must be a finite number")
    duration = float(value)
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("input.params.duration_seconds must be greater than zero")
    if not video and duration > 20:
        raise ValueError("text-only SFX duration_seconds must be at most 20 seconds")
    return duration


def _resource_duration(resources: list[dict[str, Any]]) -> float:
    guides = [item for item in resources if item.get("role") == "video_guide"]
    if len(guides) != 1:
        raise ValueError("A selected SFX video guide must produce one resource identity")
    duration = guides[0].get("duration_seconds")
    if isinstance(duration, bool) or not isinstance(duration, (int, float)):
        raise ValueError("A selected SFX video guide has no inspected duration")
    duration = float(duration)
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("A selected SFX video guide has no finite positive duration")
    return duration


def prepare_studio_sfx(
    params,
    *,
    model_definition,
    model_downloaded,
    resources,
    execution_policy,
    model_files=None,
):
    """Return detached native MMAudio parameters and portable identities.

    ``model_files`` is optional for compatibility with runtimes whose
    ``model_downloaded`` callback already checks the complete file set.  When
    supplied it must be a trusted, read-only callback for the derived variant;
    it is never a downloader.
    """
    if not isinstance(params, dict):
        raise command_error(422, "invalid_studio_sfx_input", "SFX parameters must be an object")
    working = deepcopy(params)
    try:
        workspace = working.get("workspace")
        if not isinstance(workspace, str) or not workspace.strip():
            raise ValueError("input.workspace must be an explicit output workspace")
        if not callable(execution_policy):
            raise TypeError("execution_policy must be a workspace policy callback")
        execution_policy(workspace)

        model_type = working.get("model_type")
        if not isinstance(model_type, str):
            raise ValueError("input.params.model_type must be a string")
        definition = _definition_for(model_definition, model_type)
        variant = _validate_model_definition(model_type, definition, model_downloaded)
        _check_model_files(model_files, variant)

        guide_selected = working.get("video_guide") not in (None, "")
        requested_duration = _finite_duration(
            working.get("duration_seconds"), video=guide_selected
        )
        prepared, media = resources.prepare_media(working)
        if not isinstance(prepared, dict) or not isinstance(media, list):
            raise ValueError("SFX resource preparation returned invalid native parameters")
        prepared = deepcopy(prepared)
        media = deepcopy(media)
        if guide_selected:
            effective_duration = _resource_duration(media)
            if prepared.get("video_guide") in (None, ""):
                raise ValueError("A selected SFX video guide was not preserved by resource preparation")
            prepared["duration_source"] = "video"
            prepared["duration_seconds_requested"] = requested_duration
            prepared["duration_seconds_effective"] = effective_duration
            # MMAudio's video path derives the actual duration from the guide.
            prepared["duration_seconds"] = effective_duration
        else:
            if prepared.get("video_guide") not in (None, ""):
                raise ValueError("Text-only SFX preparation unexpectedly retained a video guide")
            prepared["duration_source"] = "text"
            prepared["duration_seconds_requested"] = requested_duration
            prepared["duration_seconds_effective"] = requested_duration
            prepared["duration_seconds"] = requested_duration

        # These values select the already-registered native MMAudio worker.
        # They are generated here after model/resource checks, never trusted
        # from a caller as authority or a download permission.
        prepared["_mmaudio_variant"] = variant
        prepared["MMAudio_setting"] = 1
        prepared["sfx_mode"] = True
        prepared["generation_mode"] = "audio"
        prepared["_audio_sub_mode"] = "sfx"
        prepared["image_mode"] = 0
        prepared["video_length"] = 0
        prepared.setdefault("num_inference_steps", 25)
        prepared.setdefault("guidance_scale", 4.5)
        prepared.setdefault("seed", -1)
        prepared.setdefault("MMAudio_neg_prompt", "")
        prepared.setdefault("sfx_text_weight", 1.0)
        positive = prepared.get("MMAudio_prompt") or prepared.get("prompt")
        if not isinstance(positive, str) or not positive.strip():
            raise ValueError("input.params.prompt must contain a non-blank value")
        prepared["prompt"] = prepared.get("prompt") or positive
        prepared["MMAudio_prompt"] = prepared.get("MMAudio_prompt") or positive
        return prepared, media
    except HTTPException:
        raise
    except (OSError, TypeError, ValueError) as error:
        raise command_error(422, "invalid_studio_sfx_input", str(error)) from error


__all__ = ["prepare_studio_sfx"]
