"""Apple Silicon core/remote server: editors, projects and remote APIs without Torch."""
from __future__ import annotations

import json
import os
import shutil
import sys
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from fastapi import File, UploadFile

from routers.assets import create_assets_router
from routers.comics import create_comics_router
from routers.lan_auth import create_lan_auth_router
from routers.projects import create_projects_router
from routers.productions import create_productions_router
from routers.recipes import create_recipes_router
from routers.scene_commands import create_scene_commands_router
from routers.style_library import create_style_library_router
from routers.system_capabilities import create_system_capabilities_router, require_capability_http
from routers.workspace_collections import create_workspace_collections_router
from services import core_editor, core_workspace as core
from services.platform_capabilities import platform_capabilities
from services.scene_commands import SceneCommands
from services.style_library import StyleLibrary
from services.ui_distribution import build_status, recovery_html, report_identity
from services.wizard_conversations import (
    WizardConversationRevisionConflict,
    read_conversation,
    write_conversation,
)
from services.wizard_workflows import (
    WizardWorkflowRevisionConflict,
    read_workflows,
    write_workflows,
)
from services.workspace_registry import WorkspaceRegistry

api = FastAPI(title="HocusPocus core")
api.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost|\d+\.localhost)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)
api.include_router(create_lan_auth_router())
api.include_router(create_system_capabilities_router())
api.include_router(create_projects_router(list_workspaces=core.list_workspaces, workspace_dir=core.workspace_dir))
api.include_router(create_assets_router(
    list_workspaces=core.list_workspaces,
    workspace_dir=core.workspace_dir,
    uploads_dir=core.uploads_dir,
))
api.include_router(create_recipes_router(
    workspace_dir=core.workspace_dir,
    nsfw_allowed=lambda: False,
    get_model_def=lambda _name: None,
    safe_join=core.safe_join,
))
api.include_router(create_productions_router(
    list_workspaces=core.list_workspaces,
    list_pipelines=lambda _workspace: [],
))
api.include_router(create_workspace_collections_router(
    registry=lambda: WorkspaceRegistry(os.path.join(str(core.outputs_root()), "_hocuspocus", "workspaces-v1.json")),
))
api.include_router(create_style_library_router(StyleLibrary(str(core.outputs_root()))))
api.include_router(create_comics_router(
    workspace_dir=core.workspace_dir,
    get_active_workspace=core.active_workspace,
    safe_join=core.safe_join,
    get_services_config=core.services_raw,
    publish_legacy_task=None,
))
api.include_router(create_scene_commands_router(SceneCommands(core.workspace_dir)))

BLOCKED = (
    ("POST", "/api/v1/generate", "wangp_local"),
    ("POST", "/api/v1/recast", "wangp_local"),
    ("POST", "/api/v1/tools/upscale", "wangp_local"),
    ("POST", "/api/v1/model3d/generate", "hunyuan3d_local"),
    ("POST", "/api/v1/rig/generate", "unirig_ai"),
    ("POST", "/api/v1/tools/remove-background", "sam_inpaint"),
    ("POST", "/api/v1/tools/revoice", "local_audio_ai"),
    ("POST", "/api/v1/retake", "wangp_local"),
)


def _block(capability: str):
    def endpoint():
        require_capability_http(capability)
        return {"status": "ok"}
    return endpoint


for method, path, capability in BLOCKED:
    api.add_api_route(path, _block(capability), methods=[method])


@api.get("/api/v1/system/preflight")
def system_preflight():
    checks = []
    if shutil.which("ffmpeg") is None:
        checks.append({"id": "ffmpeg", "level": "error",
                       "message": "ffmpeg was not found on PATH. Video and audio export will fail."})
    return {"ok": not any(item["level"] == "error" for item in checks), "checks": checks}


@api.get("/api/v1/models")
def list_models():
    return {"families": [], "models": []}


@api.get("/api/v1/workspaces")
def list_workspaces_endpoint():
    return {"workspaces": core.list_workspaces(), "active": core.active_workspace()}


@api.put("/api/v1/workspaces/active")
async def set_active_workspace(request: Request):
    body = await request.json()
    name = str(body.get("name") or "default")
    try:
        path = core.workspace_dir(name)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    data = core.load_config()
    data.setdefault("services", {})["active_workspace"] = name
    core.save_config(data)
    return {"status": "ok", "active": name, "path": path}


@api.post("/api/v1/workspaces")
async def create_workspace(request: Request):
    body = await request.json()
    name = str(body.get("name") or "").strip()
    try:
        path = core.workspace_dir(name)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"status": "ok", "name": name, "path": path}


@api.get("/api/v1/outputs")
def list_outputs(workspace: str = ""):
    try:
        return core.list_outputs(workspace)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.get("/api/v1/file/{filename:path}")
def serve_file(filename: str, workspace: str | None = None):
    folder = core.uploads_dir() if workspace == "__uploads__" else core.workspace_dir(workspace)
    path = core.safe_join(folder, filename)
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Output file not found")
    return FileResponse(path)


@api.get("/api/v1/system-config")
def get_system_config():
    return core.system_config()


@api.put("/api/v1/system-config")
async def put_system_config(request: Request):
    body = await request.json()
    data = core.load_config()
    for key in ("video_output_codec", "image_output_codec"):
        if key in body:
            data[key] = body[key]
    core.save_config(data)
    return {"status": "ok", "updated": body}


@api.get("/api/v1/services-config")
def get_services_config():
    return core.services_config()


@api.put("/api/v1/services-config")
async def put_services_config(request: Request):
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid services config")
    return core.merge_services(body)


@api.get("/api/v1/llm/status")
def llm_status():
    from services import llm_service
    return llm_service.get_status()


@api.get("/api/v1/llm/models")
def llm_models():
    return {"models": []}


@api.get("/api/v1/jobs")
@api.get("/api/v1/jobs/recovery")
@api.get("/api/v1/director/pipelines")
def empty_jobs():
    return {"jobs": [], "pipelines": [], "total": 0}


@api.get("/api/v1/director/pipelines/active")
def empty_active_pipelines():
    return {"pipelines": []}


@api.get("/api/v1/system-stats")
def system_stats():
    import psutil
    vm = psutil.virtual_memory()
    return {
        "cpu": {"percent": psutil.cpu_percent(interval=None)},
        "ram": {"percent": vm.percent, "used_gb": round((vm.total - vm.available) / 1024 ** 3, 1),
                "total_gb": round(vm.total / 1024 ** 3, 1)},
        "gpu": {"available": False, "percent": 0, "vram_used_gb": 0, "vram_total_gb": 0, "vram_percent": 0},
        "model": {"name": None, "model_type": None, "loaded": False},
    }


@api.get("/api/v1/system-detect")
def system_detect():
    return {
        "auto_enabled": False,
        "hardware": {
            "cuda_available": False, "gpu_name": "", "gpu_vram_gb": 0, "gpu_capability": "",
            "ram_gb": 0, "cpu_count": os.cpu_count() or 0, "ram_tier": "high", "vram_tier": "none",
            "supports_fp8": False, "supports_sage": False, "supports_sage2": False,
            "supports_flash": False, "supports_triton": False, "supports_nvfp4": False,
        },
        "recommended": {
            "video_profile": 4, "image_profile": 4, "audio_profile": 4,
            "transformer_quantization": "int8", "vae_config": 0, "vram_safety_coefficient": 0.8,
            "attention_mode": "auto", "compile": "",
        },
    }


@api.get("/api/v1/downloads/active")
def downloads_active():
    return {"downloads": []}


@api.get("/api/v1/loras/installed")
def loras_installed():
    return {"loras": [], "manifest_last_check_at": None}


@api.get("/api/v1/tasks")
def tasks():
    return {"workspace": core.active_workspace(), "tasks": [], "latest_event_id": 0}


def _wizard_workspace(value: object) -> str:
    name = value if isinstance(value, str) and value.strip() else None
    return core.workspace_dir(name)


@api.get("/api/v1/wizard/conversations")
def get_wizard_conversation(workspace: str | None = None):
    try:
        return read_conversation(_wizard_workspace(workspace))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=500, detail=f"Could not read the Wizard conversation: {error}") from error


@api.put("/api/v1/wizard/conversations")
async def put_wizard_conversation(request: Request):
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Wizard conversation must be a JSON object")
    try:
        base_revision = body.get("baseRevision")
        if type(base_revision) is not int:
            base_revision = 0
        return write_conversation(
            _wizard_workspace(body.get("workspace")),
            body.get("conversation"),
            base_revision=base_revision,
        )
    except WizardConversationRevisionConflict as error:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "wizard_conversation_revision_conflict",
                "message": str(error),
                "expectedRevision": error.expected,
                "currentRevision": error.current,
            },
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except OSError as error:
        raise HTTPException(status_code=500, detail=f"Could not save the Wizard conversation: {error}") from error


@api.get("/api/v1/wizard/workflows")
def get_wizard_workflows(workspace: str | None = None):
    try:
        return read_workflows(_wizard_workspace(workspace))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=500, detail=f"Could not read Wizard workflows: {error}") from error


@api.put("/api/v1/wizard/workflows")
async def put_wizard_workflows(request: Request):
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Wizard workflows must be a JSON object")
    try:
        base_revision = body.get("baseRevision")
        if type(base_revision) is not int:
            base_revision = 0
        return write_workflows(
            _wizard_workspace(body.get("workspace")),
            body.get("collection"),
            base_revision=base_revision,
        )
    except WizardWorkflowRevisionConflict as error:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "wizard_workflow_revision_conflict",
                "message": str(error),
                "expectedRevision": error.expected,
                "currentRevision": error.current,
            },
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except OSError as error:
        raise HTTPException(status_code=500, detail=f"Could not save Wizard workflows: {error}") from error


@api.get("/api/v1/stories/library")
def stories_library():
    return {"version": 1, "projects": []}


@api.get("/api/v1/character-kits/library")
def character_kits():
    return {"version": 1, "revision": 0, "activeId": "", "kits": {}}


@api.get("/api/v1/resolutions")
def resolutions():
    return {"resolutions": []}


@api.get("/api/v1/presets")
def presets():
    return {"presets": []}


@api.get("/api/v1/production-profile")
def production_profile():
    return {}


@api.get("/api/v1/model-visibility")
def model_visibility():
    return {"configured": True, "enabled_models": [], "initialized_mature_models": [], "defaults_version": 0}


@api.get("/api/v1/model-selections")
def model_selections():
    return {"configured": True, "selected_models": {}, "sources": {}}


@api.get("/api/v1/wangp/capabilities")
def wangp_capabilities():
    return {"processors": []}


@api.get("/api/v1/model3d/capabilities")
def model3d_capabilities():
    return {"engines": [], "remote": ["meshy"]}


@api.get("/api/v1/rig/capabilities")
def rig_capabilities():
    return {"engines": [{"id": "procedural", "label": "Procedural (fast)"}]}


@api.post("/api/v1/wangp/mcp")
async def wangp_mcp(request: Request):
    body = await request.json()
    name = ""
    if isinstance(body, dict):
        name = str(body.get("method") or body.get("name") or "")
        params = body.get("params") if isinstance(body.get("params"), dict) else body
        if isinstance(params, dict) and params.get("name"):
            name = str(params.get("name") or name)
    if name in {"generate", "recast", "upscale"}:
        require_capability_http("wangp_local")
    raise HTTPException(status_code=400, detail="Unknown MCP tool")


@api.post("/api/v1/scenes/recordings")
async def save_scene_recording(request: Request):
    form = await request.form()
    upload = form.get("file")
    if upload is None or not hasattr(upload, "read"):
        raise HTTPException(status_code=400, detail="A recording file is required")
    folder = core.workspace_dir(str(form.get("workspace") or "") or None)
    os.makedirs(folder, exist_ok=True)
    import time
    import uuid
    name = getattr(upload, "filename", None) or f"{time.strftime('%Y-%m-%d-%Hh%Mm%Ss')}_{uuid.uuid4().hex[:6]}.mp4"
    path = os.path.join(folder, os.path.basename(str(name)))
    data = await upload.read()
    with open(path, "wb") as handle:
        handle.write(data)
    return {"name": os.path.basename(path), "url": f"/api/v1/file/{os.path.basename(path)}"}


@api.post("/api/v1/scenes")
async def save_scene(request: Request):
    body = await request.json()
    scene = body.get("scene") if isinstance(body, dict) else None
    if not isinstance(scene, dict):
        raise HTTPException(status_code=400, detail="A version 1 scene is required")
    folder = core.workspace_dir(body.get("workspace") if isinstance(body, dict) else None)
    os.makedirs(folder, exist_ok=True)
    import json
    import time
    import uuid
    name = f"{time.strftime('%Y-%m-%d-%Hh%Mm%Ss')}_scene_{uuid.uuid4().hex[:6]}.scene.json"
    path = os.path.join(folder, name)
    Path_write = path
    with open(Path_write, "w", encoding="utf-8") as handle:
        json.dump(scene, handle)
    return {"name": name, "type": "scene", "url": f"/api/v1/file/{name}"}


@api.post("/api/v1/video-editor/probe")
def probe_video(body: dict):
    try:
        return core_editor.probe_video(str((body or {}).get("source") or ""), (body or {}).get("workspace"))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.post("/api/v1/video-editor/probe-audio")
def probe_audio_route(body: dict):
    try:
        return core_editor.probe_soundtrack(str((body or {}).get("source") or ""), (body or {}).get("workspace"))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.get("/api/v1/video-editor/thumbnail")
def video_thumbnail(source: str):
    try:
        path = core_editor.thumbnail_path(source)
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return FileResponse(path, media_type="image/jpeg")


@api.post("/api/v1/video-editor/screenshot")
def video_screenshot(body: dict):
    try:
        return core_editor.screenshot(
            str((body or {}).get("source") or ""),
            float((body or {}).get("time") or 0),
            str((body or {}).get("name") or "frame"),
            (body or {}).get("workspace"),
        )
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.post("/api/v1/video-editor/export", status_code=202)
def video_export(body: dict):
    try:
        return core_editor.start_export(body or {})
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.get("/api/v1/video-editor/export/{job_id}")
def video_export_status(job_id: str):
    job = core_editor.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Export job not found")
    return job


@api.post("/api/v1/upload")
async def upload_file(file: UploadFile = File(...)):
    folder = core.uploads_dir()
    name = os.path.basename(file.filename or "upload.bin")
    dest = os.path.join(folder, name)
    with open(dest, "wb") as handle:
        handle.write(await file.read())
    return {"filename": name, "url": f"/api/v1/file/{name}?workspace=__uploads__"}


@api.get("/api/v1/uploads/{filename:path}")
def serve_upload(filename: str):
    path = core.safe_join(core.uploads_dir(), filename)
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Upload not found")
    return FileResponse(path)


@api.post("/api/v1/llm/load")
async def llm_load(request: Request):
    body = await request.json()
    provider = str((body or {}).get("provider") or core.services_config().get("llm_provider") or "local")
    if provider == "local":
        require_capability_http("local_llm")
    from services import llm_service
    llm_service.load_model(
        model_id=str((body or {}).get("model_id") or ""),
        provider=provider,
        remote_url=str((body or {}).get("remote_url") or ""),
        api_key=str((body or {}).get("api_key") or ""),
    )
    return {"status": "ok", **llm_service.get_status()}


_app_dir = os.path.dirname(os.path.abspath(__file__))
_ui_dist = os.path.normpath(os.path.join(_app_dir, "..", "ui", "dist"))
_ui_ready = build_status()["ready"]
if _ui_ready:
    api.mount("/", StaticFiles(directory=_ui_dist, html=True))
else:
    @api.get("/")
    def index():
        from fastapi.responses import HTMLResponse
        return HTMLResponse(recovery_html(), status_code=503, headers={"Cache-Control": "no-store"})


def run_server() -> None:
    import uvicorn

    report_identity()
    snapshot = platform_capabilities()
    print("[HocusPocus] capabilities")
    for name, entry in snapshot["capabilities"].items():
        print(f"  {name}: {entry['state']}")
    print(f"[HocusPocus] profile {snapshot['profile']}")
    port = int(os.environ.get("SERVER_PORT", "7860"))
    pinokio_share = (os.environ.get("PINOKIO_SHARE_LOCAL") or "").strip().lower()
    if pinokio_share == "true":
        host = "0.0.0.0"
    elif pinokio_share == "false":
        host = "127.0.0.1"
    else:
        host = os.environ.get("SERVER_NAME", "127.0.0.1")
    display_host = "127.0.0.1" if host == "0.0.0.0" else host
    print(f"HocusPocus Lab UI: http://{display_host}:{port}/")
    uvicorn.run(api, host=host, port=port)


if __name__ == "__main__":
    if _app_dir not in sys.path:
        sys.path.insert(0, _app_dir)
    run_server()
