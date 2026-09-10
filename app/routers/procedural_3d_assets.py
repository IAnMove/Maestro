"""Unmounted GLB inspection HTTP factory.

This router is not included in the launch runtime. Callers inject
``resolve_glb_asset(workspace_id=..., asset_id=...) -> Path | None``.
The callback is the security boundary; this module must not scan the
global catalog or accept filesystem paths from the client.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Protocol

from fastapi import APIRouter, HTTPException, Query

from services.procedural_3d import inspect_glb, report_to_dict

_WORKSPACE_ID = re.compile(r"^(?:default|[A-Za-z0-9][A-Za-z0-9_-]{0,158})$")
_ASSET_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$")
_GENERIC_NOT_FOUND = "Asset not found"
_GENERIC_BAD_REQUEST = "Invalid request"


class ResolveGlbAsset(Protocol):
    def __call__(self, *, workspace_id: str, asset_id: str) -> Path | None:
        """Return a local GLB path already authorized for this workspace, or None."""


def create_procedural_3d_assets_router(
    *,
    resolve_glb_asset: ResolveGlbAsset,
) -> APIRouter:
    router = APIRouter()

    @router.get("/api/v1/procedural-3d/assets/{asset_id}/inspection")
    def inspect_procedural_3d_asset(
        asset_id: str,
        workspace: str | None = Query(default=None),
    ):
        if workspace is None or workspace == "":
            raise HTTPException(status_code=400, detail=_GENERIC_BAD_REQUEST)
        if len(workspace) > 160 or len(asset_id) > 180:
            raise HTTPException(status_code=400, detail=_GENERIC_BAD_REQUEST)
        if not _ASSET_ID.fullmatch(asset_id) or not _WORKSPACE_ID.fullmatch(workspace):
            raise HTTPException(status_code=400, detail=_GENERIC_BAD_REQUEST)
        try:
            resolved = resolve_glb_asset(workspace_id=workspace, asset_id=asset_id)
        except Exception:
            raise HTTPException(status_code=404, detail=_GENERIC_NOT_FOUND) from None
        if resolved is None:
            raise HTTPException(status_code=404, detail=_GENERIC_NOT_FOUND)
        try:
            report = inspect_glb(resolved)
        except OSError:
            raise HTTPException(status_code=404, detail=_GENERIC_NOT_FOUND) from None
        return report_to_dict(report)

    return router


__all__ = ["ResolveGlbAsset", "create_procedural_3d_assets_router"]
