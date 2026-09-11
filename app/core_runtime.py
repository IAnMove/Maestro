"""Apple Silicon core/remote server: UI, editors and remote APIs without Torch.

Local NVIDIA engines are not imported. Mutating generation paths return
409 feature_unavailable from the capability authority.
"""
from __future__ import annotations

import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers.lan_auth import create_lan_auth_router
from routers.system_capabilities import create_system_capabilities_router, require_capability_http
from services.platform_capabilities import platform_capabilities
from services.ui_distribution import build_status, recovery_html, report_identity

api = FastAPI(title="HocusPocus core")
api.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost|\d+\.localhost)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)
api.include_router(create_lan_auth_router())
api.include_router(create_system_capabilities_router())


@api.get("/api/v1/system/preflight")
def system_preflight():
    import shutil

    checks = []
    if shutil.which("ffmpeg") is None:
        checks.append({
            "id": "ffmpeg",
            "level": "error",
            "message": "ffmpeg was not found on PATH. Video and audio export will fail.",
        })
    return {"ok": not any(item["level"] == "error" for item in checks), "checks": checks}


@api.get("/api/v1/models")
def list_models():
    return {"families": [], "models": []}


@api.post("/api/v1/generate")
def generate():
    require_capability_http("wangp_local")
    return {"status": "ok"}


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
    print(f"[HocusPocus] profile {snapshot['profile']} · macOS core/remote")
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
