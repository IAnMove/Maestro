"""Check pinned source checkouts and repair missing tracked dependency files."""
from __future__ import annotations

import json
import subprocess
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


@lru_cache(maxsize=1)
def vendor_catalog() -> dict:
    return json.loads((ROOT / "app/runtime/vendors.json").read_text(encoding="utf-8"))


def _git(folder: Path, *arguments: str, **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(folder), *arguments], capture_output=True, timeout=20, **kwargs)


def sources_current(vendor_ids: list[str], root: Path = ROOT) -> bool:
    for name in vendor_ids:
        spec = vendor_catalog()[name]
        folder = root / spec["path"]
        if any(not (folder / entry).exists() for entry in spec["requiredPaths"]):
            return False
        try:
            head = _git(folder, "rev-parse", "HEAD", text=True)
            if head.returncode or head.stdout.strip() != spec["revision"]:
                return False
            # Deletion of another tracked source file must also trigger repair.
            if _git(folder, "diff", "--quiet", "--diff-filter=D", "HEAD", "--").returncode:
                return False
        except (OSError, subprocess.SubprocessError):
            return False
    return True


def restore_missing(vendor_id: str, root: Path = ROOT) -> None:
    """Restore absent tracked files only; retain all existing edits/untracked files.

    Called after the pinned checkout. Staged deletions or an invalid repository
    stop with a repair error instead of silently discarding custom changes.
    """
    spec = vendor_catalog()[vendor_id]
    folder = root / spec["path"]
    head = _git(folder, "rev-parse", "HEAD", text=True)
    if head.returncode or head.stdout.strip() != spec["revision"]:
        raise RuntimeError(f"{vendor_id}: source checkout does not match the selected revision")
    missing = _git(folder, "ls-files", "--deleted", "-z", check=True).stdout
    if missing:
        _git(folder, "restore", f"--source={spec['revision']}", "--worktree",
             "--pathspec-from-file=-", "--pathspec-file-nul", input=missing, check=True)
    if not sources_current([vendor_id], root):
        raise RuntimeError(f"{vendor_id}: source is incomplete; preserve custom Git changes and repair this vendor checkout")
