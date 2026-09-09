"""Provider-free source and processor preparation for ``tools.upscale``.

The preparation boundary runs after the typed command has been frozen and
before the shared admission callback is invoked.  It uses the existing Tools
source resolver and WangGP processor validators, then returns a detached
native worker snapshot plus portable resource identities.  It never starts a
worker, calls an endpoint, downloads a model or writes an output.
"""

from __future__ import annotations

from copy import deepcopy
from collections.abc import Callable, Mapping
import os
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from pydantic import ValidationError

from services.image_generation_commands import command_error
from services.studio_image_resources import file_identity
from services.tools_upscale import TOOL_SOURCE_EXTENSIONS
from services.tools_upscale_spec import ToolsUpscaleParams


def _processor_defaults() -> tuple[Callable, Callable, Callable]:
    from shared.wangp1272 import processors

    return processors.capabilities, processors.validate_selection, processors.validated_settings


def _validated_params(params: Any) -> tuple[dict[str, Any], str]:
    if type(params) is not dict:
        raise command_error(422, "invalid_tools_upscale_input", "Tools upscale parameters must be an object")
    workspace = params.get("workspace")
    if not isinstance(workspace, str) or not workspace.strip():
        raise command_error(422, "invalid_workspace", "Use an explicit output workspace")
    try:
        parsed = ToolsUpscaleParams.model_validate(
            {key: value for key, value in params.items() if key != "workspace"}
        )
    except ValidationError as error:
        details = "; ".join(
            f"{'.'.join(str(part) for part in item.get('loc', ())) or 'input.params'}: "
            f"{item.get('msg') or 'Invalid value'}"
            for item in error.errors(include_input=False)
        )
        raise command_error(422, "invalid_tools_upscale_input", details) from error
    working = parsed.model_dump(mode="json")
    working["wangp_processor_settings"] = working.get("wangp_processor_settings") or {}
    working["workspace"] = workspace
    return working, workspace


def _call_source_resolver(resolver: Callable, params: dict[str, Any], kind: str):
    request = {
        "source": params["source"],
        "source_kind": kind,
        "workspace": params["workspace"],
    }
    # The legacy runtime resolver accepts asset_id separately.  Keep the
    # typed contract's single canonical ``source`` field while adapting only
    # this in-process call; the frozen receipt still contains the source ID.
    source = str(params["source"])
    if source.startswith(("asset_", "asset:", "asset-")):
        request["asset_id"] = source
        request.pop("source", None)
    elif source.startswith("/api/v1/assets/"):
        from services.tools_upscale_spec import _asset_id_from_reference

        request["asset_id"] = _asset_id_from_reference(source)
        request.pop("source", None)
    try:
        return resolver(request, expected_kinds=(kind,))
    except TypeError as first_error:
        try:
            return resolver(request)
        except TypeError:
            raise first_error


def _fallback_source(params: dict[str, Any], resources: Any):
    if str(params.get("source_kind")) != "image" or not hasattr(resources, "_media"):
        raise ValueError("A canonical Tools source resolver is required for this media kind")
    path, source_workspace = resources._media(params["source"])
    from services.tools_upscale_spec import _asset_id_from_reference

    return {
        "path": path,
        "filename": os.path.basename(os.fspath(path)),
        "source_workspace": source_workspace,
        "source_kind": "image",
        "asset_id": _asset_id_from_reference(str(params["source"])),
    }


def _source_fields(result: Any) -> dict[str, Any]:
    if isinstance(result, Mapping):
        values = {
            "path": result.get("path") or result.get("source_path") or result.get("resolved"),
            "filename": result.get("filename") or result.get("source_filename"),
            "source_workspace": result.get("source_workspace") or result.get("workspace"),
            "source_kind": result.get("source_kind") or result.get("kind"),
            "asset_id": result.get("asset_id") or result.get("source_asset_id"),
            "output_workspace": result.get("output_workspace"),
            "output_dir": result.get("output_dir"),
        }
    elif isinstance(result, (tuple, list)) and len(result) >= 4:
        values = {
            "path": result[0], "filename": result[1], "source_workspace": result[2],
            "source_kind": result[3], "asset_id": result[4] if len(result) > 4 else None,
            "output_workspace": result[5] if len(result) > 5 else None,
            "output_dir": result[6] if len(result) > 6 else None,
        }
    else:
        raise ValueError("The Tools source resolver returned an invalid result")
    return values


def _normalise_source(result: Any, expected_kind: str) -> dict[str, Any]:
    values = _source_fields(result)
    path = values["path"]
    if not isinstance(path, (str, os.PathLike)) or not os.fspath(path):
        raise ValueError("The selected Tools source is unavailable")
    path = os.fspath(path)
    filename = values["filename"] or os.path.basename(path)
    if not isinstance(filename, str) or os.path.basename(filename) != filename:
        raise ValueError("The selected source filename is invalid")
    source_workspace = values["source_workspace"]
    if not isinstance(source_workspace, str) or not source_workspace.strip():
        raise ValueError("The selected source has no source workspace")
    source_kind = values["source_kind"] or expected_kind
    if source_kind != expected_kind:
        raise ValueError("Source kind does not match the typed command")
    return {**values, "path": path, "filename": filename, "source_kind": source_kind}


def _confined_to_resource_root(path: str, source_workspace: str, resources: Any) -> None:
    root_factory = getattr(resources, "uploads_dir", None) if source_workspace == "__uploads__" else getattr(resources, "workspace_dir", None)
    if not callable(root_factory):
        return
    try:
        root = Path(root_factory() if source_workspace == "__uploads__" else root_factory(source_workspace)).resolve()
        resolved = Path(path).resolve()
    except (OSError, TypeError, ValueError) as error:
        raise ValueError("The selected source location is unavailable") from error
    if not resolved.is_relative_to(root) or resolved == root:
        raise ValueError("The selected source is outside its declared workspace")


def _check_source_path(source: dict[str, Any], resources: Any) -> Path:
    path = Path(source["path"])
    if not path.is_file():
        raise ValueError("The selected source is unavailable")
    _confined_to_resource_root(os.fspath(path), source["source_workspace"], resources)
    suffix = path.suffix.casefold()
    if suffix not in TOOL_SOURCE_EXTENSIONS[source["source_kind"]]:
        raise ValueError("Source kind does not match the file format")
    return path


def _inspect_image(path: Path) -> dict[str, Any]:
    from PIL import Image

    try:
        with Image.open(path) as picture:
            picture.verify()
        with Image.open(path) as picture:
            return {"format": picture.format, "width": picture.width, "height": picture.height}
    except (OSError, SyntaxError, ValueError) as error:
        raise ValueError("The selected image could not be decoded") from error


def _inspect_video(path: Path, probe_video: Callable | None) -> dict[str, Any]:
    probe = probe_video
    if probe is None:
        from services.video_editor import probe_media

        probe = probe_media
    try:
        metadata = probe(os.fspath(path))
    except Exception as error:
        raise ValueError("The selected video could not be inspected") from error
    if not isinstance(metadata, Mapping):
        raise ValueError("The video probe returned invalid metadata")
    try:
        duration = float(metadata.get("duration") or 0)
        width = int(metadata.get("width") or 0)
        height = int(metadata.get("height") or 0)
    except (TypeError, ValueError) as error:
        raise ValueError("The video probe returned invalid metadata") from error
    import math

    if not math.isfinite(duration) or duration <= 0 or width <= 0 or height <= 0:
        raise ValueError("The selected video has no readable duration or dimensions")
    return deepcopy(dict(metadata))


def _source_resource(source: dict[str, Any], path: Path, resources: Any, probe_video: Callable | None) -> dict[str, Any]:
    identity = file_identity(path)
    metadata = (_inspect_image(path) if source["source_kind"] == "image"
                else _inspect_video(path, probe_video))
    return {
        "role": "source",
        "index": 0,
        "url": source.get("url"),
        "workspace": source["source_workspace"],
        "kind": source["source_kind"],
        "filename": source["filename"],
        "asset_id": source.get("asset_id"),
        "media": metadata,
        **identity,
    }


def _resolve_reference(resources: Any, value: str):
    resolver = getattr(resources, "resolve_reference", None)
    if callable(resolver):
        try:
            return resolver(value, media_kind="image")
        except TypeError as first_error:
            try:
                return resolver(value)
            except TypeError:
                raise first_error
    media = getattr(resources, "_media", None)
    if callable(media):
        return media(value)
    raise ValueError("Processor references require the existing media resolver")


def _processor_reference_resources(settings: dict[str, Any], resources: Any) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    values = settings.get("spatial_upsampler_reference_images") or []
    if not values:
        return settings, []
    prepared: list[str] = []
    identities: list[dict[str, Any]] = []
    for index, value in enumerate(values):
        try:
            path, workspace = _resolve_reference(resources, value)
        except (OSError, TypeError, ValueError) as error:
            raise ValueError(f"Processor reference {index} is unavailable") from error
        path = Path(path)
        if not path.is_file():
            raise ValueError(f"Processor reference {index} is unavailable")
        _confined_to_resource_root(os.fspath(path), workspace, resources)
        identities.append({
            "role": "processor_reference", "index": index, "url": value,
            "workspace": workspace, **file_identity(path), "media": _inspect_image(path),
        })
        prepared.append(os.fspath(path))
    result = deepcopy(settings)
    result["spatial_upsampler_reference_images"] = prepared
    return result, identities


def _declared_parameters(method: str, resolver: Callable | None = None) -> dict[str, dict[str, Any]]:
    if resolver is not None:
        try:
            values = resolver(method)
        except (ImportError, AttributeError, RuntimeError):
            values = []
    else:
        try:
            from postprocessing.spatial_upsamplers import method_parameters

            values = method_parameters(method)
        except (ImportError, AttributeError, RuntimeError):
            values = []
    if isinstance(values, Mapping):
        values = values.values()
    if not isinstance(values, (list, tuple)):
        values = []
    return {
        str(item["name"]): item
        for item in values
        if isinstance(item, Mapping) and isinstance(item.get("name"), str)
    }


def _validate_processor_settings(method: str, settings: dict[str, Any], validator: Callable,
                                 parameter_resolver: Callable | None = None) -> dict[str, Any]:
    submitted = {key: value for key, value in settings.items() if value is not None}
    resolved = validator(method, submitted)
    if not isinstance(resolved, dict):
        raise ValueError("Processor settings validator returned an invalid object")
    declared = _declared_parameters(method, parameter_resolver)
    unsupported = set(submitted) - set(resolved)
    unsupported -= {
        key for key in unsupported
        if declared.get(key, {}).get("type") == "array"
    }
    if unsupported:
        raise ValueError("Processor settings contain values not declared by the selected processor")
    result = deepcopy(resolved)
    for key in set(submitted) - set(resolved):
        if declared.get(key, {}).get("type") != "array":
            continue
        result[key] = deepcopy(submitted[key])
    return result


def _validate_processor(method: str, source_kind: str, capabilities: Callable | None,
                        selection_validator: Callable, settings_validator: Callable,
                        settings: dict[str, Any], parameter_resolver: Callable | None = None) -> dict[str, Any]:
    temporal = method.startswith(("rife", "dlssg"))
    spatial_value, temporal_value = ("", method) if temporal else (method, "")
    error = selection_validator(spatial_value, temporal_value, source_kind == "image")
    if error:
        raise ValueError(str(error))
    if callable(capabilities):
        records = capabilities()
        if isinstance(records, (list, tuple)):
            selected = next((item for item in records if isinstance(item, Mapping) and item.get("value") == method), None)
            if selected is not None:
                if selected.get("enabled") is False:
                    raise ValueError("The selected processor is disabled")
                if source_kind not in selected.get("media", (source_kind,)):
                    raise ValueError("The selected processor does not support this source kind")
    return _validate_processor_settings(method, settings, settings_validator, parameter_resolver)


def _native_snapshot(working: dict[str, Any], source: dict[str, Any], path: Path,
                     settings: dict[str, Any]) -> dict[str, Any]:
    source_ref = {
        "id": source.get("asset_id"), "kind": source["source_kind"],
        "uri": source["filename"], "role": "source",
    }
    result = deepcopy(working)
    result.update({
        "source_path": os.fspath(path) if source["source_kind"] == "image" else None,
        "video_path": os.fspath(path) if source["source_kind"] == "video" else None,
        "source_filename": source["filename"],
        "source_workspace": source["source_workspace"],
        "source_asset_id": source.get("asset_id"),
        "model_type": "post_processing",
        "generation_mode": source["source_kind"],
        "provider": "local",
        "capability": "tools.upscale",
        "inputs": [source_ref],
        "parents": [source_ref],
        "transformations": [{
            "type": "upscale", "method": working["method"],
        }],
        "wangp_processor_settings": deepcopy(settings),
    })
    return result


def prepare_tools_upscale(
    params: dict[str, Any], *, resources: Any, resolve_source: Callable | None = None,
    execution_policy: Callable | None = None, processor_capabilities: Callable | None = None,
    validate_processors: Callable | None = None, processor_settings: Callable | None = None,
    processor_parameters: Callable | None = None, probe_video: Callable | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Resolve and inspect one typed Tools source before shared admission."""
    working, workspace = _validated_params(params)
    try:
        if execution_policy is not None:
            execution_policy(workspace)
        defaults = None
        if processor_capabilities is None or validate_processors is None or processor_settings is None:
            defaults = _processor_defaults()
        capabilities = processor_capabilities or defaults[0]
        selection_validator = validate_processors or defaults[1]
        settings_validator = processor_settings or defaults[2]
        resolver = resolve_source or getattr(resources, "resolve_source", None)
        kind = working["source_kind"]
        result = (_call_source_resolver(resolver, working, kind) if callable(resolver)
                  else _fallback_source(working, resources))
        source = _normalise_source(result, kind)
        source["url"] = working["source"]
        path = _check_source_path(source, resources)
        identities = [_source_resource(source, path, resources, probe_video)]
        # Resolve processor reference media first.  The native validator then
        # sees the exact confined paths it will receive, while the frozen
        # receipt retains submitted URLs and independent identities.
        settings, processor_refs = _processor_reference_resources(
            working["wangp_processor_settings"], resources
        )
        settings = _validate_processor(
            working["method"], kind, capabilities, selection_validator,
            settings_validator, settings, processor_parameters,
        )
        identities.extend(processor_refs)
        return _native_snapshot(working, source, path, settings), deepcopy(identities)
    except HTTPException:
        raise
    except (OSError, ValueError) as error:
        raise command_error(422, "invalid_tools_upscale_input", str(error)) from error


# Descriptive aliases used by adapter discovery and tests in the other command
# slices.  They all call this one preparation boundary.
prepare_tools_upscale_command = prepare_tools_upscale
prepare_tools_upscale_inputs = prepare_tools_upscale


__all__ = [
    "prepare_tools_upscale",
    "prepare_tools_upscale_command",
    "prepare_tools_upscale_inputs",
]
