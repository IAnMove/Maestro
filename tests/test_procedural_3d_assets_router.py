from __future__ import annotations

import json
import struct
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers.procedural_3d_assets import create_procedural_3d_assets_router


GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def _f32(*values: float) -> bytes:
    return b"".join(struct.pack("<f", value) for value in values)


def pack_glb(document: dict, blob: bytes = b"") -> bytes:
    json_bytes = json.dumps(document, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    json_bytes += b" " * ((4 - (len(json_bytes) % 4)) % 4)
    chunks = struct.pack("<II", len(json_bytes), JSON_CHUNK) + json_bytes
    if blob:
        padded = blob + (b"\x00" * ((4 - (len(blob) % 4)) % 4))
        chunks += struct.pack("<II", len(padded), BIN_CHUNK) + padded
    return struct.pack("<III", GLB_MAGIC, 2, 12 + len(chunks)) + chunks


def _tiny_animated_glb() -> bytes:
    times = _f32(0.0, 1.5)
    trans = _f32(0, 0, 0, 1, 0, 0)
    blob = times + trans
    document = {
        "asset": {"version": "2.0"},
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": 8},
            {"buffer": 0, "byteOffset": 8, "byteLength": 24},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 2, "type": "SCALAR"},
            {"bufferView": 1, "componentType": 5126, "count": 2, "type": "VEC3"},
        ],
        "nodes": [{"name": "Root"}],
        "meshes": [{"name": "Box", "primitives": [{"attributes": {"POSITION": 1}}]}],
        "materials": [{"name": "Mat"}],
        "skins": [{"name": "Armature", "joints": [0]}],
        "animations": [
            {
                "name": "Walk",
                "samplers": [{"input": 0, "output": 1, "interpolation": "LINEAR"}],
                "channels": [{"sampler": 0, "target": {"node": 0, "path": "translation"}}],
            }
        ],
    }
    return pack_glb(document, blob)


def _client(resolver) -> TestClient:
    app = FastAPI()
    app.include_router(create_procedural_3d_assets_router(resolve_glb_asset=resolver))
    return TestClient(app)


def test_success_forwards_named_ids_and_omits_paths(tmp_path: Path):
    calls: list[tuple[str, str]] = []
    glb = tmp_path / "secret-dir" / "hero.glb"
    glb.parent.mkdir()
    glb.write_bytes(_tiny_animated_glb())

    def resolve_glb_asset(*, workspace_id: str, asset_id: str) -> Path | None:
        calls.append((workspace_id, asset_id))
        if workspace_id == "stage" and asset_id == "asset_hero":
            return glb
        return None

    client = _client(resolve_glb_asset)
    response = client.get(
        "/api/v1/procedural-3d/assets/asset_hero/inspection",
        params={"workspace": "stage"},
    )
    assert response.status_code == 200
    body = response.json()
    assert calls == [("stage", "asset_hero")]
    assert body["status"] == "valid"
    assert body["animations"][0]["name"] == "Walk"
    assert body["animations"][0]["duration_seconds"] == 1.5
    assert str(tmp_path) not in response.text
    assert "secret-dir" not in response.text
    assert "hero.glb" not in response.text
    assert "/home/" not in response.text


def test_missing_or_invalid_ids_are_400():
    def resolve_glb_asset(*, workspace_id: str, asset_id: str) -> Path | None:
        raise AssertionError("resolver must not run")

    client = _client(resolve_glb_asset)
    assert client.get("/api/v1/procedural-3d/assets/asset_hero/inspection").status_code == 400
    assert client.get(
        "/api/v1/procedural-3d/assets/asset_hero/inspection",
        params={"workspace": ""},
    ).status_code == 400
    assert client.get(
        "/api/v1/procedural-3d/assets/..escape/inspection",
        params={"workspace": "stage"},
    ).status_code == 400
    assert client.get(
        "/api/v1/procedural-3d/assets/asset_hero/inspection",
        params={"workspace": "../stage"},
    ).status_code == 400
    oversized = client.get(
        "/api/v1/procedural-3d/assets/asset_hero/inspection",
        params={"workspace": "w" * 161},
    )
    assert oversized.status_code == 400
    assert oversized.json() == {"detail": "Invalid request"}


def test_unknown_workspace_or_asset_is_404_without_path(tmp_path: Path):
    glb = tmp_path / "other" / "hidden.glb"
    glb.parent.mkdir()
    glb.write_bytes(_tiny_animated_glb())

    def resolve_glb_asset(*, workspace_id: str, asset_id: str) -> Path | None:
        if workspace_id == "stage" and asset_id == "asset_hero":
            return glb
        return None

    client = _client(resolve_glb_asset)
    cross = client.get(
        "/api/v1/procedural-3d/assets/asset_hero/inspection",
        params={"workspace": "other-ws"},
    )
    missing = client.get(
        "/api/v1/procedural-3d/assets/asset_missing/inspection",
        params={"workspace": "stage"},
    )
    assert cross.status_code == 404
    assert missing.status_code == 404
    assert "hidden.glb" not in cross.text + missing.text
    assert str(tmp_path) not in cross.text + missing.text


def test_disappeared_file_and_resolver_errors_are_404_without_paths(tmp_path: Path):
    gone = tmp_path / "vanished.glb"
    gone.write_bytes(_tiny_animated_glb())

    def missing_file(*, workspace_id: str, asset_id: str) -> Path | None:
        gone.unlink()
        return gone

    def exploding(*, workspace_id: str, asset_id: str) -> Path | None:
        raise RuntimeError(f"failed /secret/{workspace_id}/{asset_id}.glb")

    missing = _client(missing_file).get(
        "/api/v1/procedural-3d/assets/asset_hero/inspection",
        params={"workspace": "stage"},
    )
    exploded = _client(exploding).get(
        "/api/v1/procedural-3d/assets/asset_hero/inspection",
        params={"workspace": "stage"},
    )
    assert missing.status_code == 404
    assert exploded.status_code == 404
    assert "/secret/" not in exploded.text
    assert "asset_hero.glb" not in exploded.text
    assert "vanished.glb" not in missing.text
    assert str(tmp_path) not in missing.text + exploded.text
