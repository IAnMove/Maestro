"""HTTP API for explicit Workspace collections (not output directories)."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from services.workspace_registry import WorkspaceRegistry, WorkspaceIntentConflict, WorkspaceRevisionConflict
from services.workspace_commands import catalog, resolve_catalog_reference


def create_workspace_collections_router(*, registry: Callable[[], WorkspaceRegistry], resolve_reference=None) -> APIRouter:
    router = APIRouter()

    @router.get("/api/v1/commands")
    def command_catalog():
        return catalog()

    @router.post("/api/v1/commands")
    async def execute_shared_command(request: Request):
        def failure(status, code, message, retryable=False):
            return HTTPException(status, {"code": code, "message": message, "retryable": retryable})
        try:
            body = await request.json()
            resolver = resolve_reference or (lambda kind, identity: resolve_catalog_reference(request.app, kind, identity))
            return registry().execute_command(body, resolve_reference=resolver)
        except KeyError as exc:
            raise failure(404, "not_found", "Collection or command receipt not found") from exc
        except WorkspaceIntentConflict as exc:
            raise failure(409, "intent_conflict", str(exc)) from exc
        except WorkspaceRevisionConflict as exc:
            raise failure(409, "revision_conflict", str(exc)) from exc
        except HTTPException as exc:
            raise failure(exc.status_code, "reference_error", str(exc.detail)) from exc
        except (TypeError, ValueError) as exc:
            raise failure(400, "invalid_command", str(exc)) from exc
        except OSError as exc:
            raise failure(503, "uncertain_response", "Storage response uncertain; recover or retry the same intent_id", True) from exc

    @router.get("/api/v1/workspace-collections")
    def list_workspace_collections():
        items = registry().list()
        return {"workspaces": items, "total": len(items)}

    @router.get("/api/v1/workspace-collections/{workspace_id}")
    def get_workspace_collection(workspace_id: str):
        item = registry().get(workspace_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return item

    @router.post("/api/v1/workspace-collections", status_code=201)
    async def create_workspace_collection(request: Request):
        body: Any = await request.json()
        if not isinstance(body, Mapping):
            raise HTTPException(status_code=400, detail="Request body must be an object")
        try:
            return registry().create(dict(body))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.put("/api/v1/workspace-collections/{workspace_id}")
    async def update_workspace_collection(workspace_id: str, request: Request):
        body: Any = await request.json()
        if not isinstance(body, Mapping):
            raise HTTPException(status_code=400, detail="Request body must be an object")
        try:
            return registry().update(workspace_id, dict(body))
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Workspace not found") from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.delete("/api/v1/workspace-collections/{workspace_id}", status_code=204)
    def delete_workspace_collection(workspace_id: str):
        if not registry().delete(workspace_id):
            raise HTTPException(status_code=404, detail="Workspace not found")

    return router


__all__ = ["create_workspace_collections_router"]
