import copy
import math

import pytest

from services.character_face_patch import normalize_character_face_patch
from services.character_kit_library import (
    normalize_character_kit,
    patch_character_kit,
    read_character_kit_library,
)


def asset(asset_id="luma-base", source="2026-luma.png", *, kind="image"):
    return {
        "id": asset_id,
        "name": asset_id,
        "source": source,
        "kind": kind,
        "alphaStatus": "transparent",
        "reviewState": "approved",
    }


def face_patch(**updates):
    value = {
        "version": 1,
        "poseId": "base",
        "poseSource": "/api/v1/file/luma-base.png",
        "variantSource": "luma-mouth-wide.png",
        "sourceWidth": 2048,
        "sourceHeight": 2048,
        "region": {"x": 512, "y": 768, "size": 256},
        "feather": 0.12,
        "poseSha256": "a" * 64,
        "variantSha256": "b" * 64,
        "outputSha256": "c" * 64,
    }
    value.update(updates)
    return value


def kit_with_face_patch():
    return {
        "version": 1,
        "id": "luma",
        "name": "Luma",
        "style": "cutout",
        "base": asset(),
        "poses": {},
        "mouth": {
            "wide": {
                **asset("mouth-wide", "luma-mouth-wide.png", kind="overlay"),
                "facePatch": face_patch(),
            },
        },
        "eyes": {},
        "anchors": {},
        "provenance": [],
    }


def test_face_patch_normalization_is_exact_and_detached():
    value = face_patch(region={"x": 8, "y": 16, "size": 64})
    original = copy.deepcopy(value)

    normalized = normalize_character_face_patch(value)

    assert normalized == value
    assert normalized is not value
    assert normalized["region"] is not value["region"]
    normalized["region"]["x"] = 9
    assert value == original


@pytest.mark.parametrize(
    ("field", "invalid"),
    [
        ("version", 2),
        ("version", True),
        ("sourceWidth", 15),
        ("sourceWidth", 4097),
        ("sourceHeight", 15),
        ("sourceHeight", 4097),
        ("sourceWidth", True),
        ("sourceHeight", False),
        ("feather", -0.01),
        ("feather", 0.26),
        ("feather", math.nan),
        ("feather", math.inf),
        ("feather", 10**1000),
        ("feather", False),
    ],
)
def test_face_patch_rejects_invalid_versions_bounds_non_finite_and_booleans(field, invalid):
    value = face_patch(**{field: invalid})
    with pytest.raises(ValueError):
        normalize_character_face_patch(value)


@pytest.mark.parametrize(
    ("field", "invalid"),
    [
        ("region", {"x": -1, "y": 0, "size": 16}),
        ("region", {"x": 0, "y": -1, "size": 16}),
        ("region", {"x": 0, "y": 0, "size": 7}),
        ("region", {"x": 0, "y": 0, "size": 1025}),
        ("region", {"x": True, "y": 0, "size": 16}),
        ("region", {"x": 0, "y": False, "size": 16}),
        ("region", {"x": 0, "y": 0, "size": True}),
        ("region", {"x": 2000, "y": 0, "size": 256}),
        ("region", {"x": 0, "y": 2000, "size": 256}),
        ("region", {"x": 0, "y": 0, "size": 256, "extra": 1}),
    ],
)
def test_face_patch_rejects_invalid_region(field, invalid):
    value = face_patch(**{field: invalid})
    with pytest.raises(ValueError):
        normalize_character_face_patch(value)


@pytest.mark.parametrize("field", ["poseSource", "variantSource"])
@pytest.mark.parametrize(
    "source",
    [
        "blob:temporary",
        "data:image/png;base64,abc",
        "https://example.test/face.png",
        "/tmp/face.png",
        "faces/face.png",
    ],
)
def test_face_patch_rejects_transient_or_non_persistent_sources(field, source):
    value = face_patch(**{field: source})
    with pytest.raises(ValueError, match="persistent"):
        normalize_character_face_patch(value)


def test_face_patch_accepts_uploaded_sources_during_normalization():
    value = face_patch(
        poseSource="/api/v1/uploads/luma-base.png",
        variantSource="/api/v1/uploads/luma-mouth-wide.png",
    )

    normalized = normalize_character_face_patch(value)

    assert normalized["poseSource"] == "/api/v1/uploads/luma-base.png"
    assert normalized["variantSource"] == "/api/v1/uploads/luma-mouth-wide.png"


@pytest.mark.parametrize("field", ["poseSource", "variantSource"])
def test_face_patch_rejects_empty_uploaded_sources(field):
    with pytest.raises(ValueError, match="persistent"):
        normalize_character_face_patch(face_patch(**{field: "/api/v1/uploads/"}))


def test_face_patch_rejects_unknown_or_missing_fields():
    unknown = face_patch(extra="not allowed")
    missing = face_patch()
    del missing["outputSha256"]

    with pytest.raises(ValueError):
        normalize_character_face_patch(unknown)
    with pytest.raises(ValueError):
        normalize_character_face_patch(missing)


def test_face_patch_rejects_frames_over_pixel_budget():
    with pytest.raises(ValueError):
        normalize_character_face_patch(face_patch(sourceWidth=4096, sourceHeight=4096))


def test_face_patch_is_preserved_only_on_overlay_assets():
    kit = kit_with_face_patch()
    normalized = normalize_character_kit(kit)
    assert normalized["mouth"]["wide"]["facePatch"] == kit["mouth"]["wide"]["facePatch"]

    non_overlay = kit_with_face_patch()
    non_overlay["mouth"]["wide"]["kind"] = "image"
    with pytest.raises(ValueError, match="only valid for overlay"):
        normalize_character_kit(non_overlay)


def test_face_patch_round_trips_through_character_kit_library(tmp_path):
    saved = patch_character_kit(tmp_path, "luma", kit_with_face_patch(), base_revision=0)
    loaded = read_character_kit_library(tmp_path)

    expected = kit_with_face_patch()["mouth"]["wide"]["facePatch"]
    assert saved["kits"]["luma"]["mouth"]["wide"]["facePatch"] == expected
    assert loaded["kits"]["luma"]["mouth"]["wide"]["facePatch"] == expected


def test_face_patch_round_trips_uploaded_base_and_variant_sources(tmp_path):
    kit = kit_with_face_patch()
    kit["base"]["source"] = "/api/v1/uploads/luma-base.png"
    kit["mouth"]["wide"]["source"] = "/api/v1/uploads/luma-mouth-wide-patch.png"
    kit["mouth"]["wide"]["facePatch"] = face_patch(
        poseSource="/api/v1/uploads/luma-base.png",
        variantSource="/api/v1/uploads/luma-mouth-wide.png",
    )

    patch_character_kit(tmp_path, "luma", kit, base_revision=0)
    loaded = read_character_kit_library(tmp_path)

    assert loaded["kits"]["luma"]["base"]["source"] == "/api/v1/uploads/luma-base.png"
    overlay = loaded["kits"]["luma"]["mouth"]["wide"]
    assert overlay["source"] == "/api/v1/uploads/luma-mouth-wide-patch.png"
    assert overlay["facePatch"]["poseSource"] == "/api/v1/uploads/luma-base.png"
    assert overlay["facePatch"]["variantSource"] == "/api/v1/uploads/luma-mouth-wide.png"


def test_legacy_character_kit_assets_are_unchanged():
    value = kit_with_face_patch()
    del value["mouth"]["wide"]["facePatch"]

    normalized = normalize_character_kit(value)

    assert "facePatch" not in normalized["mouth"]["wide"]
