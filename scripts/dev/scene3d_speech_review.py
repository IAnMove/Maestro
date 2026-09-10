"""Local review API only. Never imports the generation backend or uses paid providers.

python scripts/dev/scene3d_speech_review.py --assets ABSOLUTE_IGNORED_FOLDER --port 8792
Point a separate Vite HOCUSPOCUS_API_TARGET at this port.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys
import time
import uuid

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Request
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "app"))
from routers.character_kit_face import create_character_kit_face_router  # noqa: E402
from services.character_kit_library import read_character_kit_library, patch_character_kit, CharacterKitRevisionConflict  # noqa: E402


def review_app(assets: Path) -> FastAPI:
    assets = assets.resolve()
    assets.mkdir(parents=True, exist_ok=True)
    app = FastAPI(title="3D voice review only — no generation services")
    app.include_router(create_character_kit_face_router(workspace_dir=lambda _: str(assets), uploads_root=lambda: str(assets)))

    @app.get("/api/v1/character-kits/library")
    def character_library(workspace: str):
        if workspace != "speech-review":
            raise HTTPException(400, "Only the isolated review workspace is available.")
        return read_character_kit_library(str(assets))

    @app.patch("/api/v1/character-kits/library/kits/{kit_id}")
    async def save_character(kit_id: str, request: Request):
        body = await request.json()
        if body.get("workspace") != "speech-review":
            raise HTTPException(400, "Only the isolated review workspace is available.")
        try:
            return patch_character_kit(str(assets), kit_id, body.get("kit"), base_revision=body.get("baseRevision"))
        except CharacterKitRevisionConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    # Read-only empty boot fixtures for the REAL Hocuspocus UI at /. This process
    # has no credentials, generation runtime, account or production workspace.
    boot = {
        "auth/lan/status": {"enabled": False, "required": False, "authenticated": True},
        "models": {"families": [], "models": []},
        "model-visibility": {"configured": True, "enabled_models": [], "initialized_mature_models": [], "defaults_version": 9},
        "model-selections": {"configured": True, "selected_models": {}, "sources": {}},
        "production-profile": {"configured": True, "profile": {
            "version": 1, "text": {"provider": "local", "model": "", "base_url": ""},
            "image": {"provider": "local", "model": ""}, "music": {"provider": "local", "model": ""},
            "model3d": {"provider": "local", "model": ""},
            "video": {"provider": "local", "model": "", "settings": {"profile": "quality", "steps": 20,
                "flowShift": 12, "audioShift": 3, "turbo": False, "cache": False,
                "loras": [], "resolution": "540p", "aspectRatio": "16:9"}}}},
        "workspaces": {"workspaces": [{"name": "speech-review"}], "active": "speech-review"},
        "system-config": {"app_version": "local-review / sin generación", "attention_modes_available": [], "model_folders": []},
        "services-config": {"llm_provider": "local", "llm_model_id": "", "show_experimental": False, "nsfw_mode": False},
        "llm/status": {"loaded": False, "model_id": None, "device": None, "provider": "local"},
        "llm/models": {"models": []},
        "wangp/capabilities": {"processors": []},
        "jobs": {"jobs": []},
        "jobs/recovery": {"jobs": []},
        "director/pipelines": {"pipelines": [], "total": 0},
        "director/pipelines/active": {"pipelines": []},
        "system/preflight": {"ok": False, "checks": [], "message": "Local review only; generation is unavailable."},
        "system-stats": {"cpu": {"percent": 0}, "ram": {"percent": 0, "used_gb": 0, "total_gb": 0},
                         "gpu": {"available": False, "percent": 0, "vram_used_gb": 0, "vram_total_gb": 0, "vram_percent": 0},
                         "model": {"name": None, "model_type": None, "loaded": False},
                         "runtime": {"instance_id": "speech-review", "ui_build_id": "speech-review"}},
        "downloads/active": {"downloads": []},
        "loras/installed": {"loras": [], "manifest_last_check_at": None},
        "loras/update-manifest": {"version": 1, "entries": []},
        "models/downloads/status": {"downloads": {}},
        "tasks": {"workspace": "speech-review", "tasks": [], "latest_event_id": 0},
        "wizard/conversations": {"version": 1, "revision": 0, "messages": [], "executions": []},
        "wizard/workflows": {"version": 1, "revision": 0, "workflows": []},
        "stories/library": {"version": 2, "revision": 0, "activeId": "", "projects": {}},
        "resolutions": {"resolutions": []}, "recipes": {"recipes": []}, "presets": {"presets": []},
        "assets": {"assets": [], "total": 0, "has_more": False},
        "system-detect": {"auto_enabled": False, "hardware": {"cuda_available": False, "gpu_name": "",
            "gpu_vram_gb": 0, "ram_gb": 0, "cpu_count": 0, "ram_tier": "low", "vram_tier": "none"},
            "recommended": {}},
    }

    @app.get("/api/v1/outputs")
    def outputs():
        # Reuse only references already present in the optional native demo shot.
        # No discovery of the user's real workspace or credential files.
        result = []
        seed = assets / "portrait.world3d.json"
        if seed.is_file():
            shot = json.loads(seed.read_text(encoding="utf-8"))
            for slot in shot.get("slots", []):
                for ref, kind in [(slot.get("sourceRef"), "model3d"), (slot.get("speech", {}).get("audio"), "audio")]:
                    if not ref or not ref.get("url", "").startswith("/api/review/files/"):
                        continue
                    name = ref["url"].rsplit("/", 1)[-1]
                    target = assets / name
                    if target.parent != assets or not target.is_file():
                        continue
                    result.append({"name": ref.get("filename", name), "url": ref["url"], "type": kind,
                        "mode": None, "size": target.stat().st_size, "created_at": target.stat().st_mtime,
                        "thumbnail_url": "", "workspace_id": "speech-review"})
        return {"outputs": result, "total": len(result), "has_more": False}

    async def store(file: UploadFile):
        extension = Path(file.filename or "asset.bin").suffix.lower()
        name = uuid.uuid4().hex + extension
        target = assets / name
        with target.open("xb") as out:
            while chunk := await file.read(1024 * 1024):
                out.write(chunk)
        return name, target

    @app.post("/api/v1/upload")
    @app.post("/api/v1/upload-audio")
    async def upload(file: UploadFile = File(...)):
        name, target = await store(file)
        return {"filename": name, "path": str(target), "url": "/api/review/files/" + name}

    @app.post("/api/v1/scenes/recordings")
    async def recording(file: UploadFile = File(...), metadata: str = Form(...)):
        name, target = await store(file)
        target.with_suffix(".metadata.json").write_text(json.dumps(json.loads(metadata), indent=2), encoding="utf-8")
        return {"name": name, "url": "/api/review/files/" + name, "type": "video", "mode": None,
                "size": target.stat().st_size, "created_at": time.time(), "thumbnail_url": ""}

    app.mount("/api/review/files", StaticFiles(directory=str(assets)), name="review-assets")

    @app.get("/api/v1/file/{name}")
    def review_file(name: str):
        target = (assets / name).resolve()
        if target.parent != assets or target.suffix.lower() not in {".glb", ".wav", ".png", ".mp4"} or not target.is_file():
            raise HTTPException(404, "No such review asset.")
        return FileResponse(target)

    @app.put("/api/v1/{route:path}")
    async def ephemeral_preferences(route: str, request: Request):
        # Boot saves these automatically. Keep them only in this review process.
        if route not in {"model-visibility", "model-selections", "wizard/conversations"}:
            raise HTTPException(503, "Saving this resource is not available in local review.")
        if len(body := await request.body()) > 2 * 1024 * 1024:
            raise HTTPException(413, "Review preference too large.")
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise HTTPException(400, "Expected an object.")
        boot[route] = {**boot[route], **payload}
        return boot[route]

    @app.post("/api/v1/loras/check-updates")
    def no_lora_updates():
        return {"updated": 0}

    @app.get("/api/v1/{route:path}")
    def shell_fixture(route: str):
        if route == "tasks/events":
            return Response(": local review; no task events\n\n", media_type="text/event-stream")
        if route in boot:
            return boot[route]
        if route.startswith(("defaults/", "model-options/")):
            return {}
        if route.startswith("loras/"):
            return {"loras": [], "guidance_max_phases": 1, "manifest_last_check_at": None}
        if route.startswith("outputs/") and route.endswith("/metadata"):
            return {"source": "none", "params": None}
        raise HTTPException(503, "Not available in local review. No generation services are connected.")

    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8792)
    args = parser.parse_args()
    uvicorn.run(review_app(args.assets), host="127.0.0.1", port=args.port)
