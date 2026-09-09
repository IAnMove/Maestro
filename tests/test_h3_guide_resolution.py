"""Studio enhance vs Director polish share video stems; loaders stay distinct."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from services.director.prompt_polish import get_image_guide, get_video_guide
from services.enhance_guides import get_enhance_guide
from services.guide_resolution import VIDEO_GUIDE_STEMS, match_guide_stem


FIXTURE = Path(__file__).resolve().parent / "fixtures" / "h3_guide_resolution_expected.json"

_VIDEO_MODELS = (
    "minimax_h3",
    "minimax_h3_full",
    "minimax_h3_legacy",
    "minimax_h3_fused_turbo",
    "minimax_h3_ref2va",
    "minimax_h3_ref2va_fused_turbo",
    "ltx2_22B",
    "wan_2_2",
    "t2v",
)
_IMAGE_MODELS = ("flux2", "qwen_image", "qwen_image_edit")


def _sha(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _digest(model: str, generation_mode: str) -> dict[str, dict[str, object]]:
    rows: dict[str, dict[str, object]] = {}
    for has_images in (False, True):
        guide = get_enhance_guide(model, generation_mode, has_images)
        rows[f"enhance:{model}:img={has_images}"] = {
            "sha256": _sha(guide),
            "len": len(guide or ""),
        }
    return rows


def test_shared_video_stems_keep_h3_ref2va_distinct():
    assert match_guide_stem("minimax_h3_fused_turbo") == "minimax_h3_video"
    assert match_guide_stem("minimax_h3_legacy") == "minimax_h3_video"
    assert match_guide_stem("minimax_h3_ref2va_fused_turbo") == "minimax_h3_ref2va_video"
    assert VIDEO_GUIDE_STEMS["minimax_h3_ref2va"] != VIDEO_GUIDE_STEMS["minimax_h3"]


def test_resolved_guides_match_frozen_base():
    expected = json.loads(FIXTURE.read_text(encoding="utf-8"))["guides"]
    actual: dict[str, dict[str, object]] = {}
    for model in _VIDEO_MODELS:
        actual.update(_digest(model, "video"))
        for mode in ("full", "light"):
            guide = get_video_guide(model, mode)
            actual[f"video:{model}:{mode}"] = {
                "sha256": _sha(guide),
                "len": len(guide or ""),
            }
    for model in _IMAGE_MODELS:
        actual.update(_digest(model, "image"))
        for mode in ("full", "light"):
            guide = get_image_guide(model, mode)
            actual[f"image:{model}:{mode}"] = {
                "sha256": _sha(guide),
                "len": len(guide or ""),
            }
    assert actual == expected
    h3_full = actual["video:minimax_h3:full"]["sha256"]
    h3_light = actual["video:minimax_h3:light"]["sha256"]
    assert h3_full != h3_light
    assert actual["enhance:minimax_h3:img=False"]["sha256"] == h3_full
    assert actual["video:minimax_h3_ref2va:full"]["sha256"] != h3_full
    # Director image map stays on the edit guide even without images.
    assert actual["enhance:qwen_image:img=False"]["sha256"] != actual["image:qwen_image:full"]["sha256"]
