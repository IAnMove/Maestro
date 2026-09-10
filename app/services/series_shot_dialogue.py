"""Keep Series shot dialogue aligned with episode script without rewriting takes."""
from __future__ import annotations

import copy
from typing import Any


def _line_key(beat: dict) -> tuple[str, str]:
    return (str(beat.get("characterId") or ""), str(beat.get("text") or ""))


def _clone_line(beat: dict) -> dict:
    return {
        "id": beat.get("id"),
        "characterId": str(beat.get("characterId") or ""),
        "text": str(beat.get("text") or ""),
        "emotion": str(beat.get("emotion") or ""),
        "delivery": str(beat.get("delivery") or ""),
    }


def _scene_lines(scene: dict | None) -> list[dict] | None:
    if not isinstance(scene, dict):
        return None
    return [item for item in (scene.get("dialogue") or []) if isinstance(item, dict)]


def _shots_by_scene(shots: list) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for shot in shots:
        if not isinstance(shot, dict) or not shot.get("id"):
            continue
        grouped.setdefault(str(shot.get("sceneId") or ""), []).append(shot)
    return grouped


def _status_for(shot: dict, expected: list[dict]) -> str:
    actual = [item for item in (shot.get("dialogueBeats") or []) if isinstance(item, dict)]
    if [_line_key(item) for item in expected] == [_line_key(item) for item in actual]:
        return "in_sync"
    return "manual_conflict" if shot.get("dialogueOrigin") == "manual" else "stale"


def _plan_missing_scene(ordered: list[dict]) -> dict[str, dict[str, Any]]:
    plans: dict[str, dict[str, Any]] = {}
    for shot in ordered:
        actual = shot.get("dialogueBeats") or []
        plans[str(shot["id"])] = {
            "status": "stale" if actual else "in_sync",
            "expected": [],
        }
    return plans


def _plan_unspoken_scene(ordered: list[dict], lines: list[dict]) -> dict[str, dict[str, Any]]:
    plans: dict[str, dict[str, Any]] = {}
    expected = [_clone_line(item) for item in lines]
    for index, shot in enumerate(ordered):
        if lines and index == 0:
            plans[str(shot["id"])] = {"status": "stale", "expected": expected}
        else:
            plans[str(shot["id"])] = {"status": "in_sync", "expected": []}
    return plans


def _plan_spoken_scene(speaking: list[dict], silent: list[dict], lines: list[dict]) -> dict[str, dict[str, Any]]:
    plans: dict[str, dict[str, Any]] = {}
    remaining = [_clone_line(item) for item in lines]
    for index, shot in enumerate(speaking):
        last = index == len(speaking) - 1
        take = len(remaining) if last else min(
            len(remaining), max(1, len(shot.get("dialogueBeats") or [])),
        )
        expected = remaining[:take]
        remaining = remaining[take:]
        plans[str(shot["id"])] = {
            "status": _status_for(shot, expected),
            "expected": expected,
        }
    for shot in silent:
        plans[str(shot["id"])] = {"status": "in_sync", "expected": []}
    return plans


def plan_shot_dialogue_from_script(script: list, shots: list) -> dict[str, dict[str, Any]]:
    scenes = {
        str(scene.get("id")): scene
        for scene in script if isinstance(scene, dict) and scene.get("id")
    }
    plans: dict[str, dict[str, Any]] = {}
    for scene_id, scene_shots in _shots_by_scene(shots).items():
        ordered = sorted(scene_shots, key=lambda item: int(item.get("order") or 0))
        lines = _scene_lines(scenes.get(scene_id))
        speaking = [shot for shot in ordered if shot.get("dialogueBeats")]
        silent = [shot for shot in ordered if not shot.get("dialogueBeats")]
        if lines is None:
            plans.update(_plan_missing_scene(ordered))
        elif not speaking:
            plans.update(_plan_unspoken_scene(ordered, lines))
        else:
            plans.update(_plan_spoken_scene(speaking, silent, lines))
    return plans


def annotate_episode_shot_dialogue(episode: dict) -> dict:
    script = episode.get("script") if isinstance(episode.get("script"), list) else []
    shots = episode.get("shots") if isinstance(episode.get("shots"), list) else []
    plans = plan_shot_dialogue_from_script(script, shots)
    for shot in shots:
        if not isinstance(shot, dict) or not shot.get("id"):
            continue
        plan = plans.get(str(shot["id"]))
        if plan:
            shot["scriptDialogueStatus"] = plan["status"]
    episode["shots"] = shots
    return episode


def _apply_sync_plan(shot: dict, plan: dict, include_conflicts: bool) -> None:
    if plan["status"] == "in_sync":
        shot["scriptDialogueStatus"] = "in_sync"
        return
    if plan["status"] == "manual_conflict" and not include_conflicts:
        shot["scriptDialogueStatus"] = "manual_conflict"
        return
    shot["dialogueBeats"] = [copy.deepcopy(item) for item in plan["expected"]]
    shot["sourceDialogueIds"] = [
        str(item.get("id") or "") for item in plan["expected"] if item.get("id")
    ]
    shot["dialogueOrigin"] = "script"
    shot["scriptDialogueStatus"] = "in_sync"


def sync_episode_shot_dialogue(episode: dict, *, include_conflicts: bool = False) -> dict:
    updated = copy.deepcopy(episode)
    script = updated.get("script") if isinstance(updated.get("script"), list) else []
    shots = updated.get("shots") if isinstance(updated.get("shots"), list) else []
    plans = plan_shot_dialogue_from_script(script, shots)
    for shot in shots:
        if not isinstance(shot, dict) or not shot.get("id"):
            continue
        plan = plans.get(str(shot["id"]))
        if plan:
            _apply_sync_plan(shot, plan, include_conflicts)
    updated["shots"] = shots
    return updated


def stale_shot_ids(episode: dict) -> list[str]:
    annotate_episode_shot_dialogue(episode)
    return [
        str(shot.get("id"))
        for shot in (episode.get("shots") or [])
        if isinstance(shot, dict) and shot.get("scriptDialogueStatus") in {"stale", "manual_conflict"}
    ]
