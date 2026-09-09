import copy
import json
import pytest
from app.services.character_kit_library import normalize_character_kit, patch_character_kit, read_character_kit_library, CharacterKitRevisionConflict
from app.services.character_speech_definition import normalize_character_voice, normalize_speech3d


def definition():
    return {"version": 1, "id": "alice", "name": "Alice", "style": "cutout", "poses": {}, "mouth": {}, "eyes": {}, "anchors": {},
            "provenance": [{"method": "existing-2d"}], "lookNotes": "Keep the original costume",
            "voice": {"provider": "local", "model": "qwen3_tts_customvoice", "voiceId": "serena"},
            "speech3d": {"digest": "a" * 64, "model": {"workspaceId": "one", "filename": "alice.glb", "url": "/api/v1/file/alice.glb"},
                         "settings": {"face": {"meshIndex": 0, "center": [0, 1, 0], "size": [.1, .1], "skin": [.5, .4, .3],
                                              "eyes": {"left": [-.1, 1.2, 0], "right": [.1, 1.2, 0], "size": [.1, .1], "skinLeft": [.5, .4, .3], "skinRight": [.5, .4, .3]}},
                                      "eyes": True, "blink": True, "expression": "happy"}}}


def test_roundtrip_preserves_2d_face_voice_and_scope(tmp_path):
    kit = definition()
    first = patch_character_kit(str(tmp_path / "one"), "alice", kit, base_revision=0)
    assert first["kits"]["alice"]["speech3d"] == kit["speech3d"]
    assert first["kits"]["alice"]["voice"] == kit["voice"]
    assert first["kits"]["alice"]["lookNotes"] == kit["lookNotes"]
    assert first["kits"]["alice"]["provenance"] == kit["provenance"]
    assert read_character_kit_library(str(tmp_path / "two"))["kits"] == {}
    changed = copy.deepcopy(kit)
    changed["speech3d"]["settings"]["face"]["center"][0] = .25
    second = patch_character_kit(str(tmp_path / "one"), "alice", changed, base_revision=1)
    assert second["revision"] == 2
    history = tmp_path / "one" / ".character-kit-library-v1.json.v1.json"
    assert json.loads(history.read_text())["kits"]["alice"]["speech3d"] == kit["speech3d"]
    with pytest.raises(CharacterKitRevisionConflict):
        patch_character_kit(str(tmp_path / "one"), "alice", kit, base_revision=1)
    assert read_character_kit_library(str(tmp_path / "one"))["kits"]["alice"]["speech3d"] == changed["speech3d"]


@pytest.mark.parametrize("patch", [
    {"apiKey": "fake-not-a-real-key"}, {"voiceId": "not-supported"}, {"provider": "remote"},
    {"model": "unconfigured"}, {"instructions": "a" * 1001},
])
def test_voice_does_not_store_secrets_or_unsupported_config(patch):
    with pytest.raises(ValueError):
        normalize_character_voice({**definition()["voice"], **patch})


@pytest.mark.parametrize("change", [
    lambda value: value.update(audio="/audio.wav"),
    lambda value: value.update(digest="missing"),
    lambda value: value["model"].update(url="blob:temporary"),
    lambda value: value["model"].update(url="https://host/file.glb?token=fake"),
    lambda value: value["model"].update(url="https://user:password@host/file.glb"),
    lambda value: value["settings"].update(clips=[]),
    lambda value: value["settings"]["face"].update(center=[float("nan"), 1, 0]),
    lambda value: value["settings"].update(eyes="true"),
])
def test_invalid_or_scene_local_fields_are_rejected(change):
    value = definition()["speech3d"]
    change(value)
    with pytest.raises(ValueError):
        normalize_speech3d(value)


def test_old_2d_only_kits_remain_valid():
    kit = definition()
    del kit["speech3d"], kit["voice"]
    normalized = normalize_character_kit(kit)
    assert "speech3d" not in normalized and "voice" not in normalized
    assert normalized["provenance"] == kit["provenance"]


def test_noncredential_query_values_are_valid_and_story_links_survive_series_import():
    from app.services.series_library import import_story_project
    kit = definition()
    kit["speech3d"]["model"]["url"] = "/api/v1/file/alice.glb?workspace=monkey"
    assert normalize_speech3d(kit["speech3d"]) == kit["speech3d"]
    ref = {"id": "alice", "workspace": "one"}
    story = {"id": "story", "title": "Story", "characters": [{"id": "story-alice", "name": "Alice", "characterKitRef": ref}]}
    series = import_story_project(story, "one")
    assert series["characters"][0]["voiceProfile"]["characterKitRef"] == ref
    assert story["characters"][0]["characterKitRef"] == ref
