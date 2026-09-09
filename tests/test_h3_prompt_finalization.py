"""H3 Prompts Fase 1: shared field schema and tagged-dialogue syntax.

Inventory (rule / owner after this cut / remaining duplicates):

- Official field names and order: h3_prompt_policy.CONTEXT_IR_FIELDS /
  REF2VA_FIELDS. Callers: enhance structure check, Director validate,
  dialect is_structured labels. Intentional difference: is_structured_h3_prompt
  still uses substring presence plus the first-frame header, not exact-once.
- Canonical <d>[Language] words</d>: h3_prompt_policy.tagged_dialogue.
  Callers keep their surrounding speaker sentences. Not unified:
  window "closes their mouth" clause, dialect "says", official h3_dialogue_tag
  payload parsing, series_render, model ref2va English hardcode.
- writing_contract / sound_contract / apply_h3_audio_policy: already shared.
- Last compiled-prompt gate: h3_prompt_finalization.finalize_h3_prompt
  (Studio enhance, window compile, official compile, dialect adapter).
- Studio legacy uses finalize_h3_prompt / apply_h3_audio_policy only.
- extract/repair/enforce: already in h3_story_contract; Director compile is
  a different path and must stay different.
- system_override and raw_enhancer_mode still skip H3 post-process.
- format_minimax_h3_prompt still defaults audio policy to native.
- llm_service._enforce_h3_soundscape_silence still runs before legacy policy.

Expected prompts were frozen from 22f28c45 before this extraction.
Do not refresh the fixture to hide a prompt change.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from services.director.h3_dialogue import (
    compile_h3_official_prompt,
    h3_dialogue_tag,
    validate_h3_prompt_contract,
)
from services.director.minimax_h3_prompting import format_minimax_h3_prompt
from services.h3_prompt_finalization import finalize_h3_prompt
from services.h3_prompt_policy import (
    CONTEXT_IR_FIELDS,
    REF2VA_FIELDS,
    apply_h3_audio_policy,
    h3_field_labels,
    h3_field_structure_errors,
    has_complete_h3_fields,
    sound_contract,
    tagged_dialogue,
    writing_contract,
)
from services.h3_story_contract import (
    enforce_single_dialogue,
    extract_locked_lines,
    repair_literal_tags,
    tag_source_dialogue,
)
from services.h3_window_planner import compile_h3_window_prompts, compute_h3_window_boundaries
from services.minimax_h3_duration import apply_h3_vocal_timeline
from services import llm_service


FIXTURE = Path(__file__).resolve().parent / "fixtures" / "h3_prompt_fase1_expected.json"


def _expected() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _shot():
    return {
        "subjects_on_screen": [{
            "visual_description": "a copper service robot with one amber eye",
            "speaker_name": "Erio",
        }],
        "environment": "a crystal desert at blue dawn",
        "visual_style": "cinematic retrofuturism",
        "lighting": "cold sky with warm amber rim light",
        "camera_plan": {
            "framing": "medium shot",
            "movement": "slow dolly in",
            "movement_intensity": "subtle",
        },
        "audio_plan": {
            "mode": "dialogue_driven",
            "ambience": "a low desert wind",
            "effects": ["quiet servo movement"],
            "lip_sync_critical": True,
        },
        "dialogue_beats": [{
            "speaker_name": "Erio",
            "spoken_text": "¿Dónde está la semilla?",
            "delivery": "softly",
        }],
        "ending_beat": "the amber eye reflected in the seed",
    }


def test_shared_field_schema_is_the_single_owner():
    from services.director import h3_dialogue

    assert h3_dialogue._H3_BASE_FIELDS == CONTEXT_IR_FIELDS
    assert h3_dialogue._H3_REF2VA_FIELDS == REF2VA_FIELDS
    assert h3_field_labels("context") == tuple(f"{name}:" for name in CONTEXT_IR_FIELDS)
    assert h3_field_labels("ref2va") == tuple(f"{name}:" for name in REF2VA_FIELDS)
    complete = (
        "integrated_multimodal_description: [Shot 1] A walk.\n"
        "overall_soundscape: N/A\n"
        "non_diegetic_music: N/A"
    )
    assert has_complete_h3_fields(complete, "context")
    assert not h3_field_structure_errors(complete, "context")
    assert llm_service._has_complete_h3_context_structure(complete)
    assert not llm_service._has_complete_h3_ref2va_structure(complete)
    missing = "integrated_multimodal_description: [Shot 1] A walk.\nnon_diegetic_music: N/A"
    assert h3_field_structure_errors(missing, "context") == [
        "expected one overall_soundscape field, found 0",
    ]


def test_tagged_dialogue_is_the_shared_block_syntax():
    assert tagged_dialogue("Spanish", "Hola") == "<d>[Spanish] Hola</d>"
    assert h3_dialogue_tag("[Spanish] Hola") == tagged_dialogue("Spanish", "Hola")


def test_finalize_gate_matches_audio_policy_and_dialect_defaults():
    expected = _expected()
    source = expected["dialect"]["direct_structured"]
    assert finalize_h3_prompt(source) == apply_h3_audio_policy(source)
    assert finalize_h3_prompt(source, policy="legacy") == apply_h3_audio_policy(source, "legacy")
    first = format_minimax_h3_prompt(
        _shot(),
        "The robot kneels, opens one hand, and reveals the seed.",
        reference_mode="first_frame",
        h3_audio_policy="native",
        duration_seconds=0,
    )
    assert first == expected["dialect"]["first_frame"]
    direct = expected["dialect"]["direct_structured"]
    native_direct = format_minimax_h3_prompt({}, direct, reference_mode="direct")
    explicit_native = format_minimax_h3_prompt(
        {}, direct, reference_mode="direct", h3_audio_policy="native",
    )
    assert native_direct == explicit_native == direct
    legacy_direct = format_minimax_h3_prompt(
        {}, direct, reference_mode="direct", h3_audio_policy="legacy",
    )
    assert "Low mechanical hum" not in legacy_direct
    assert "overall_soundscape:" in legacy_direct
    assert "N/A" in legacy_direct.split("overall_soundscape:", 1)[1]


def test_contracts_match_frozen_base():
    expected = _expected()
    assert writing_contract("faithful") == expected["contracts"]["writing_faithful"]
    assert writing_contract("creative") == expected["contracts"]["writing_creative"]
    assert sound_contract("native") == expected["contracts"]["sound_native"]
    assert sound_contract("legacy") == expected["contracts"]["sound_legacy"]


def test_eight_speech_configs_keep_native_preparation():
    expected = _expected()
    assert len(expected["speech_matrix"]) == 8
    for row in expected["speech_matrix"]:
        source = row["source_prompt"]
        policy = apply_h3_audio_policy(source, "native", 10.125)
        params = {
            "prompt": source,
            "video_length": 243,
            "minimax_h3_audio_policy": "native",
        }
        apply_h3_vocal_timeline(params, {"fps": 24})
        assert policy == row["after_audio_policy"]
        assert params["prompt"] == row["after_vocal_timeline"]
        assert "VOCAL TIMELINE LOCK" not in policy
        assert "<d>[Spanish] He dejado el café para ahorrar</d>" in policy
        if row["style"] == "creative":
            assert "Estaba de oferta" in policy
        else:
            assert "Estaba de oferta" not in policy


def test_dialect_and_window_prompts_are_byte_identical():
    expected = _expected()
    first = format_minimax_h3_prompt(
        _shot(),
        "The robot kneels, opens one hand, and reveals the seed.",
        reference_mode="first_frame",
    )
    direct = format_minimax_h3_prompt(
        {},
        "integrated_multimodal_description: [Shot 1] A silent machine starts.\n\n"
        "overall_soundscape: Low mechanical hum. No human voices.\n\n"
        "non_diegetic_music: N/A",
        reference_mode="direct",
    )
    refs = format_minimax_h3_prompt(
        _shot(),
        "The robot crosses the desert and stops beside a luminous tree.",
        reference_mode="references",
    )
    assert first == expected["dialect"]["first_frame"]
    assert direct == expected["dialect"]["direct_structured"]
    assert refs == expected["dialect"]["references"]

    spans = compute_h3_window_boundaries(345, 124, fps=24, overlap_frames=1)
    plan = {
        "subject_continuity": "Clark Kent wears the same blue shirt and red jacket",
        "setting_continuity": "Smallville main street in warm afternoon light",
        "visual_continuity": "live-action television drama, steady tracking camera",
        "initial_state": "Clark walks screen-right on the sidewalk",
        "ambient_audio": "light traffic, footsteps, and a soft Kansas breeze",
        "music": "N/A",
        "windows": [
            {
                "window": 1,
                "title": "Danger appears",
                "action": "Clark hears a runaway truck and turns toward it",
                "dialogue": [],
                "sound_effects": "a distant truck horn",
                "closing_state": "Clark faces the approaching truck with one foot planted forward",
            },
            {
                "window": 2,
                "title": "The rescue",
                "action": "Clark accelerates, reaches the truck, and braces both hands against its grille",
                "dialogue": [{
                    "speaker": "Driver",
                    "speaker_id": "S1",
                    "language": "English",
                    "delivery": "shouts urgently",
                    "action": "gripping the wheel",
                    "text": "Look out!",
                }],
                "sound_effects": "tires skid and metal groans",
                "closing_state": "Clark holds the slowing truck while the driver grips the wheel",
            },
            {
                "window": 3,
                "title": "Safe landing",
                "action": "Clark stops the truck, checks the driver, and steps back into the crowd",
                "dialogue": [],
                "sound_effects": "the engine settles to idle",
                "closing_state": "the truck is safely stopped and Clark stands unnoticed among pedestrians",
            },
        ],
    }
    compiled = [item["prompt"] for item in compile_h3_window_prompts(plan, spans)]
    assert compiled == expected["windows"]
    assert "<d>[English] Look out!</d>" in compiled[1]


def test_official_compile_and_story_gates_match_frozen_base():
    expected = _expected()
    source = "A person turns toward camera. overall_soundscape: Room tone."
    i2va, _ = compile_h3_official_prompt(source, [], [], mode="i2va", duration_seconds=8.0)
    fl2va, _ = compile_h3_official_prompt(source, [], [], mode="fl2va", duration_seconds=10.25)
    l2va, _ = compile_h3_official_prompt(source, [], [], mode="l2va", duration_seconds=9.5)
    ana, _ = compile_h3_official_prompt(
        "Ana looks toward the door and says: "
        "<d>[Spanish] Ya están aquí.</d>. "
        "overall_soundscape: Quiet room tone. "
        "non_diegetic_music: N/A",
        [{
            "character_id": "ana",
            "speaker_name": "Ana",
            "visual_description": "an alert woman beside the door",
        }],
        [{
            "speaker_id": "ana",
            "spoken_text": "Ya están aquí.",
            "delivery": "quiet and controlled",
        }],
        mode="t2va",
        duration_seconds=5.167,
    )
    assert i2va == expected["official"]["i2va"]
    assert fl2va == expected["official"]["fl2va"]
    assert l2va == expected["official"]["l2va"]
    assert ana == expected["official"]["ana_spanish"]
    assert validate_h3_prompt_contract(i2va, mode="i2va") == []
    assert validate_h3_prompt_contract(
        ana, [{"speaker_id": "ana", "spoken_text": "Ya están aquí."}], mode="t2va",
    ) == []

    story = expected["story"]
    source_es = (
        "George Costanza, interpretado por Jason Alexander, dice: "
        "«He dejado el café para ahorrar». Jerry Seinfeld responde: "
        "«Ahora solo te falta dejar de comprar tazas». Diálogo en español de España."
    )
    assert [x["text"] for x in extract_locked_lines(
        'Dwight from "The Office" reads a sign "EXIT". Alice says "Run!"'
    )] == story["titles"]
    assert tag_source_dialogue(source_es) == story["tagged_spanish"]
    assert repair_literal_tags(
        "<d>[English] He dejado el café para ahorrar.</d>", source_es,
    ) == story["repaired_spanish"]
    assert repair_literal_tags(
        "A warmly lit room. <d>[English] Hello.</d> <d>[English] Welcome.</d>",
        'Alice says "Hello." Bob replies "Welcome."',
        bind_speakers=True,
    ) == story["bound_speakers"]
    output = "Alice (S1): <d>[English] Hello.</d> Bob (S2): <d>[English] Extra.</d>"
    assert enforce_single_dialogue(output, 'Alice says "Hello."', "faithful") == story["faithful_drops_extra"]
    assert enforce_single_dialogue(output, 'Alice says "Hello."', "creative") == story["creative_keeps_extra"]
    assert enforce_single_dialogue(output, "A silent scene.", "creative") == story["silent_drops_tags"]


def test_enhance_paths_with_frozen_llm_responses():
    expected = _expected()
    assert [case["id"] for case in expected["enhance"]] == [
        "studio-faithful-native",
        "studio-faithful-drops-extra",
        "studio-creative-keeps-extra",
        "studio-legacy-sound",
        "studio-spanish-repair",
        "studio-title-not-speech",
        "studio-silencio-in-dialogue",
        "studio-silent-scene",
        "studio-already-structured",
        "studio-ref2va",
        "wan-non-h3",
        "system-override-skips-h3",
        "raw-enhancer-skips-h3",
    ]
    for case in expected["enhance"]:
        with patch.object(llm_service, "generate", return_value=case["llm"]):
            result = llm_service.enhance_prompt(case["user"], **case["kwargs"])
        assert result == case["result"], case["id"]
    by_id = {case["id"]: case["result"] for case in expected["enhance"]}
    assert "Extra." not in by_id["studio-faithful-drops-extra"]
    assert "Extra." in by_id["studio-creative-keeps-extra"]
    assert "overall_soundscape: N/A" in by_id["studio-legacy-sound"]
    assert "<d>[Spanish] He dejado el café para ahorrar</d>" in by_id["studio-spanish-repair"]
    assert "The Office" in by_id["studio-title-not-speech"]
    assert "EXIT" in by_id["studio-title-not-speech"]
    assert "<d>[Spanish] Qué silencio.</d>" in by_id["studio-silencio-in-dialogue"]
    assert "<d>[English] Qué silencio.</d>" not in by_id["studio-silencio-in-dialogue"]
    assert "<d>" not in by_id["studio-silent-scene"]
    assert "field labels" not in by_id["wan-non-h3"]
    assert by_id["wan-non-h3"] == "A ginger cat walks slowly across a sunlit kitchen, tail high."
    assert by_id["system-override-skips-h3"] == "refined without tags"
    assert by_id["raw-enhancer-skips-h3"] == "raw enhanced hello"
