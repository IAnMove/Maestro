"""Workspace-scoped, content-addressed face calibration. No audio or model bytes."""
from __future__ import annotations
import json
import os
import threading
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from services.character_speech_definition import face_settings

_lock = threading.Lock()

class ProfileWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_. -]+$")
    revision: int = Field(ge=0)
    settings: dict

    @field_validator("workspace")
    @classmethod
    def workspace_name(cls, value):
        if value in {".", ".."}:
            raise ValueError("Invalid workspace.")
        return value

    @field_validator("settings")
    @classmethod
    def face_only(cls, value):
        return face_settings(value)

def create_scene3d_profiles_router(workspace_dir):
    router = APIRouter()

    def target(workspace: str, digest: str):
        import re
        if not re.fullmatch(r"[a-f0-9]{64}", digest) or not re.fullmatch(r"[A-Za-z0-9_. -]{1,120}", workspace) or workspace in {".", ".."}:
            raise HTTPException(400, "Invalid profile scope.")
        return Path(workspace_dir(workspace)).resolve() / ".speech3d-profiles" / (digest + ".json")

    def read(path):
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None

    @router.get("/speech/profiles/{digest}")
    def get_profile(digest: str, workspace: str):
        with _lock:
            profile = read(target(workspace, digest))
        if profile is None:
            raise HTTPException(404, "No saved calibration for this model.")
        return profile

    @router.put("/speech/profiles/{digest}")
    def put_profile(digest: str, payload: ProfileWrite):
        path = target(payload.workspace, digest)
        with _lock:
            current = read(path)
            revision = current["revision"] if current else 0
            if revision != payload.revision:
                raise HTTPException(409, "Calibration changed elsewhere; reload before saving.")
            result = {"version": 1, "digest": digest, "revision": revision + 1, "settings": payload.settings}
            path.parent.mkdir(parents=True, exist_ok=True)
            # Preserve earlier revisions; never delete a user calibration.
            if current:
                history = path.with_name(digest + ".v" + str(revision) + ".json")
                if not history.exists():
                    history.write_text(json.dumps(current, allow_nan=False), encoding="utf-8")
            temp = path.with_name(digest + "." + uuid.uuid4().hex + ".tmp")
            temp.write_text(json.dumps(result, allow_nan=False), encoding="utf-8")
            os.replace(temp, path)
        return result
    return router
