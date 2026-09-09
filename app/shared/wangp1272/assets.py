"""Immutable asset references for the optional WanGP 12.72 runtimes."""

import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request

_MANIFEST = json.loads(Path(__file__).with_name("assets.json").read_text())
REVISIONS = _MANIFEST["revisions"]


def pin_urls(value):
    if isinstance(value, dict):
        return {key: pin_urls(item) for key, item in value.items()}
    if isinstance(value, list):
        return [pin_urls(item) for item in value]
    if isinstance(value, tuple):
        return tuple(pin_urls(item) for item in value)
    if isinstance(value, str):
        for repo, revision in REVISIONS.items():
            value = value.replace(f"{repo}/resolve/main/", f"{repo}/resolve/{revision}/")
    return value


def pin_downloads(definitions):
    return [dict(item, revision=REVISIONS[item["repoId"]])
            if item.get("repoId") in REVISIONS else item for item in definitions]


def affine_package(name):
    """Fetch small affine data on demand; never bundle model tensors in Git."""
    asset = _MANIFEST["affine_maps"][name]
    from shared.utils import files_locator

    def valid(path):
        return (path.is_file() and path.stat().st_size == asset["size"]
                and hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"])

    relative = f"minimax_h3/lora_affine_maps/{name}"
    located = files_locator.locate_file(relative, error_if_none=False)
    if located and valid(Path(located)):
        return Path(located)
    target = Path(files_locator.get_download_location(relative))
    directory = target.parent
    directory.mkdir(parents=True, exist_ok=True)

    if valid(target):
        return target
    descriptor, temporary = tempfile.mkstemp(prefix=name + ".", dir=directory)
    try:
        with os.fdopen(descriptor, "wb") as destination:
            with urllib.request.urlopen(asset["url"], timeout=60) as source:
                remaining = asset["size"] + 1
                while remaining:
                    chunk = source.read(min(remaining, 1024 * 1024))
                    if not chunk:
                        break
                    destination.write(chunk)
                    remaining -= len(chunk)
        if not valid(Path(temporary)):
            raise ValueError(f"H3 affine asset failed size/SHA-256 verification: {name}")
        os.replace(temporary, target)
        return target
    finally:
        Path(temporary).unlink(missing_ok=True)


def dlss_guide_asset(relative):
    """Reuse existing guide checkpoints, downloading into the writable root."""
    from shared.utils import files_locator
    located = files_locator.locate_file(relative, error_if_none=False)
    if located:
        return located
    from huggingface_hub import hf_hub_download
    hf_hub_download(repo_id='DeepBeepMeep/Wan2.1', revision=REVISIONS['DeepBeepMeep/Wan2.1'],
                    filename=relative, local_dir=files_locator.get_download_location())
    return files_locator.locate_file(relative)
