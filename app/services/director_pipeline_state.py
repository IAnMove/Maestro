"""Disk primitives for Director pipeline JSON and scratch files.

This module is I/O only. It does not import director_pipeline, launch, wgp,
resource_scheduler or generation engines. Callers that already hold
``_pipeline_file_lock`` keep that contract: ``_write_pipeline_json_unlocked``
does not take a lock.
"""
from __future__ import annotations

import json
import os
import re
import threading
import uuid
from typing import Optional

_DIRECTOR_TEMP_DIRNAME = ".director-tmp"
_PIPELINE_FILE_PREFIX = "_director_pipeline_"


def _director_temporary_path(out_dir: str, pid: str, filename: str) -> str:
    """Return a pipeline-scoped path that never appears in the media library."""
    pid_token = re.sub(r"[^A-Za-z0-9_-]", "_", str(pid or "pipeline"))[:32]
    temp_dir = os.path.join(out_dir, _DIRECTOR_TEMP_DIRNAME, pid_token)
    os.makedirs(temp_dir, exist_ok=True)
    return os.path.join(temp_dir, os.path.basename(filename))


def _cleanup_director_temporary_files(paths: list[str]) -> None:
    """Remove Director scratch files and their now-empty private directories."""
    parents: set[str] = set()
    for path in paths:
        if not path:
            continue
        parents.add(os.path.dirname(path))
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError:
            pass
    for parent in parents:
        try:
            os.rmdir(parent)
        except OSError:
            continue
        root = os.path.dirname(parent)
        if os.path.basename(root) == _DIRECTOR_TEMP_DIRNAME:
            try:
                os.rmdir(root)
            except OSError:
                pass


def _cleanup_stale_director_temporary_outputs(output_root: str) -> None:
    """Remove scratch audio left behind by an unclean previous shutdown."""
    root = os.path.realpath(os.path.abspath(output_root))
    if not os.path.isdir(root):
        return
    scan_dirs = [root]
    try:
        scan_dirs.extend(
            os.path.join(root, name)
            for name in os.listdir(root)
            if not name.startswith(".")
            and os.path.isdir(os.path.join(root, name))
        )
    except OSError:
        pass

    legacy_prefixes = ("_director_h3_audio_", "_rerun_audio_")
    for scan_dir in scan_dirs:
        try:
            for name in os.listdir(scan_dir):
                path = os.path.join(scan_dir, name)
                if os.path.isfile(path) and name.startswith(legacy_prefixes):
                    try:
                        os.remove(path)
                    except OSError:
                        pass
        except OSError:
            continue

        temp_root = os.path.join(scan_dir, _DIRECTOR_TEMP_DIRNAME)
        if not os.path.isdir(temp_root):
            continue
        for current, dirs, files in os.walk(temp_root, topdown=False):
            for name in files:
                try:
                    os.remove(os.path.join(current, name))
                except OSError:
                    pass
            for name in dirs:
                try:
                    os.rmdir(os.path.join(current, name))
                except OSError:
                    pass
        try:
            os.rmdir(temp_root)
        except OSError:
            pass


def _write_pipeline_json_unlocked(filepath: str, state: dict) -> None:
    """Atomically replace one pipeline JSON file while its file lock is held."""
    temp_filepath = (
        f"{filepath}.{os.getpid()}.{threading.get_ident()}.{uuid.uuid4().hex}.tmp"
    )
    try:
        with open(temp_filepath, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, ensure_ascii=False, default=str)
        os.replace(temp_filepath, filepath)
    finally:
        if os.path.isfile(temp_filepath):
            try:
                os.remove(temp_filepath)
            except OSError:
                pass


def _pipeline_scan_dirs(out_dir: str, workspace: Optional[str]) -> list[tuple[str, str]]:
    """Return (scan_dir, workspace_name) for one workspace only."""
    normalized_workspace = workspace or "default"
    if normalized_workspace == "default":
        return [(out_dir, "default")]
    workspace_dir = os.path.join(out_dir, normalized_workspace)
    return [(workspace_dir, normalized_workspace)] if os.path.isdir(workspace_dir) else []


def _iter_pipeline_state_files(
    out_dir: str, workspace: Optional[str] = None,
) -> list[tuple[float, str, str]]:
    """Newest-first pipeline files as (mtime, filepath, workspace_name).

    Listing uses mtime so Workspaces can paginate without json-loading every
    5–8 MB state file in the folder.
    """
    found: list[tuple[float, str, str]] = []
    if not os.path.isdir(out_dir):
        return found
    for scan_dir, workspace_name in _pipeline_scan_dirs(out_dir, workspace):
        try:
            names = os.listdir(scan_dir)
        except OSError:
            continue
        for fname in names:
            if not (fname.startswith(_PIPELINE_FILE_PREFIX) and fname.endswith(".json")):
                continue
            filepath = os.path.join(scan_dir, fname)
            try:
                mtime = os.path.getmtime(filepath)
            except OSError:
                continue
            found.append((mtime, filepath, workspace_name))
    found.sort(key=lambda item: item[0], reverse=True)
    return found


def count_pipeline_states(out_dir: str, workspace: Optional[str] = None) -> int:
    """Count pipeline state files without opening them."""
    return len(_iter_pipeline_state_files(out_dir, workspace))


def _find_pipeline_file(out_dir: str, pid: str) -> Optional[str]:
    """Find the JSON file path for a saved pipeline."""
    target = f"{_PIPELINE_FILE_PREFIX}{pid}.json"
    filepath = os.path.join(out_dir, target)
    if os.path.isfile(filepath):
        return filepath
    if os.path.isdir(out_dir):
        for name in os.listdir(out_dir):
            sub = os.path.join(out_dir, name, target)
            if os.path.isfile(sub):
                return sub
    return None
