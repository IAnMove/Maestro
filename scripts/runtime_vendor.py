"""Repair missing tracked source files after a pinned vendor checkout."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
from services.runtime_sources import restore_missing  # noqa: E402

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vendor")
    restore_missing(parser.parse_args().vendor)
