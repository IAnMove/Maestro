from __future__ import annotations

import io
import json
import stat
import sys
import zipfile
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers.scene_packages import create_scene_packages_router
from services.scene_library import save_world3d
from services.scene_packages import (
    MAX_ZIP_BYTES,
    PACKAGE_KIND,
    TEMPLATE_KIND,
    ScenePackageError,
    ScenePackageSecurity,
    ScenePackageTooLarge,
    find_existing_by_hash,
    import_package,
    make_workspace_reader,
    preflight_package,
    sha256_bytes,
    write_package_zip,
)


def _client(tmp_path: Path) -> tuple[TestClient, dict[str, Path]]:
    roots = {
        "film": tmp_path / "film",
        "lab": tmp_path / "lab",
        "__uploads__": tmp_path / "uploads",
    }
    for path in roots.values():
        path.mkdir(parents=True, exist_ok=True)
    app = FastAPI()
    app.include_router(create_scene_packages_router(
        list_workspaces=lambda: [{"name": "film"}, {"name": "lab"}],
        workspace_dir=lambda name: str(roots[name]),
        uploads_dir=lambda: str(roots["__uploads__"]),
    ))
    return TestClient(app), roots


def _png() -> bytes:
    return b"\x89PNG\r\n\x1a\npreview"


def _preview() -> str:
    import base64
    return "data:image/png;base64," + base64.b64encode(_png()).decode()


def _source(workspace: str, filename: str, asset_id: str) -> dict:
    url = f"/api/v1/file/{filename}?workspace={workspace}"
    return {"workspaceId": workspace, "filename": filename, "url": url, "assetId": asset_id}


def _shot(*, title: str, glb: dict, voice: dict, screen: dict, environment: dict, extra=None) -> dict:
    document = {
        "version": 1,
        "units": "meters",
        "up": "y",
        "width": 1280,
        "height": 720,
        "fps": 30,
        "duration": 4,
        "templateId": "two-shot",
        "production": {"kind": "dialogue", "title": title, "workspace": glb["workspaceId"]},
        "camera": {"family": "establishment", "eye": [0, 1.6, 4.2], "look": [0, 1, 0], "fov": 50},
        "light": {"kind": "directional", "direction": [-0.35, -1, -0.25], "intensity": 1.15, "color": "#fff4e5"},
        "environment": {"reflectiveFloor": True, "platform": True, "bloom": 0.48},
        "texts": [{
            "id": "title", "text": title, "start": 0, "end": 3, "preset": "impact",
            "x": 50, "y": 80, "size": 9, "color": "#ffe3a0", "rotation": 0,
        }],
        "sfx": [{
            "id": "flash-1", "kind": "sparks", "start": 0.2, "end": 1.2,
            "x": 50, "y": 50, "size": 65, "intensity": 1, "color": "#ffbb55",
            "seed": 3, "sound": True, "volume": 0.25,
        }],
        "worldSfx": [{
            "id": "portal-1", "kind": "portal", "start": 0, "end": 2,
            "position": {"x": 0, "y": 1.1, "z": -1.2},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "scale": 1.4, "intensity": 1, "color": "#88ccff", "seed": 1,
            "sound": True, "volume": 0.25,
        }],
        "slots": [
            {
                "id": "subject_1",
                "slot": "subject_1",
                "position": [-0.85, 0, 0],
                "rotationY": 0.35,
                "scale": 1,
                "sourceUrl": glb["url"],
                "sourceRef": glb,
                "media": "model3d",
                "clip": {"index": 0, "name": "Idle"},
                "clipPlayback": {"speed": 1, "start": 0, "loop": True},
                "motion": {"to": [0.85, 0, 0], "easing": "smooth"},
                "speech": {
                    "version": 1, "enabled": True,
                    "cues": [{"start": 0, "end": 0.4, "viseme": "A"}],
                    "driver": "imported", "start": 0, "offset": 0, "gain": 1, "strength": 0.85,
                    "clean": True, "style": "soft", "lip": "#874d47", "expression": "neutral",
                    "blink": True, "eyes": True, "audio": voice,
                },
                "screen": {
                    "sourceUrl": screen["url"], "sourceRef": screen, "media": "image",
                    "mode": "mesh", "targetMesh": "SCREEN_CONTENT", "anchor": "",
                    "offset": [0, 0, 0], "pitch": 0, "yaw": 0, "roll": 0,
                    "width": 4, "height": 3, "style": "monitor", "fit": "contain",
                    "start": 0, "speed": 1, "loop": True, "flipY": False,
                },
            },
            {
                "id": "background",
                "slot": "background",
                "position": [0, 0, -6],
                "rotationY": 0,
                "scale": 1,
                "sourceUrl": environment["url"],
                "sourceRef": environment,
                "media": "image",
                "surface": "environment",
                "clip": None,
            },
        ],
        "soundtrack": [{"id": "bed", "audio": voice, "start": 0, "offset": 0, "gain": 0.8}],
    }
    if extra:
        document.update(extra)
    return document


def _seed_film(root: Path) -> dict[str, dict]:
    (root / "hero.glb").write_bytes(b"glb-shared")
    (root / "voice.wav").write_bytes(b"RIFF-voice")
    (root / "screen.png").write_bytes(_png() + b"-screen")
    (root / "env.png").write_bytes(_png() + b"-env")
    return {
        "glb": _source("film", "hero.glb", "asset_hero"),
        "voice": _source("film", "voice.wav", "asset_voice"),
        "screen": _source("film", "screen.png", "asset_screen"),
        "env": _source("film", "env.png", "asset_env"),
    }


def test_format_and_router_isolation(tmp_path: Path):
    sys.modules.pop("_launch_runtime", None)
    sys.modules.pop("app._launch_runtime", None)
    client, _roots = _client(tmp_path)
    body = client.get("/api/v1/scene-packages/format").json()
    assert body["kind"] == PACKAGE_KIND
    assert body["template_kind"] == TEMPLATE_KIND
    assert body["schema_version"] == 1
    assert "_launch_runtime" not in sys.modules
    assert "app._launch_runtime" not in sys.modules


def test_export_two_shots_dedupes_shared_glb_and_audio(tmp_path: Path):
    client, roots = _client(tmp_path)
    refs = _seed_film(roots["film"])
    shots = [
        _shot(title="One", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"]),
        _shot(title="Two", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"]),
    ]
    response = client.post("/api/v1/scene-packages/export", json={
        "workspace": "film", "title": "Pair", "documents": shots,
    })
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/zip")
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        names = [info.filename for info in archive.infolist() if not info.is_dir()]
        manifest = json.loads(archive.read("package.json"))
    media = [name for name in names if name.startswith("media/")]
    assert len(media) == 4
    assert manifest["kind"] == PACKAGE_KIND
    assert len(manifest["documents"]) == 2
    glb_asset = next(item for item in manifest["assets"] if item["filename"] == "hero.glb")
    assert len(glb_asset["uses"]) == 2
    voice_asset = next(item for item in manifest["assets"] if item["filename"] == "voice.wav")
    assert len(voice_asset["uses"]) >= 2


def test_import_preserves_lips_screen_animation_text_environment_sfx(tmp_path: Path):
    client, roots = _client(tmp_path)
    refs = _seed_film(roots["film"])
    shots = [
        _shot(title="One", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"]),
        _shot(title="Two", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"]),
    ]
    exported = client.post("/api/v1/scene-packages/export", json={
        "workspace": "film", "title": "Pair", "documents": shots,
    })
    imported = client.post(
        "/api/v1/scene-packages/import",
        data={"workspace": "lab", "reassign": "[]"},
        files={"file": ("pair.scene-package.zip", exported.content, "application/zip")},
    )
    assert imported.status_code == 200, imported.text
    body = imported.json()
    assert body["ok"] is True
    assert len(body["scenes"]) == 2
    assert body["assets_created"] == 4
    lab_files = {path.name: path for path in roots["lab"].iterdir() if path.is_file()}
    scenes = [json.loads(path.read_text()) for name, path in lab_files.items() if name.endswith(".world3d.scene.json")]
    assert len(scenes) == 2
    for document in scenes:
        slot = document["slots"][0]
        assert slot["speech"]["cues"][0]["viseme"] == "A"
        assert slot["speech"]["audio"]["workspaceId"] == "lab"
        assert slot["speech"]["audio"]["url"].startswith("/api/v1/file/")
        assert slot["screen"]["sourceUrl"].startswith("/api/v1/file/")
        assert slot["clip"] == {"index": 0, "name": "Idle"}
        assert slot["clipPlayback"]["loop"] is True
        assert slot["motion"]["to"] == [0.85, 0, 0]
        assert document["texts"][0]["text"] in {"One", "Two"}
        assert document["environment"]["reflectiveFloor"] is True
        assert document["slots"][1]["surface"] == "environment"
        assert document["worldSfx"][0]["kind"] == "portal"
        assert document["sfx"][0]["kind"] == "sparks"
        assert document["soundtrack"][0]["audio"]["filename"].endswith(".wav")
    media = [name for name in lab_files if not name.endswith(".json") and not name.endswith(".preview.png") and ".meta.json" not in name]
    assert len(media) == 4


def test_repeat_import_reuses_hashed_media(tmp_path: Path):
    client, roots = _client(tmp_path)
    refs = _seed_film(roots["film"])
    shots = [_shot(title="One", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"])]
    exported = client.post("/api/v1/scene-packages/export", json={
        "workspace": "film", "documents": shots,
    }).content
    first = client.post("/api/v1/scene-packages/import", data={"workspace": "lab", "reassign": "[]"},
                        files={"file": ("a.zip", exported, "application/zip")})
    second = client.post("/api/v1/scene-packages/import", data={"workspace": "lab", "reassign": "[]"},
                         files={"file": ("a.zip", exported, "application/zip")})
    assert first.status_code == 200 and second.status_code == 200, second.text
    assert second.json()["assets_reused"] == 4
    assert second.json()["assets_created"] == 0
    media = [path for path in roots["lab"].iterdir()
             if path.is_file() and path.suffix in {".glb", ".wav", ".png"} and not path.name.endswith(".preview.png")]
    assert len(media) == 4
    scenes = list(roots["lab"].glob("*.world3d.scene.json"))
    assert len(scenes) == 2


def test_tampered_asset_is_detected_and_replaced(tmp_path: Path):
    client, roots = _client(tmp_path)
    refs = _seed_film(roots["film"])
    shots = [_shot(title="One", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"])]
    exported = client.post("/api/v1/scene-packages/export", json={"workspace": "film", "documents": shots}).content
    buffer = io.BytesIO(exported)
    with zipfile.ZipFile(buffer, "r") as original:
        manifest = json.loads(original.read("package.json"))
        glb = next(item for item in manifest["assets"] if item["filename"] == "hero.glb")
        rewritten = io.BytesIO()
        with zipfile.ZipFile(rewritten, "w") as dirty:
            for info in original.infolist():
                data = original.read(info.filename)
                if info.filename == glb["path"]:
                    data = b"not-the-glb"
                dirty.writestr(info, data)
    tampered = rewritten.getvalue()
    report = client.post("/api/v1/scene-packages/preflight",
                         files={"file": ("bad.zip", tampered, "application/zip")}).json()
    assert report["ok"] is False
    assert any(issue["code"] == "tampered_asset" and issue["repair"] for issue in report["issues"])
    blocked = client.post("/api/v1/scene-packages/import", data={"workspace": "lab", "reassign": "[]"},
                          files={"file": ("bad.zip", tampered, "application/zip")})
    assert blocked.status_code == 422
    (roots["lab"] / "hero.glb").write_bytes(b"glb-shared")
    repaired = client.post(
        "/api/v1/scene-packages/import",
        data={"workspace": "lab", "reassign": json.dumps([{"sha256": glb["sha256"], "filename": "hero.glb", "workspace": "lab"}])},
        files={"file": ("bad.zip", tampered, "application/zip")},
    )
    assert repaired.status_code == 200, repaired.text
    scene = json.loads(next(roots["lab"].glob("*.world3d.scene.json")).read_text())
    assert scene["slots"][0]["sourceRef"]["filename"] == "hero.glb"


def test_failed_import_leaves_previous_project_intact(tmp_path: Path):
    client, roots = _client(tmp_path)
    refs = _seed_film(roots["film"])
    existing = save_world3d(
        {"workspace": "lab", "name": "Keep me", "preview": _preview(),
         "document": _shot(title="Keep", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"])},
        lambda name: roots[name],
    )
    before = {path.name: path.read_bytes() for path in roots["lab"].iterdir() if path.is_file()}
    broken = _shot(title="Bad", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"])
    broken["cinema"] = {"extension": "gandalf-portal-v1"}
    archive = client.post("/api/v1/scene-packages/export", json={"workspace": "film", "documents": [broken]})
    # Export itself should refuse unknown cinema.
    assert archive.status_code == 422
    shots = [_shot(title="Ok", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"])]
    zip_bytes = client.post("/api/v1/scene-packages/export", json={"workspace": "film", "documents": shots}).content
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as original:
        rewritten = io.BytesIO()
        with zipfile.ZipFile(rewritten, "w") as dirty:
            for info in original.infolist():
                data = original.read(info.filename)
                if info.filename.startswith("documents/"):
                    document = json.loads(data)
                    document["duration"] = 0
                    data = json.dumps(document).encode()
                dirty.writestr(info, data)
    failed = client.post("/api/v1/scene-packages/import", data={"workspace": "lab", "reassign": "[]"},
                         files={"file": ("bad.zip", rewritten.getvalue(), "application/zip")})
    assert failed.status_code == 422
    after = {path.name: path.read_bytes() for path in roots["lab"].iterdir() if path.is_file()}
    assert after == before
    assert (roots["lab"] / existing["name"]).is_file()


def test_reject_path_traversal_symlink_and_absolute_members(tmp_path: Path):
    client, roots = _client(tmp_path)
    for name, payload in {
        "slip.zip": ("../../etc/passwd", b"root"),
        "abs.zip": ("/tmp/evil.glb", b"x"),
        "nested.zip": ("media/../../evil.glb", b"x"),
    }.items():
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("package.json", json.dumps({
                "kind": PACKAGE_KIND, "schema_version": 1, "documents": [], "assets": [],
            }))
            archive.writestr(payload[0], payload[1])
        response = client.post("/api/v1/scene-packages/preflight",
                               files={"file": (name, buffer.getvalue(), "application/zip")})
        assert response.status_code == 422, response.text
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("package.json", json.dumps({
            "kind": PACKAGE_KIND, "schema_version": 1, "documents": [], "assets": [],
        }))
        info = zipfile.ZipInfo("media/" + "a" * 64 + ".glb")
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(info, b"target")
    response = client.post("/api/v1/scene-packages/preflight",
                           files={"file": ("link.zip", buffer.getvalue(), "application/zip")})
    assert response.status_code == 422


def test_reject_external_links_oversized_zip_unknown_cinema_and_template(tmp_path: Path):
    client, roots = _client(tmp_path)
    refs = _seed_film(roots["film"])
    external = _shot(title="Net", glb={**refs["glb"], "url": "https://evil.example/hero.glb"},
                     voice=refs["voice"], screen=refs["screen"], environment=refs["env"])
    response = client.post("/api/v1/scene-packages/export", json={"workspace": "film", "documents": [external]})
    assert response.status_code == 422
    cinema = _shot(title="Cinema", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"],
                   extra={"cinemaExtension": "tools/cinema"})
    response = client.post("/api/v1/scene-packages/export", json={"workspace": "film", "documents": [cinema]})
    assert response.status_code == 422
    template = {
        "kind": TEMPLATE_KIND, "version": 1, "id": "user-1", "title": "Cafe",
        "description": "", "includeAssets": False, "createdAt": "2026-09-11T00:00:00Z",
        "document": _shot(title="Cafe", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"]),
    }
    response = client.post("/api/v1/scene-packages/preflight",
                           files={"file": ("cafe.world3d.template.json", json.dumps(template).encode(), "application/json")})
    assert response.status_code == 422
    assert "template" in response.json()["detail"].lower()
    monkey_zip = tmp_path / "tiny.zip"
    monkey_zip.write_bytes(b"PK\x03\x04" + b"0" * 80)
    original = MAX_ZIP_BYTES
    try:
        import services.scene_packages as pkg
        pkg.MAX_ZIP_BYTES = 10
        from services.scene_packages import inspect_zip_members
        with pytest.raises(ScenePackageTooLarge):
            inspect_zip_members(monkey_zip)
    finally:
        import services.scene_packages as pkg
        pkg.MAX_ZIP_BYTES = original


def test_unknown_fields_are_listed_and_kept(tmp_path: Path):
    client, roots = _client(tmp_path)
    refs = _seed_film(roots["film"])
    shot = _shot(title="Flags", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"],
                 extra={"customRendererFlag": True})
    shot["slots"][0]["mysteryRig"] = {"bones": 2}
    exported = client.post("/api/v1/scene-packages/export", json={"workspace": "film", "documents": [shot]})
    assert exported.status_code == 200, exported.text
    report = client.post("/api/v1/scene-packages/preflight",
                         files={"file": ("flags.zip", exported.content, "application/zip")}).json()
    joined = " ".join(report["unknown_fields"])
    assert "customRendererFlag" in joined
    assert "mysteryRig" in joined
    imported = client.post("/api/v1/scene-packages/import", data={"workspace": "lab", "reassign": "[]"},
                           files={"file": ("flags.zip", exported.content, "application/zip")})
    assert imported.status_code == 200, imported.text
    document = json.loads(next(roots["lab"].glob("*.world3d.scene.json")).read_text())
    assert document["customRendererFlag"] is True
    assert document["slots"][0]["mysteryRig"] == {"bones": 2}


def test_wrapper_is_accepted_inside_a_package_but_not_as_the_package(tmp_path: Path):
    client, roots = _client(tmp_path)
    refs = _seed_film(roots["film"])
    inner = _shot(title="Wrap", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"])
    wrapper = {
        "kind": TEMPLATE_KIND, "version": 1, "id": "user-cafe", "title": "Cafe",
        "description": "", "includeAssets": True, "createdAt": "2026-09-11T00:00:00Z",
        "document": inner,
    }
    exported = client.post("/api/v1/scene-packages/export", json={"workspace": "film", "documents": [wrapper]})
    assert exported.status_code == 200, exported.text
    with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
        manifest = json.loads(archive.read("package.json"))
        packed = json.loads(archive.read(manifest["documents"][0]["path"]))
    assert manifest["kind"] == PACKAGE_KIND
    assert packed["kind"] == TEMPLATE_KIND
    imported = client.post("/api/v1/scene-packages/import", data={"workspace": "lab", "reassign": "[]"},
                           files={"file": ("wrap.zip", exported.content, "application/zip")})
    assert imported.status_code == 200, imported.text
    document = json.loads(next(roots["lab"].glob("*.world3d.scene.json")).read_text())
    assert document["texts"][0]["text"] == "Wrap"
    assert document.get("kind") != TEMPLATE_KIND


def test_service_helpers_without_http(tmp_path: Path):
    film = tmp_path / "film"
    lab = tmp_path / "lab"
    film.mkdir()
    lab.mkdir()
    refs = _seed_film(film)
    reader = make_workspace_reader(lambda name: str(tmp_path / name))
    shot = _shot(title="Solo", glb=refs["glb"], voice=refs["voice"], screen=refs["screen"], environment=refs["env"])
    archive = write_package_zip([shot], reader, workspace="film", title="Solo")
    path = tmp_path / "solo.zip"
    path.write_bytes(archive)
    report = preflight_package(path)
    assert report["ok"] is True
    result = import_package(path, workspace="lab", workspace_dir=lambda name: str(tmp_path / name), reader=reader)
    assert result["assets_created"] == 4
    glb = lab / "hero.glb"
    assert find_existing_by_hash(lab, sha256_bytes(b"glb-shared"), len(b"glb-shared")) == glb
    with pytest.raises(ScenePackageError):
        require = __import__("services.scene_packages", fromlist=["require_workspace"]).require_workspace
        require("../nope")
    with pytest.raises(ScenePackageSecurity):
        write_package_zip([
            _shot(title="X", glb={**refs["glb"], "url": "blob:temp"}, voice=refs["voice"],
                  screen=refs["screen"], environment=refs["env"]),
        ], reader, workspace="film")
