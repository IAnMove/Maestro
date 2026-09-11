"""HTTP surface for portable Video3D scene packages. Independent of Gradio."""
from __future__ import annotations

import json
import re
import tempfile
from collections.abc import Callable, Iterable, Mapping
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from services.scene_packages import (
    MAX_EXPORT_BODY,
    MAX_ZIP_BYTES,
    ScenePackageError,
    ScenePackageTooLarge,
    format_contract,
    import_package,
    make_workspace_reader,
    preflight_package,
    require_workspace,
    write_package_zip,
)

_SLUG = re.compile(r"[^A-Za-z0-9._-]+")


def _slug(value: str) -> str:
    text = _SLUG.sub("-", str(value or "scene-package").strip()).strip("-._")[:80]
    return text or "scene-package"


def _raise(error: Exception) -> None:
    if isinstance(error, ScenePackageError):
        raise HTTPException(error.status, str(error)) from error
    if isinstance(error, ScenePackageTooLarge):
        raise HTTPException(413, str(error)) from error
    raise HTTPException(422, str(error)) from error


def _parse_reassign(raw: str) -> list[dict[str, Any]]:
    text = str(raw or "").strip() or "[]"
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise HTTPException(422, "Reassignment list must be JSON") from exc
    if isinstance(value, dict):
        value = [value]
    if not isinstance(value, list):
        raise HTTPException(422, "Reassignment list must be JSON")
    return [item for item in value if isinstance(item, Mapping)]


async def _spool_request(request: Request, directory: Path) -> Path:
    destination = directory / "upload.scene-package.zip"
    written = 0
    with destination.open("wb") as handle:
        async for chunk in request.stream():
            written += len(chunk)
            if written > MAX_ZIP_BYTES:
                raise HTTPException(413, "Package zip exceeds the size limit")
            handle.write(chunk)
    if written <= 0:
        raise HTTPException(422, "Package zip is empty")
    return destination


def create_scene_packages_router(
    *,
    workspace_dir: Callable[[str], str],
    uploads_dir: Callable[[], str] | None = None,
    list_workspaces: Callable[[], Iterable[Mapping[str, Any]]] | None = None,
) -> APIRouter:
    router = APIRouter()
    reader = make_workspace_reader(workspace_dir, uploads_dir)

    def _known_workspace(name: str) -> str:
        workspace = require_workspace(name)
        if list_workspaces is None:
            return workspace
        names = {
            str(item.get("name") or "").strip()
            for item in list_workspaces()
            if isinstance(item, Mapping)
        }
        if names and workspace not in names:
            raise HTTPException(404, "Workspace not found")
        return workspace

    @router.get("/api/v1/scene-packages/format")
    def package_format():
        return format_contract()

    @router.post("/api/v1/scene-packages/export")
    async def export_package(request: Request):
        payload = bytearray()
        async for chunk in request.stream():
            payload.extend(chunk)
            if len(payload) > MAX_EXPORT_BODY:
                raise HTTPException(413, "Export request exceeds 8 MB")
        try:
            body = json.loads(bytes(payload) or b"{}")
        except json.JSONDecodeError as exc:
            raise HTTPException(422, "Expected a JSON export request") from exc
        if not isinstance(body, dict):
            raise HTTPException(422, "Expected a JSON export request")
        try:
            workspace = _known_workspace(str(body.get("workspace") or ""))
            documents = body.get("documents")
            if not isinstance(documents, list) or not documents:
                names = body.get("names")
                if not isinstance(names, list) or not names:
                    raise ScenePackageError("Export at least one scene document")
                loaded = []
                folder = Path(workspace_dir(workspace))
                for name in names:
                    filename = Path(str(name or "")).name
                    path = folder / filename
                    if not path.is_file():
                        raise ScenePackageError(f"Scene not found: {filename}")
                    loaded.append(json.loads(path.read_text(encoding="utf-8")))
                documents = loaded
            archive = write_package_zip(
                documents,
                reader,
                title=str(body.get("title") or ""),
                workspace=workspace,
            )
        except (ScenePackageError, OSError, json.JSONDecodeError, ValueError) as error:
            _raise(error)
            raise
        filename = _slug(str(body.get("title") or "scene-package")) + ".scene-package.zip"
        return Response(
            content=archive,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @router.post("/api/v1/scene-packages/preflight")
    async def preflight(request: Request):
        with tempfile.TemporaryDirectory(prefix="scene-package-") as tmp:
            try:
                stored = await _spool_request(request, Path(tmp))
                return preflight_package(stored)
            except (ScenePackageError, ScenePackageTooLarge, OSError, ValueError) as error:
                _raise(error)
                raise

    @router.post("/api/v1/scene-packages/import")
    async def import_scene_package(request: Request, workspace: str, reassign: str = "[]"):
        replacements = _parse_reassign(reassign)
        with tempfile.TemporaryDirectory(prefix="scene-package-") as tmp:
            try:
                stored = await _spool_request(request, Path(tmp))
                target = _known_workspace(workspace)
                return import_package(
                    stored,
                    workspace=target,
                    workspace_dir=workspace_dir,
                    reader=reader,
                    reassign=replacements,
                )
            except (ScenePackageError, ScenePackageTooLarge, OSError, ValueError) as error:
                _raise(error)
                raise

    return router


__all__ = ["create_scene_packages_router"]
