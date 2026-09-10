"""Disk primitives extracted from director_pipeline. No GPU or real outputs."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from app.services import director_pipeline
from services import director_pipeline_state as state


def test_facade_reexports_extracted_helpers():
    assert director_pipeline._write_pipeline_json_unlocked is state._write_pipeline_json_unlocked
    assert director_pipeline._find_pipeline_file is state._find_pipeline_file
    assert director_pipeline.count_pipeline_states is state.count_pipeline_states
    assert director_pipeline._PIPELINE_FILE_PREFIX == "_director_pipeline_"
    assert director_pipeline._DIRECTOR_TEMP_DIRNAME == ".director-tmp"


def test_atomic_write_leaves_no_partial_json_or_tmp(tmp_path, monkeypatch):
    dest = tmp_path / "_director_pipeline_p1.json"
    dest.write_text('{"keep": true}', encoding="utf-8")

    def boom(*_args, **_kwargs):
        raise RuntimeError("dump failed")

    monkeypatch.setattr(state.json, "dump", boom)
    with pytest.raises(RuntimeError, match="dump failed"):
        state._write_pipeline_json_unlocked(str(dest), {"pipeline_id": "p1"})
    leftover = list(tmp_path.iterdir())
    assert leftover == [dest]
    assert json.loads(dest.read_text(encoding="utf-8")) == {"keep": True}


def test_atomic_write_replaces_destination(tmp_path):
    dest = tmp_path / "_director_pipeline_p1.json"
    state._write_pipeline_json_unlocked(str(dest), {"pipeline_id": "p1", "status": "queued"})
    assert json.loads(dest.read_text(encoding="utf-8"))["pipeline_id"] == "p1"
    assert list(tmp_path.glob("*.tmp")) == []


def test_scan_dirs_stay_inside_the_requested_workspace(tmp_path):
    (tmp_path / "other").mkdir()
    default_dirs = state._pipeline_scan_dirs(str(tmp_path), None)
    assert default_dirs == [(str(tmp_path), "default")]
    other_dirs = state._pipeline_scan_dirs(str(tmp_path), "other")
    assert other_dirs == [(str(tmp_path / "other"), "other")]
    missing = state._pipeline_scan_dirs(str(tmp_path), "absent")
    assert missing == []


def test_iter_and_count_are_newest_first_and_workspace_scoped(tmp_path):
    default_old = tmp_path / "_director_pipeline_old.json"
    default_new = tmp_path / "_director_pipeline_new.json"
    other_dir = tmp_path / "lab"
    other_dir.mkdir()
    other = other_dir / "_director_pipeline_lab.json"
    default_old.write_text("{}", encoding="utf-8")
    default_new.write_text("{}", encoding="utf-8")
    other.write_text("{}", encoding="utf-8")
    os.utime(default_old, (1_700_000_000, 1_700_000_000))
    os.utime(default_new, (1_700_000_100, 1_700_000_100))
    os.utime(other, (1_700_000_200, 1_700_000_200))
    ordered = [Path(path).name for _mtime, path, _ws in state._iter_pipeline_state_files(str(tmp_path), "default")]
    assert ordered == ["_director_pipeline_new.json", "_director_pipeline_old.json"]
    assert state.count_pipeline_states(str(tmp_path), "default") == 2
    assert state.count_pipeline_states(str(tmp_path), "lab") == 1
    assert director_pipeline.count_pipeline_states(str(tmp_path), "default") == 2


def test_find_pipeline_file_checks_root_then_workspace_subdir(tmp_path):
    nested = tmp_path / "ws" / "_director_pipeline_nested.json"
    nested.parent.mkdir()
    nested.write_text("{}", encoding="utf-8")
    root = tmp_path / "_director_pipeline_root.json"
    root.write_text("{}", encoding="utf-8")
    assert state._find_pipeline_file(str(tmp_path), "root") == str(root)
    assert state._find_pipeline_file(str(tmp_path), "nested") == str(nested)
    assert state._find_pipeline_file(str(tmp_path), "missing") is None


def test_temporary_path_is_private_and_cleanup_stays_in_fixture(tmp_path):
    outside = tmp_path / "keep-me.wav"
    outside.write_bytes(b"keep")
    path = state._director_temporary_path(str(tmp_path), "pipe/../id with spaces", "clip/../audio.wav")
    Path(path).write_bytes(b"scratch")
    assert Path(path).parent.parent.name == ".director-tmp"
    assert Path(path).name == "audio.wav"
    state._cleanup_director_temporary_files([path])
    assert not Path(path).exists()
    assert not (tmp_path / ".director-tmp").exists()
    assert outside.read_bytes() == b"keep"


def test_stale_cleanup_removes_legacy_scratch_only_under_the_fixture(tmp_path):
    (tmp_path / "_director_h3_audio_left.wav").write_bytes(b"old")
    (tmp_path / "_rerun_audio_left.wav").write_bytes(b"old")
    keep = tmp_path / "real-output.wav"
    keep.write_bytes(b"keep")
    scratch = Path(state._director_temporary_path(str(tmp_path), "p1", "left.wav"))
    scratch.write_bytes(b"tmp")
    state._cleanup_stale_director_temporary_outputs(str(tmp_path))
    assert not (tmp_path / "_director_h3_audio_left.wav").exists()
    assert not (tmp_path / "_rerun_audio_left.wav").exists()
    assert keep.read_bytes() == b"keep"
    assert not (tmp_path / ".director-tmp").exists()


def test_state_module_does_not_import_runtime_facades():
    import ast
    tree = ast.parse(Path(state.__file__).read_text(encoding="utf-8"))
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])
    banned = {
        "director_pipeline", "launch", "wgp", "resource_scheduler", "fastapi",
    }
    assert imported.isdisjoint(banned)
