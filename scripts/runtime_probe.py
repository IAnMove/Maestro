"""Pinokio preflight. Runs with its managed base Python; installs nothing."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
from services.runtime_profiles import detect_profiles  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform")
    parser.add_argument("--arch")
    parser.add_argument("--gpu")
    parser.add_argument("--require-installed", help="Stop Start after an incomplete managed migration")
    args = parser.parse_args()
    result = detect_profiles(platform=args.platform, arch=args.arch, gpu=args.gpu)
    target = ROOT / "app" / ".runtime" / "capabilities.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(f".{os.getpid()}.tmp")
    temporary.write_text(json.dumps(result, indent=2), encoding="utf-8")
    temporary.replace(target)
    for item in result["engines"].values():
        print(f"[Runtime] {item['label']}: {item['id']} — {item['reason'] or item['warning'] or 'recipe available'}")
    if args.require_installed:
        item = result["engines"][args.require_installed]
        if not item["supported"] or not item["installed"]:
            raise SystemExit("Error: HOCUS_RUNTIME_FAILED. Run Install or Update to repair the selected runtime before Start.")


if __name__ == "__main__":
    main()
