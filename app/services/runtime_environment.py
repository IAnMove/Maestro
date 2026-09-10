"""Interpreter and child environment isolation for all managed engines."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Mapping

from services.runtime_profiles import APP_DIR, catalog


def python_path(env_dir: Path, *, kind: str = "conda", platform: str | None = None) -> Path:
    platform = platform or sys.platform
    if platform == "win32":
        return env_dir / ("Scripts/python.exe" if kind == "venv" else "python.exe")
    return env_dir / "bin" / "python"


def engine_python(engine: str, *, root: Path | None = None) -> Path:
    spec = catalog()["engines"][engine]
    return python_path((root or APP_DIR.parent) / spec["env"], kind=spec["environment"])


def _from_parent(value: str, parents: set[Path]) -> bool:
    candidate = Path(value).resolve()
    return any(candidate == p or p in candidate.parents for p in parents)


def _without_package_overrides(source: Mapping[str, str]) -> dict[str, str]:
    blocked = {"VIRTUAL_ENV", "CONDA_DEFAULT_ENV", "CONDA_PROMPT_MODIFIER", "LD_PRELOAD"}
    return {k: v for k, v in source.items()
            if k.upper() not in blocked and not k.upper().startswith(("PYTHON", "CONDA_PREFIX", "PIP_", "UV_"))}


def isolated_environment(python: Path, inherited: Mapping[str, str] | None = None) -> dict[str, str]:
    """Keep credentials/GPU selection, discard Python/package-manager leakage.

    Use the selected interpreter and its native DLL directories first. Merely
    passing an absolute Python path does not neutralize PYTHONPATH/user site.
    """
    source = dict(os.environ if inherited is None else inherited)
    env = _without_package_overrides(source)
    prefix = python.parent.parent if python.parent.name in {"bin", "Scripts"} else python.parent
    # Discard native libraries from the parent engine as well as its Python
    # packages. Keep system CUDA/toolchain paths (needed for native builds).
    parents = {Path(sys.prefix).resolve()}
    parents.update(Path(v).resolve() for k, v in source.items() if v and
                   (k.upper() == "VIRTUAL_ENV" or k.upper().startswith("CONDA_PREFIX")))
    parents.discard(prefix.resolve())

    bins = [python.parent]
    if python.name.lower() == "python.exe":
        bins.extend([prefix / "Scripts", prefix / "Library" / "bin", prefix / "Library" / "usr" / "bin"])
    original_path = next((v for k, v in env.items() if k.upper() == "PATH"), "")
    env = {k: v for k, v in env.items() if k.upper() != "PATH"}
    path_parts = [p for p in original_path.split(os.pathsep)
                  if p and not _from_parent(p, parents) and p not in {str(b) for b in bins}]
    for name in ("LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH", "DYLD_FALLBACK_LIBRARY_PATH"):
        if name in env:
            env[name] = os.pathsep.join(p for p in env[name].split(os.pathsep) if p and not _from_parent(p, parents))
    env.update({"PATH": os.pathsep.join([*(str(b) for b in bins), *path_parts]),
                "PYTHONNOUSERSITE": "1", "PYTHONUNBUFFERED": "1"})
    return env
