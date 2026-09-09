"""Export the executable Studio music contract for its browser projection."""

from pathlib import Path
import argparse
import json
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
from routers.studio_music_commands import music_command_catalog
from services.studio_music_spec import studio_music_schema


def catalog():
    return {
        "version": 2,
        "operations": [music_command_catalog()],
        "studio": studio_music_schema(),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = json.dumps(catalog(), indent=2, ensure_ascii=False) + "\n"
    path = ROOT / "ui/src/api/musicCommandCatalog.json"
    if args.check:
        if not path.is_file() or path.read_text(encoding="utf-8") != expected:
            raise SystemExit(
                "Music command projection is stale; run scripts/export_music_command_catalog.py and review its diff"
            )
    else:
        path.write_text(expected, encoding="utf-8")


if __name__ == "__main__":
    main()
