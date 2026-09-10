"""Validation and normalization for Character Kit raster face patches."""

from __future__ import annotations

import math
import re
from typing import Any


MAX_FRAME_PIXELS = 4_194_304
MAX_REGION_PIXELS = 1_048_576
_FILE_SOURCE_PREFIX = "/api/v1/file/"
_UPLOAD_SOURCE_PREFIX = "/api/v1/uploads/"
_POSE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_FACE_PATCH_FIELDS = frozenset(
    {
        "version",
        "poseId",
        "poseSource",
        "variantSource",
        "sourceWidth",
        "sourceHeight",
        "region",
        "feather",
        "poseSha256",
        "variantSha256",
        "outputSha256",
    }
)
_REGION_FIELDS = frozenset({"x", "y", "size"})


def _require_exact_fields(value: dict[Any, Any], expected: frozenset[str], label: str) -> None:
    actual = set(value)
    unknown = actual - expected
    missing = expected - actual
    if unknown or missing:
        details = []
        if unknown:
            details.append(f"unknown {sorted(map(str, unknown))}")
        if missing:
            details.append(f"missing {sorted(missing)}")
        raise ValueError(f"{label} fields are invalid ({'; '.join(details)})")


def _string(value: Any, label: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{label} must be a string")
    if value != value.strip() or not value or len(value) > maximum or any(ord(char) < 32 for char in value):
        raise ValueError(f"{label} is invalid")
    return value


def _integer(value: Any, label: str, minimum: int, maximum: int | None = None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{label} must be an integer")
    if value < minimum or (maximum is not None and value > maximum):
        raise ValueError(f"{label} is out of range")
    return value


def _source(value: Any, label: str) -> str:
    source = _string(value, label, 1200)
    lowered = source.casefold()
    if lowered.startswith(("blob:", "data:")):
        raise ValueError(f"{label} must use a persistent source")

    for prefix in (_FILE_SOURCE_PREFIX, _UPLOAD_SOURCE_PREFIX):
        if source.startswith(prefix):
            if not source[len(prefix) :].strip():
                raise ValueError(f"{label} must use a persistent source")
            return source

    # A plain filename has no path separators, URI punctuation, or query
    # suffix. API paths are intentionally only classified here; they are not
    # resolved or treated as authority over a file on disk.
    if any(char in source for char in "/\\:?#") or source in {".", ".."}:
        raise ValueError(f"{label} must use a persistent source")
    return source


def _sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or _SHA256.fullmatch(value) is None:
        raise ValueError(f"{label} must be a lowercase SHA-256 digest")
    return value


def _feather(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("facePatch feather must be numeric")
    try:
        number = float(value)
    except (OverflowError, ValueError) as exc:
        raise ValueError("facePatch feather is out of range") from exc
    if not math.isfinite(number) or not 0 <= number <= 0.25:
        raise ValueError("facePatch feather is out of range")
    return number


def normalize_character_face_patch(value: Any) -> dict[str, Any]:
    """Validate and return a detached, canonical face-patch metadata object."""
    if not isinstance(value, dict):
        raise ValueError("facePatch must be an object")
    _require_exact_fields(value, _FACE_PATCH_FIELDS, "facePatch")

    version = _integer(value["version"], "facePatch version", 1, 1)
    pose_id = _string(value["poseId"], "facePatch poseId", 120)
    if _POSE_ID.fullmatch(pose_id) is None:
        raise ValueError("facePatch poseId is invalid")

    source_width = _integer(value["sourceWidth"], "facePatch sourceWidth", 16, 4096)
    source_height = _integer(value["sourceHeight"], "facePatch sourceHeight", 16, 4096)
    if source_width * source_height > MAX_FRAME_PIXELS:
        raise ValueError("facePatch source frame is too large")

    region = value["region"]
    if not isinstance(region, dict):
        raise ValueError("facePatch region must be an object")
    _require_exact_fields(region, _REGION_FIELDS, "facePatch region")
    region_x = _integer(region["x"], "facePatch region x", 0)
    region_y = _integer(region["y"], "facePatch region y", 0)
    region_size = _integer(region["size"], "facePatch region size", 8, 1024)
    if region_size * region_size > MAX_REGION_PIXELS:
        raise ValueError("facePatch region is too large")
    if region_x + region_size > source_width or region_y + region_size > source_height:
        raise ValueError("facePatch region must fit inside the source frame")

    return {
        "version": version,
        "poseId": pose_id,
        "poseSource": _source(value["poseSource"], "facePatch poseSource"),
        "variantSource": _source(value["variantSource"], "facePatch variantSource"),
        "sourceWidth": source_width,
        "sourceHeight": source_height,
        "region": {"x": region_x, "y": region_y, "size": region_size},
        "feather": _feather(value["feather"]),
        "poseSha256": _sha256(value["poseSha256"], "facePatch poseSha256"),
        "variantSha256": _sha256(value["variantSha256"], "facePatch variantSha256"),
        "outputSha256": _sha256(value["outputSha256"], "facePatch outputSha256"),
    }

__all__ = [
    "MAX_FRAME_PIXELS",
    "MAX_REGION_PIXELS",
    "normalize_character_face_patch",
]
