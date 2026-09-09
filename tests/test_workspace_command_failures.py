"""Adversarial transport and compatibility checks for Workspace commands.

These cases exercise failure boundaries that are easy to miss when the happy
path is covered: an atomic write can finish before its response is lost, a
registry read can fail, and HTTP and MCP expose the same command contract
through different envelopes.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers.wangp_mcp import create_wangp_mcp_router, tool_definitions
from routers.workspace_collections import create_workspace_collections_router
from services.wangp_agent_adapters import application_handlers
from services.workspace_commands import catalog, validate_command
from services.workspace_registry import WorkspaceRegistry


_DEFAULT_RESOLVER = object()


def _build_app(path: Path, *, resolver=_DEFAULT_RESOLVER):
    app = FastAPI()
    registry = WorkspaceRegistry(path)
    router_kwargs = {"registry": lambda: registry}
    if resolver is not _DEFAULT_RESOLVER:
        router_kwargs["resolve_reference"] = resolver
    app.include_router(create_workspace_collections_router(**router_kwargs))

    # These exact-ID routes model the canonical application surface used by
    # the resolver and by the legacy organize adapter.
    app.add_api_route("/api/v1/assets", lambda: {"assets": []}, methods=["GET"])
    app.add_api_route("/api/v1/assets/{asset_id}", lambda asset_id: {"id": asset_id}, methods=["GET"])
    app.add_api_route("/api/v1/llm/generate", lambda: {"text": "unused"}, methods=["POST"])
    journal_path = path.with_suffix(".sqlite")
    app.include_router(create_wangp_mcp_router(
        handlers=application_handlers(app),
        journal_path=journal_path,
        token_getter=lambda: "test-token",
    ))
    return app, registry, journal_path


def _mcp_call(client: TestClient, name, arguments, *, request_id=1):
    return client.post(
        "/api/v1/wangp/mcp",
        headers={"Authorization": "Bearer test-token"},
        json={
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        },
    )


def _create_command(intent_id="intent-1", **fields):
    return {
        "version": 1,
        "operation": "collections.create",
        "intent_id": intent_id,
        "input": {"name": "Nightwatch", **fields},
    }


def test_legacy_after_replace_failure_keeps_transport_reservation_uncertain(tmp_path, monkeypatch):
    path = tmp_path / "registry.json"
    app, registry, journal_path = _build_app(
        path,
        resolver=lambda _kind, identity: {"id": identity},
    )
    original_write = registry._write

    def write_then_lose_response(store):
        original_write(store)
        raise OSError("response lost after atomic replace")

    monkeypatch.setattr(registry, "_write", write_then_lose_response)
    arguments = {
        "request_id": "legacy-after-replace",
        "params": {"name": "After replace", "asset_ids": ["asset-real"]},
    }
    with TestClient(app) as client:
        first = _mcp_call(client, "organize", arguments)
        assert first.status_code == 200
        assert first.json()["result"]["isError"] is True

        with sqlite3.connect(journal_path) as db:
            row = db.execute(
                "SELECT result FROM requests WHERE id=?",
                (arguments["request_id"],),
            ).fetchone()
        assert row == (None,), "a 5xx after commit must remain recoverable"

        # The storage operation is healthy again. Reuse the same request ID;
        # the adapter must prove the durable receipt and replay the effect.
        monkeypatch.undo()
        recovered = _mcp_call(client, "organize", arguments).json()["result"]

    assert recovered["isError"] is False
    assert json.loads(recovered["content"][0]["text"])["name"] == "After replace"
    assert len(registry.list()) == 1


def test_registry_read_oserror_is_retryable_http_failure(tmp_path, monkeypatch):
    path = tmp_path / "registry.json"
    app, registry, _journal_path = _build_app(
        path,
        resolver=lambda _kind, identity: {"id": identity},
    )
    registry.create({"name": "Existing"})
    original_read_text = Path.read_text

    def fail_registry_read(candidate, *args, **kwargs):
        if candidate == path:
            raise OSError("injected registry read failure")
        return original_read_text(candidate, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", fail_registry_read)
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/commands",
            json={"version": 1, "operation": "collections.list", "input": {}},
        )

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "uncertain_response"
    assert detail["retryable"] is True


def test_http_catalog_schema_has_operation_but_mcp_projection_omits_it():
    operation = "collections.create"
    http_schema = next(item["inputSchema"] for item in catalog()["operations"] if item["name"] == operation)
    assert http_schema["properties"]["operation"] == {"type": "string", "const": operation}
    assert "operation" in http_schema["required"]
    validate_command({
        "version": 1,
        "operation": operation,
        "intent_id": "schema-contract",
        "input": {"name": "Schema contract"},
    })

    mcp_schema = next(item["inputSchema"] for item in tool_definitions({operation}) if item["name"] == operation)
    assert "operation" not in mcp_schema["properties"]
    assert "operation" not in mcp_schema["required"]


def test_catalog_expresses_name_and_reference_collection_constraints():
    schema = next(item["inputSchema"] for item in catalog()["operations"] if item["name"] == "collections.create")
    input_schema = schema["properties"]["input"]
    assert input_schema["properties"]["name"].get("pattern")
    for field in ("project_ids", "asset_ids", "production_ids"):
        assert input_schema["properties"][field]["uniqueItems"] is True

    with pytest.raises(ValueError, match=r"blank|pattern"):
        validate_command(_create_command("blank-name", name="   "))
    with pytest.raises(ValueError, match="unique"):
        validate_command(_create_command("duplicate-assets", asset_ids=["asset-real", "asset-real"]))


@pytest.mark.parametrize("malformed_name", [[], {}, None])
def test_mcp_malformed_tool_names_return_jsonrpc_errors(malformed_name, tmp_path):
    app = FastAPI()
    app.include_router(create_wangp_mcp_router(
        handlers={"collections.list": lambda _arguments: {"workspaces": [], "total": 0}},
        journal_path=tmp_path / "journal.sqlite",
        token_getter=lambda: "test-token",
    ))
    with TestClient(app, raise_server_exceptions=False) as client:
        response = _mcp_call(client, malformed_name, {})

    assert response.status_code == 200
    payload = response.json()
    assert payload["jsonrpc"] == "2.0"
    assert payload["result"]["isError"] is True


def test_legacy_organize_with_command_route_uses_canonical_resolver_fallback(tmp_path):
    path = tmp_path / "registry.json"
    app, registry, _journal_path = _build_app(path, resolver=None)
    arguments = {
        "request_id": "legacy-fallback",
        "params": {"name": "Canonical fallback", "asset_ids": ["asset-real"]},
    }
    with TestClient(app) as client:
        response = _mcp_call(client, "organize", arguments)

    result = response.json()["result"]
    assert response.status_code == 200
    assert result["isError"] is False
    assert json.loads(result["content"][0]["text"])["name"] == "Canonical fallback"
    assert len(registry.list()) == 1


def test_intent_ids_remain_opaque_and_are_preserved_in_receipts(tmp_path):
    intent_id = "  revisión Δ / 01  "
    registry = WorkspaceRegistry(tmp_path / "registry.json")
    receipt = registry.execute_command(_create_command(intent_id))
    assert receipt["commandId"] == intent_id
    assert registry.command_receipt(intent_id) == receipt
