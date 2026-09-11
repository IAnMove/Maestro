"""Series episode assembly adapters for the core/remote profile.

NVIDIA joins approved clips with WanGP's FFmpeg helper. Core keeps the same
HTTP contract and concatenates with FFmpeg, without Torch.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from typing import Any, Callable

from services import core_editor, core_workspace as core


def asset_local_path(workspace: str, asset: dict[str, Any]) -> str:
    uri = str(asset.get("uri") or "")
    if uri.startswith("https://"):
        raise ValueError(
            f"Remote Series asset {asset.get('id')} must be imported into the workspace before assembly"
        )
    folder = os.path.realpath(core.workspace_dir(workspace))
    relative = uri[len("outputs/"):] if uri.startswith("outputs/") else uri
    candidate = os.path.realpath(os.path.join(folder, relative))
    if candidate != folder and not candidate.startswith(folder + os.sep):
        raise ValueError(f"Series asset {asset.get('id')} leaves its workspace")
    if not os.path.isfile(candidate):
        raise ValueError(f"Series reference file is missing: {uri}")
    return candidate


def available_filename(directory: str, name: str) -> str:
    _filename, destination = core_editor.unique_output_name(directory, name)
    return destination


def concatenate_clips(
    paths: list[str],
    output_path: str,
    *,
    abort_callback: Callable[[], bool] | None = None,
) -> bool:
    if abort_callback and abort_callback():
        return False
    files = [str(path) for path in paths if path and os.path.isfile(path)]
    if not files:
        return False
    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
    if len(files) == 1:
        shutil.copyfile(files[0], output_path)
        return os.path.isfile(output_path)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False
    with tempfile.TemporaryDirectory(prefix=".series-assembly-") as tmp:
        listing = os.path.join(tmp, "clips.txt")
        with open(listing, "w", encoding="utf-8") as handle:
            for path in files:
                escaped = path.replace("\\", "\\\\").replace("'", r"\'")
                handle.write(f"file '{escaped}'\n")
        copied = subprocess.run(
            [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", output_path],
            check=False, capture_output=True,
        )
        if copied.returncode == 0 and os.path.isfile(output_path):
            return True
        encoded = subprocess.run(
            [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", listing,
             "-c:v", "libx264", "-c:a", "aac", output_path],
            check=False, capture_output=True,
        )
        return encoded.returncode == 0 and os.path.isfile(output_path)
