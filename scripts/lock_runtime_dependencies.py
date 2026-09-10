"""Resolve a platform recipe without installing its environments or models.

Requires uv and Node on PATH. Review the resulting diff before committing it.
Native extensions requiring an active CUDA toolchain are installed separately
with explicit pins and these same constraints.
"""
from __future__ import annotations

import argparse
import datetime
import json
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
from services.runtime_profiles import catalog, recipe  # noqa: E402


def resolve(engine: str, platform: str) -> None:
    spec = recipe(engine, platform)
    constraints = ROOT / spec["constraintFile"]
    pins = {**spec["constraints"], **{k: spec[k] + "+cu" + spec["cuda"].replace(".", "")
            for k in ("torch", "torchvision", "torchaudio") if k in spec}}
    constraints.write_text("# ABI contract from app/runtime/profiles.json\n" +
                           "".join(f"{k}=={v}\n" for k, v in pins.items()), encoding="utf-8")
    with tempfile.TemporaryDirectory(prefix="hocus-runtime-lock-") as temporary:
        folder = Path(temporary)
        source = ROOT / spec["requirements"]
        if engine == "minimax_h3":
            vendors = json.loads(subprocess.check_output(
                ["node", "-e", "console.log(JSON.stringify(require('./vendor_revisions')))"], cwd=ROOT, text=True))
            vendor = vendors[engine]
            url = vendor["url"].replace("https://github.com/", "https://raw.githubusercontent.com/")
            source = folder / "upstream.txt"
            with urllib.request.urlopen(f"{url}/{vendor['revision']}/requirements.txt", timeout=30) as response:
                source.write_bytes(response.read())
        inputs = folder / "requirements.in"
        inputs.write_text(f"-r {source.as_posix()}\n" + "\n".join(spec.get("acceleratorPackages", [])) +
                          ("\nhf-xet\npip\n" if engine == "wangp" else "\n"), encoding="utf-8")
        output = folder / "resolved.txt"
        subprocess.run(["uv", "--no-config", "pip", "compile", str(inputs), "--constraint", str(constraints),
                        "--extra-index-url", f"https://download.pytorch.org/whl/cu{spec['cuda'].replace('.', '')}",
                        "--index-strategy", "unsafe-best-match", "--python-version", spec["python"],
                        "--python-platform", {"linux": "x86_64-unknown-linux-gnu", "win32": "x86_64-pc-windows-msvc"}[platform],
                        "--no-annotate", "--quiet", "--output-file", str(output)], cwd=ROOT, check=True)
        content = "\n".join(line for line in output.read_text().splitlines() if not line.startswith("#"))
        lock = ROOT / "app/runtime/locks" / f"{platform}-{engine}.txt"
        lock.parent.mkdir(exist_ok=True)
        lock.write_text(f"# Resolved for {platform} x64 / {engine}, {datetime.date.today()}.\n"
                        "# Regenerate with scripts/lock_runtime_dependencies.py; native extensions use explicit recipe pins.\n" +
                        content.strip() + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", required=True, choices=catalog()["engines"])
    parser.add_argument("--platform", required=True, choices=catalog()["platforms"])
    args = parser.parse_args()
    if args.platform not in catalog()["engines"][args.engine]["platforms"]:
        parser.error("No recipe for that engine/platform")
    resolve(args.engine, args.platform)
