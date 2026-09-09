"""Export the executable Studio speech contract for its browser projection."""
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
from routers.studio_speech_commands import speech_command_catalog
from services.studio_speech_spec import studio_speech_schema


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    value = {"version": 2, "operations": [speech_command_catalog()], "studio": studio_speech_schema()}
    expected = json.dumps(value, indent=2, ensure_ascii=False) + "\n"
    target = ROOT / "ui/src/api/speechCommandCatalog.json"
    if args.check:
        if not target.is_file() or target.read_text(encoding="utf-8") != expected:
            raise SystemExit("Speech command projection is stale; regenerate and review its diff")
    else:
        target.write_text(expected, encoding="utf-8")


if __name__ == "__main__":
    main()
