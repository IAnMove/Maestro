"""Durable registry for explicit collaborative Workspace collections."""

from __future__ import annotations

import json
import hashlib
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from copy import deepcopy

from services.workspace_store_lock import workspace_store_lock


WORKSPACE_SCHEMA = "hocuspocus.workspace-record"
SCHEMA_VERSION = 1
STORE_VERSION = 1


class WorkspaceIntentConflict(RuntimeError):
    pass


class WorkspaceRevisionConflict(RuntimeError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _references(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        token = str(item or "").strip()
        if token and len(token) <= 240 and token not in result:
            result.append(token)
    return result


def _revision(value: Any) -> int:
    if isinstance(value, bool):
        return 1
    try:
        return max(1, int(value))
    except (TypeError, ValueError, OverflowError):
        return 1


def _record(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": WORKSPACE_SCHEMA,
        "schema_version": SCHEMA_VERSION,
        "id": str(value.get("id") or "").strip(),
        "revision": _revision(value.get("revision")),
        "name": str(value.get("name") or "").strip(),
        "description": str(value.get("description") or "").strip(),
        "project_ids": _references(value.get("project_ids")),
        "asset_ids": _references(value.get("asset_ids")),
        "production_ids": _references(value.get("production_ids")),
        "created_at": value.get("created_at") or None,
        "updated_at": value.get("updated_at") or None,
    }


def _command_digest(command: dict) -> str:
    return hashlib.sha256(json.dumps(
        {key: command[key] for key in ("version", "operation", "input")},
        sort_keys=True, ensure_ascii=False, separators=(",", ":"),
    ).encode()).hexdigest()


def _valid_receipt(receipt: dict, intent_id: str) -> bool:
    record = receipt.get("result")
    if not isinstance(record, dict):
        return False
    return all((receipt.get("version") == 1, receipt.get("commandId") == intent_id,
                receipt.get("status") == "completed", record == _record(record),
                bool(record.get("id")), type(record.get("revision")) is int))


def _command_entry(store: dict, intent_id: str) -> dict | None:
    entries = store.get("commands", {})
    if intent_id not in entries:
        return None
    entry = entries[intent_id]
    try:
        valid = all((entry["fingerprint_version"] == 1, isinstance(entry["original"], dict),
                     _valid_receipt(entry["receipt"], intent_id),
                     entry["digest"] == _command_digest(entry["effective"]),
                     entry["receipt"]["operation"] == entry["effective"]["operation"]))
    except (KeyError, TypeError, AttributeError, ValueError) as error:
        raise OSError("Stored command receipt is unreadable; recover storage before retrying") from error
    if not valid:
        raise OSError("Stored command receipt is invalid; recover storage before retrying")
    return entry


class WorkspaceRegistry:
    """Small atomic JSON store; physical output folders remain independent."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._lock = threading.RLock()

    def _load(self) -> dict[str, Any]:
        if not self.path.is_file():
            return {"version": STORE_VERSION, "workspaces": {}}
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise OSError("Workspace registry is unreadable; recover storage before retrying this intention") from exc
        if not isinstance(value, dict) or not isinstance(value.get("workspaces"), dict):
            raise OSError("Workspace registry has an invalid shape")
        if not isinstance(value.get("commands", {}), dict):
            raise OSError("Workspace command receipts have an invalid shape")
        return value

    def _write(self, value: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(f".{self.path.name}.{uuid.uuid4().hex}.tmp")
        try:
            with temporary.open("w", encoding="utf-8") as handle:
                handle.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.path)
            if os.name != "nt":
                directory = os.open(self.path.parent, os.O_RDONLY)
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass

    def list(self) -> list[dict[str, Any]]:
        with self._lock, workspace_store_lock(self.path):
            items = [_record(item) for item in self._load()["workspaces"].values() if isinstance(item, dict)]
        return sorted(items, key=lambda item: (str(item.get("updated_at") or ""), item["id"]), reverse=True)

    def get(self, workspace_id: str) -> dict[str, Any] | None:
        with self._lock, workspace_store_lock(self.path):
            value = self._load()["workspaces"].get(workspace_id)
            return _record(value) if isinstance(value, dict) else None

    def create(self, value: dict[str, Any]) -> dict[str, Any]:
        with self._lock, workspace_store_lock(self.path):
            store = self._load()
            item = self._create_in_store(store, value)
            self._write(store)
            return item

    @staticmethod
    def _create_in_store(store, value):
        name = str(value.get("name") or "").strip()
        if not name:
            raise ValueError("Workspace name is required")
        if len(name) > 160:
            raise ValueError("Workspace name is too long")
        timestamp = _now()
        workspace_id = f"workspace_{uuid.uuid4().hex}"
        item = _record({**value, "id": workspace_id, "revision": 1, "created_at": timestamp, "updated_at": timestamp})
        store["workspaces"][workspace_id] = item
        return item

    def update(self, workspace_id: str, value: dict[str, Any]) -> dict[str, Any]:
        with self._lock, workspace_store_lock(self.path):
            store = self._load()
            item = self._update_in_store(store, workspace_id, value)
            self._write(store)
            return item

    @staticmethod
    def _update_in_store(store, workspace_id, value):
        current = store["workspaces"].get(workspace_id)
        if not isinstance(current, dict):
            raise KeyError(workspace_id)
        expected = value.get("expected_revision")
        if expected is not None:
            if isinstance(expected, bool):
                raise ValueError("expected_revision must be a positive integer")
            try:
                expected_value = int(expected)
            except (TypeError, ValueError, OverflowError) as exc:
                raise ValueError("expected_revision must be a positive integer") from exc
            if expected_value < 1:
                raise ValueError("expected_revision must be a positive integer")
            if expected_value != _revision(current.get("revision")):
                raise WorkspaceRevisionConflict("Workspace changed since it was opened")
        name = str(value.get("name", current.get("name")) or "").strip()
        if not name:
            raise ValueError("Workspace name is required")
        if len(name) > 160:
            raise ValueError("Workspace name is too long")
        item = _record({
            **current,
            **{key: value[key] for key in (
                "name", "description", "project_ids", "asset_ids", "production_ids"
            ) if key in value},
            "id": workspace_id,
            "revision": _revision(current.get("revision")) + 1,
            "created_at": current.get("created_at"),
            "updated_at": _now(),
        })
        store["workspaces"][workspace_id] = item
        return item

    def delete(self, workspace_id: str) -> bool:
        with self._lock, workspace_store_lock(self.path):
            store = self._load()
            if workspace_id not in store["workspaces"]:
                return False
            del store["workspaces"][workspace_id]
            self._write(store)
            return True

    def command_receipt(self, intent_id: str) -> dict[str, Any] | None:
        with self._lock, workspace_store_lock(self.path):
            item = _command_entry(self._load(), intent_id)
            return deepcopy(item["receipt"]) if item is not None else None

    def execute_command(self, value: Any, resolve_reference=None) -> dict[str, Any]:
        from services.workspace_commands import MUTATIONS, validate_command
        original, command = validate_command(value)
        operation, data = command["operation"], command["input"]
        if operation not in MUTATIONS:
            return self._read_command(operation, data)
        digest = _command_digest(command)
        intent_id = command["intent_id"]
        with self._lock, workspace_store_lock(self.path):
            store = self._load()
            receipts = store.setdefault("commands", {})
            existing = _command_entry(store, intent_id)
            if existing is not None:
                if existing["digest"] != digest:
                    raise WorkspaceIntentConflict("intent_id was already used with different parameters or preconditions")
                return {**deepcopy(existing["receipt"]), "replayed": True}
            self._validate_command_references(data, resolve_reference)
            item = (self._create_in_store(store, data) if operation == "collections.create"
                    else self._update_in_store(store, data["workspace_id"], data))
            receipt = {
                "version": 1, "commandId": intent_id, "operation": operation,
                "status": "completed", "replayed": False,
                "entities": [{"kind": "workspace_collection", "id": item["id"],
                              "workspaceId": item["id"], "version": item["revision"]}],
                "artifacts": [], "taskIds": [], "pipelineIds": [], "result": item,
            }
            receipts[intent_id] = {"fingerprint_version": 1, "digest": digest,
                                   "original": original, "effective": command, "receipt": receipt}
            # One replace commits both the domain mutation and its receipt.
            self._write(store)
            return deepcopy(receipt)

    def _read_command(self, operation, data):
        if operation == "collections.list":
            items = self.list()
            return {"workspaces": items, "total": len(items)}
        if operation == "collections.get":
            item = self.get(data["workspace_id"])
        else:
            item = self.command_receipt(data["intent_id"])
        if item is None:
            raise KeyError("Collection or command receipt not found")
        return item

    @staticmethod
    def _validate_command_references(data, resolve_reference):
        for kind in ("project_ids", "asset_ids", "production_ids"):
            for identity in data.get(kind, []):
                if resolve_reference is None:
                    raise ValueError(f"Reference resolver is unavailable for {kind}")
                if resolve_reference(kind, identity) is None:
                    raise ValueError(f"Unknown {kind} reference: {identity}")


__all__ = ["SCHEMA_VERSION", "STORE_VERSION", "WORKSPACE_SCHEMA", "WorkspaceRegistry"]
