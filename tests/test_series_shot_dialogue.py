from services.series_library import normalize_series_library, update_series_episode
from services.series_render import series_dialogue_preflight_issues
from services.series_shot_dialogue import (
    annotate_episode_shot_dialogue,
    plan_shot_dialogue_from_script,
    sync_episode_shot_dialogue,
)
from tests.test_series_library import example_library


def _episode():
    library = normalize_series_library(example_library(), "default")
    return library["seriesById"]["series_signal"]["episodesById"]["episode_1"]


def test_script_edit_marks_shot_stale_and_sync_copies_literal_line():
    episode = _episode()
    scene = next(item for item in episode["script"] if item["id"] == "scene_station")
    scene["dialogue"][0]["text"] = "He descubierto ChatGPT"
    annotate_episode_shot_dialogue(episode)
    shot = next(item for item in episode["shots"] if item["id"] == "shot_1")
    assert shot["scriptDialogueStatus"] == "stale"
    assert "He descubierto ChatGPT" not in shot["dialogueBeats"][0]["text"]
    camera = shot["camera"]
    attempts = list(shot["attempts"])
    synced = sync_episode_shot_dialogue(episode)
    updated = next(item for item in synced["shots"] if item["id"] == "shot_1")
    assert updated["dialogueBeats"][0]["text"] == "He descubierto ChatGPT"
    assert updated["camera"] == camera
    assert updated["attempts"] == attempts
    assert updated["scriptDialogueStatus"] == "in_sync"


def test_stale_shot_blocks_render_preflight():
    episode = _episode()
    episode["script"][0]["dialogue"][0]["text"] = "He descubierto ChatGPT"
    annotate_episode_shot_dialogue(episode)
    shot = next(item for item in episode["shots"] if item["id"] == "shot_1")
    issues = series_dialogue_preflight_issues(shot, {"spokenLanguage": "Español"})
    assert any("out of date" in item for item in issues)


def test_update_episode_can_sync_without_dropping_attempts():
    library = normalize_series_library(example_library(), "default")
    series = library["seriesById"]["series_signal"]
    episode = series["episodesById"]["episode_1"]
    patch = {
        "script": episode["script"],
        "syncShotDialogueFromScript": True,
    }
    patch["script"][0]["dialogue"][0]["text"] = "He descubierto ChatGPT"
    updated = update_series_episode(
        series, "episode_1", patch, base_series_revision=series["revision"],
    )
    saved = updated["episodesById"]["episode_1"]
    shot = next(item for item in saved["shots"] if item["id"] == "shot_1")
    assert shot["dialogueBeats"][0]["text"] == "He descubierto ChatGPT"
    assert shot["attempts"]
    assert shot["approvedAttemptId"] == "attempt_1"


def test_manual_shot_edit_is_a_conflict_not_a_blind_overwrite():
    episode = _episode()
    shot = next(item for item in episode["shots"] if item["id"] == "shot_1")
    shot["dialogueOrigin"] = "manual"
    shot["dialogueBeats"][0]["text"] = "Linea manual"
    episode["script"][0]["dialogue"][0]["text"] = "He descubierto ChatGPT"
    plans = plan_shot_dialogue_from_script(episode["script"], episode["shots"])
    assert plans["shot_1"]["status"] == "manual_conflict"
    skipped = sync_episode_shot_dialogue(episode, include_conflicts=False)
    kept = next(item for item in skipped["shots"] if item["id"] == "shot_1")
    assert kept["dialogueBeats"][0]["text"] == "Linea manual"
