"""Canonical voice sources stay separate from the destination and native fallback."""
from copy import deepcopy
import hashlib
import wave

import pytest

from services.studio_speech_resources import StudioSpeechResources
from services.asset_manifest import build_asset_manifest, write_asset_manifest
from services.wangp_submission import prepare_generation_inputs


def write_wave(path, frames=800):
    with wave.open(str(path), "wb") as output:
        output.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
        output.writeframes(b"\x01\x00" * frames)


@pytest.fixture
def sources(tmp_path):
    folders = {name: tmp_path / name for name in ("uploads", "source", "destination", "default")}
    for path in folders.values():
        path.mkdir()
    resources = StudioSpeechResources(
        workspace_dir=lambda name: folders[name], uploads_dir=lambda: folders["uploads"],
        list_workspaces=lambda: [{"name": name} for name in ("source", "destination")],
        lora_search_dirs=lambda _: [], lora_compatible=lambda *_: False,
    )
    return folders, resources


@pytest.mark.parametrize("new_family", [False, True])
def test_voice_references_use_declared_source_across_native_preparation(sources, new_family):
    folders, resources = sources
    write_wave(folders["source"] / "same.wav", 800)
    write_wave(folders["destination"] / "same.wav", 1600)
    write_wave(folders["uploads"] / "voice.wav", 2400)
    params = {"generation_mode": "audio", "image_mode": 0, "workspace": "destination",
              "audio_guide": "/api/v1/file/same.wav?workspace=source",
              "audio_guide6": "/api/v1/uploads/voice.wav", "audio_guide2": ""}
    original = deepcopy(params)
    working, identities = resources.prepare_media(params)
    prepare_generation_inputs(working, {"audio_only": True, "wangp_1272": new_family}, "destination",
                              workspace_dir=folders["destination"], uploads_dir=folders["uploads"],
                              prepared_speech=True)
    assert params == original
    assert working["audio_guide"] == str(folders["source"] / "same.wav")
    assert working["audio_guide6"] == str(folders["uploads"] / "voice.wav")
    assert working["audio_guide2"] == ""
    assert [item["workspace"] for item in identities] == ["source", "__uploads__"]
    assert identities[0]["duration_seconds"] == 0.1
    assert identities[0]["sha256"] == hashlib.sha256((folders["source"] / "same.wav").read_bytes()).hexdigest()


def test_missing_source_does_not_adopt_same_named_destination(sources):
    folders, resources = sources
    write_wave(folders["destination"] / "voice.wav")
    with pytest.raises(ValueError):
        resources.prepare_media({"audio_guide": "/api/v1/file/voice.wav?workspace=source"})


def test_non_audio_source_is_rejected(sources):
    folders, resources = sources
    (folders["source"] / "bad.wav").write_text("not audio")
    with pytest.raises(ValueError):
        resources.prepare_media({"audio_guide": "/api/v1/file/bad.wav?workspace=source"})


def test_symlink_escape_is_rejected_before_probe(sources, tmp_path):
    folders, resources = sources
    write_wave(tmp_path / "outside.wav")
    (folders["source"] / "voice.wav").symlink_to(tmp_path / "outside.wav")
    with pytest.raises(ValueError):
        resources.prepare_media({"audio_guide": "/api/v1/file/voice.wav?workspace=source"})


def test_json_flag_cannot_authorize_prepared_voice_paths(sources, tmp_path):
    folders, _ = sources
    outside = tmp_path / "outside.wav"
    write_wave(outside)
    with pytest.raises(ValueError):
        prepare_generation_inputs({"generation_mode": "audio", "audio_guide": str(outside),
                                   "prepared_studio_speech": True},
                                  {"returns_audio": True, "wangp_1272": True}, "destination",
                                  workspace_dir=folders["destination"], uploads_dir=folders["uploads"])


@pytest.mark.parametrize("field", ["audio_guide", "audio_guide2", "audio_guide3", "audio_guide4", "audio_guide5", "audio_guide6"])
def test_every_native_voice_slot_is_resolved_without_the_trusted_adapter(sources, field):
    folders, _ = sources
    write_wave(folders["uploads"] / "voice.wav")
    working = {"generation_mode": "audio", field: "/api/v1/uploads/voice.wav"}
    prepare_generation_inputs(working, {"audio_only": True, "wangp_1272": True}, "destination",
                              workspace_dir=folders["destination"], uploads_dir=folders["uploads"])
    assert working[field] == str(folders["uploads"] / "voice.wav")


@pytest.mark.parametrize("reference", ["asset_voice", "/api/v1/assets/asset_voice"])
def test_audio_asset_identity_preserves_source_and_rejects_ambiguous_locations(sources, reference):
    folders, resources = sources
    source = folders["source"] / "voice.wav"
    write_wave(source)
    write_asset_manifest(source, build_asset_manifest(source, asset_id="asset_voice", tool="studio"))
    working, identities = resources.prepare_media({"audio_guide": reference})
    assert working["audio_guide"] == str(source)
    assert identities[0]["workspace"] == "source"
    assert identities[0]["url"] == reference
    destination = folders["destination"] / "voice.wav"
    write_wave(destination)
    write_asset_manifest(destination, build_asset_manifest(destination, asset_id="asset_voice", tool="studio"))
    with pytest.raises(ValueError, match="multiple locations"):
        resources.prepare_media({"audio_guide": reference})
