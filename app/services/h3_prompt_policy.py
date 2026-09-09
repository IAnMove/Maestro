"""Shared H3 writing and audio policy; no runtime or provider imports."""
from __future__ import annotations

import re

STYLES = {"faithful", "creative"}
AUDIO_POLICIES = {"native", "legacy"}

# Official MiniMax Context-IR / Ref2VA field order. Studio enhance, Director
# compile and the dialect adapter all mint these labels; keep one owner.
CONTEXT_IR_FIELDS = (
    "integrated_multimodal_description",
    "overall_soundscape",
    "non_diegetic_music",
)
REF2VA_FIELDS = (
    "subject_definitions",
    "summary",
    "retention_analysis",
    "detailed_description",
    "overall_soundscape",
    "non_diegetic_music",
)
_REF2VA_KINDS = {"ref2va", "references", "omni"}


def h3_fields_for_kind(kind: str | None) -> tuple[str, ...]:
    key = str(kind or "context").strip().lower()
    return REF2VA_FIELDS if key in _REF2VA_KINDS else CONTEXT_IR_FIELDS


def h3_field_labels(kind: str | None) -> tuple[str, ...]:
    return tuple(f"{name}:" for name in h3_fields_for_kind(kind))


def tagged_dialogue(language: str, text: str) -> str:
    """Canonical ``<d>[Language] words</d>`` block; surrounding prose stays with callers."""
    return f"<d>[{language}] {text}</d>"


def h3_field_structure_errors(text: str, kind: str | None = "context") -> list[str]:
    """Exact-once, ordered official fields. Surrounding headers are the caller's dialect."""
    source = str(text or "")
    fields = h3_fields_for_kind(kind)
    errors: list[str] = []
    positions: list[int] = []
    for field in fields:
        matches = list(re.finditer(rf"(?mi)^\s*{re.escape(field)}\s*:", source))
        if len(matches) != 1:
            errors.append(f"expected one {field} field, found {len(matches)}")
        elif matches:
            positions.append(matches[0].start())
    if len(positions) == len(fields) and positions != sorted(positions):
        errors.append("Context-IR fields are out of order")
    return errors


def has_complete_h3_fields(text: str, kind: str | None = "context") -> bool:
    return not h3_field_structure_errors(text, kind)


def planning_style(value: str | None) -> str:
    style = str(value or "faithful").strip().lower()
    if style not in STYLES:
        raise ValueError("H3 planning_style must be faithful or creative")
    return style


def audio_policy(value: str | None) -> str:
    policy = str(value or "native").strip().lower()
    if policy not in AUDIO_POLICIES:
        raise ValueError("H3 audio policy must be native or legacy")
    return policy


def writing_contract(style: str = "faithful") -> str:
    creative = planning_style(style) == "creative"
    return (
        "WRITING MODE (takes precedence over generic expansion advice): "
        + ("CREATIVE. Treat the prompt as a creative brief. Write natural character-specific supporting dialogue when characters interact. Exact quoted lines are immutable anchors; additional meaningful lines may surround them unless the user requests only those lines. This permission overrides generic faithful-only guidance. "
           if creative else "FAITHFUL. Preserve the requested events and exact dialogue; do not add extra spoken lines when literal lines were supplied. ")
        + "Preserve exact actor/character portrayal, franchise, era, wardrobe and outcome. "
        "Never blend adaptations or invent powers. Every literal line is immutable, in its original language, "
        "and spoken once by its assigned person. If the user asks for speech without words, write actual "
        "short meaningful lines, not 'they discuss' or background chatter. Explicit silence and 'only these lines' "
        "override creative freedom. Visible signs/titles are not spoken dialogue. Budget the total speech "
        "across all speakers for the real duration. Do not add filler, repeated lines or meaningless chatter. "
        "Use stable speaker IDs in first-vocal-event order; never transfer a line to another person's mouth. "
        "Only literal words and [Language] go inside <d> tags. Camera, delivery and acting stay outside. "
        "After the last word, use concrete nonverbal action with mouths closed. Voiceover does not move on-screen lips."
    )


def sound_contract(policy: str = "native") -> str:
    if audio_policy(policy) == "legacy":
        return ("LEGACY AUDIO POLICY: Keep only exact tagged speech. All other descriptions are visual; "
                "overall_soundscape and non_diegetic_music must be N/A. Do not describe sound or silence.")
    return (
        "NATIVE AUDIO POLICY: Describe location ambience and synchronized physical effects in overall_soundscape, "
        "without dialogue, indistinct chatter or invented background voices. Use non_diegetic_music only for "
        "explicitly requested audience-only music, otherwise N/A. Preserve explicit silence. "
        "Schedule each tagged line once in a concrete interval. Before and after dialogue, people remain silent "
        "with mouths closed while the visible action and requested effects continue. Keep voice-reference timbre "
        "and delivery but not its source noise, room echo or microphone coloration."
    )


def apply_h3_audio_policy(prompt: str, policy: str = "native", duration_seconds: float = 0) -> str:
    """Preserve authored sound fields; the legacy sanitizer remains an explicit choice."""
    if audio_policy(policy) == "legacy":
        from .director.h3_dialogue import apply_h3_no_sound_description
        return apply_h3_no_sound_description(prompt)
    text = str(prompt or "").strip()
    if not text:
        return text
    if duration_seconds:
        from .minimax_h3_duration import inject_h3_vocal_timeline
        text, _ = inject_h3_vocal_timeline(text, duration_seconds, audio_policy="native")
    return text
