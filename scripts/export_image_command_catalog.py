"""Export the executable image contracts consumed by the browser client."""
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
from routers.image_generation_commands import image_command_catalog
from services.studio_image_spec import studio_image_schema


def catalog():
    return {"version": 2, "operations": image_command_catalog(), "studio": studio_image_schema()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    path = ROOT / "ui/src/api/imageCommandCatalog.json"
    expected = json.dumps(catalog(), indent=2, ensure_ascii=False) + "\n"
    if args.check:
        if not path.is_file() or path.read_text(encoding="utf-8") != expected:
            raise SystemExit("Image command projection is stale; run scripts/export_image_command_catalog.py and review its diff")
    else:
        path.write_text(expected, encoding="utf-8")


if __name__ == "__main__":
    main()
