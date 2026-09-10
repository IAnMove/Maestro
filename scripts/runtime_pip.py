"""Run uv only against the selected engine, with explicit dependency constraints."""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
from services.runtime_environment import isolated_environment  # noqa: E402
from services.runtime_profiles import recipe  # noqa: E402


def command(engine: str, arguments: list[str]) -> tuple[list[str], dict[str, str]]:
    spec = recipe(engine, sys.platform)
    if Path(sys.prefix).resolve() != (ROOT / spec["env"]).resolve():
        raise RuntimeError(f"Refusing package changes outside {engine}'s environment")
    if not arguments or arguments[0] not in {"install", "uninstall", "check"}:
        raise ValueError("Expected uv pip install, uninstall or check")
    forbidden = {"--python", "--target", "--prefix", "--system", "--user", "-p", "-t"}
    if any(arg.split("=", 1)[0] in forbidden for arg in arguments):
        raise ValueError("The engine recipe owns the package destination")
    uv = shutil.which("uv")
    if not uv:
        raise RuntimeError("Pinokio's uv executable is unavailable")
    env = isolated_environment(Path(sys.executable))
    env["PIP_CONFIG_FILE"] = os.devnull
    constraints = ROOT / spec["constraintFile"]
    env["PIP_CONSTRAINT"] = str(constraints)
    args = [uv, "--no-config", "pip", *arguments, "--python", sys.executable]
    if arguments[0] == "install":
        args.extend(["--constraint", str(constraints),
                     "--default-index", "https://pypi.org/simple",
                     "--index", f"https://download.pytorch.org/whl/cu{spec['cuda'].replace('.', '')}",
                     "--index-strategy", "unsafe-best-match"])
        lock = ROOT / "app" / "runtime" / "locks" / f"{sys.platform}-{engine}.txt"
        if not lock.is_file():
            raise RuntimeError(f"Missing dependency lock for {engine}")
        args.extend(["--constraint", str(lock)])
        env["PIP_CONSTRAINT"] = str(lock)
    return args, env


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", required=True)
    parser.add_argument("arguments", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    arguments = args.arguments[1:] if args.arguments[:1] == ["--"] else args.arguments
    cmd, env = command(args.engine, arguments)
    result = subprocess.run(cmd, env=env)
    if result.returncode:
        raise SystemExit("Error: HOCUS_RUNTIME_FAILED. Package operation failed; environment was not verified.")


if __name__ == "__main__":
    main()
