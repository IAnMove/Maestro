"""Export the executable Tools upscale contract consumed by the browser client."""
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
from routers.tools_upscale_commands import tools_upscale_command_catalog
from services.tools_upscale_spec import tools_upscale_schema


def catalog():
    return {
        "version": 2,
        "operations": [tools_upscale_command_catalog()],
        "studio": tools_upscale_schema(),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    path = ROOT / "ui/src/api/toolsCommandCatalog.json"
    expected = json.dumps(catalog(), indent=2, ensure_ascii=False) + "\n"
    if args.check:
        if not path.is_file() or path.read_text(encoding="utf-8") != expected:
            raise SystemExit(
                "Tools command projection is stale; run scripts/export_tools_command_catalog.py and review its diff"
            )
    else:
        path.write_text(expected, encoding="utf-8")


if __name__ == "__main__":
    main()
