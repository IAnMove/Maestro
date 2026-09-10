"""Select a llama.cpp binary release, excluding source-only marker releases."""
from __future__ import annotations
import json
from urllib.request import Request, urlopen


def has_binary_assets(release: dict, specs: list) -> bool:
    names = [asset.get('name', '') for asset in release.get('assets', [])]
    return all(any(name.startswith(prefix) and suffix in name for name in names)
               for prefix, suffix in specs)


def compatible_binary_release(latest: dict, specs: list) -> dict:
    if has_binary_assets(latest, specs):
        return latest
    req = Request('https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=20',
                  headers={'Accept': 'application/vnd.github+json'})
    with urlopen(req, timeout=15) as response:
        releases = json.load(response)
    for release in releases:
        if not release.get('draft') and has_binary_assets(release, specs):
            return release
    # Caller retains its known-good pinned fallback instead of inventing an
    # asset URL using a source-only version marker such as v0.4.0.
    return {}
