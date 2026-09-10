"""Shared architecture-prefix → video-guide stem. No launch, engines, or providers.

Studio enhance and Director polish keep their own loaders: full enhance files,
light dialect cheat sheets, model_def overrides, and checkpoint notes.
"""
from __future__ import annotations

# Longest prefix wins. Stems are filenames without directory or .md.
VIDEO_GUIDE_STEMS = {
    "minimax_h3_ref2va": "minimax_h3_ref2va_video",
    "minimax_h3_legacy": "minimax_h3_video",
    "minimax_h3": "minimax_h3_video",
    "ltx2": "ltx2_video",
    "ltxv": "ltx2_video",
    "t2v": "wan_video",
    "i2v": "wan_video",
    "ti2v": "wan_video",
    "animate": "wan_video",
    "wanmove": "wan_video",
    "ovi": "wan_video",
    "lucy": "wan_video",
    "multitalk": "wan_video",
    "phantom": "wan_video",
    "fun_inp": "wan_video",
    "alpha": "wan_video",
    "fantasy": "wan_video",
    "chrono": "wan_video",
    "flf2v": "wan_video",
    "hunyuan": "wan_video",
    "heartmula": "wan_video",
}


def longest_prefix(model_type: str | None, mapping: dict[str, object]) -> str:
    model_lower = str(model_type or "").strip().lower()
    best_key = ""
    for prefix in mapping:
        if model_lower.startswith(prefix) and len(prefix) > len(best_key):
            best_key = prefix
    return best_key


def match_guide_stem(model_type: str | None, mapping: dict[str, str] | None = None) -> str:
    table = mapping if mapping is not None else VIDEO_GUIDE_STEMS
    key = longest_prefix(model_type, table)
    return str(table.get(key, "") or "")
