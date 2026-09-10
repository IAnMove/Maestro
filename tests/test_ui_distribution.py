"""Installation recovery uses real files and failure boundaries; no AI runtime."""
from __future__ import annotations

import ast
import asyncio
import json
from pathlib import Path
import subprocess
import sys

import pytest

from services import ui_distribution as distribution
from scripts import build_ui


@pytest.fixture
def project(tmp_path, monkeypatch):
    root = tmp_path / "Pinokio Apps" / "HocusPocus"
    for name in ("VERSION", "ui/package.json", "ui/src/main.tsx", "scripts/build_ui.py",
                 "app/services/ui_distribution.py", "scripts/graphs/story_director_audio_flow.py",
                 "app/_launch_runtime.py", "tests/fixtures/route_table.json"):
        p = root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("0.9.0" if name == "VERSION" else "{}", encoding="utf-8")
    monkeypatch.setattr(build_ui.shutil, "which", lambda _: "npm")
    return root


def artifact(dist):
    dist.mkdir(parents=True, exist_ok=True)
    (dist / "assets").mkdir(exist_ok=True)
    (dist / "index.html").write_text('<html><script type="module" src="/assets/main.js"></script></html>', encoding="utf-8")
    (dist / "assets/main.js").write_text("import './lazy.js'", encoding="utf-8")
    (dist / "assets/lazy.js").write_text("export default 123", encoding="utf-8")


def compile_ui(command, **kwargs):
    assert kwargs["check"] is True
    assert kwargs["env"]["HOCUSPOCUS_GRAPH_PYTHON"] == sys.executable
    if command[1] == "ci":
        assert "--include=dev" in command
    else:
        assert command[1:5] == ["run", "build", "--", "--outDir"]
        artifact(kwargs["cwd"] / command[-1])


def test_missing_empty_and_partial_dist_are_not_ready(project):
    assert distribution.build_status(project)["reason"] == "React build files are missing"
    dist = project / "ui/dist"
    dist.mkdir()
    assert not distribution.build_status(project)["ready"]
    artifact(dist)
    assert distribution.build_status(project)["ready"]  # manual npm builds remain valid
    (dist / "assets/main.js").unlink()
    assert not distribution.build_status(project)["ready"]


def test_real_receipt_skip_corruption_and_source_update(project):
    result = build_ui.ensure_build(project, run=compile_ui)
    assert result["version"] == "0.9.0"
    assert result["built_at"] and result["build_id"]
    assert distribution.build_status(project, current=True)["ready"]
    assert build_ui.ensure_build(project, run=lambda *a, **k: pytest.fail("unnecessary npm")) == result
    lazy = project / "ui/dist/assets/lazy.js"
    lazy.write_text("corrupted", encoding="utf-8")
    assert not distribution.build_status(project, current=True)["ready"]
    build_ui.ensure_build(project, run=compile_ui)
    (project / "ui/src/main.tsx").write_text("updated", encoding="utf-8")
    assert not distribution.build_status(project, current=True)["ready"]


@pytest.mark.parametrize("failure", ["ci", "compile", "partial", "source-race"])
def test_failed_rebuild_preserves_previous_build(project, failure):
    original = build_ui.ensure_build(project, run=compile_ui)
    def fail(command, **kwargs):
        if (failure == "ci" and command[1] == "ci") or (failure == "compile" and command[1] == "run"):
            raise subprocess.CalledProcessError(7, command)
        compile_ui(command, **kwargs)
        if command[1] == "run":
            if failure == "partial":
                (kwargs["cwd"] / command[-1] / "assets/main.js").unlink()
            if failure == "source-race":
                (project / "ui/src/main.tsx").write_text("changed while compiling", encoding="utf-8")
    with pytest.raises((subprocess.CalledProcessError, ValueError, RuntimeError)):
        build_ui.ensure_build(project, force=True, run=fail)
    assert distribution.validate_artifact(project / "ui/dist", managed=True) == original
    assert not list((project / "ui").glob(".hocus-ui-build-*/"))


def test_failed_publish_restores_previous_build(project, monkeypatch):
    original = build_ui.ensure_build(project, run=compile_ui)
    rename = Path.rename
    def fail_publish(path, target):
        if path.name.startswith(".hocus-ui-build-"):
            raise PermissionError("Windows destination temporarily busy")
        return rename(path, target)
    monkeypatch.setattr(Path, "rename", fail_publish)
    with pytest.raises(PermissionError):
        build_ui.ensure_build(project, force=True, run=compile_ui)
    assert distribution.validate_artifact(project / "ui/dist", managed=True) == original


def test_concurrent_build_rejected_and_lock_reusable(project):
    with build_ui.build_lock(project / "ui"):
        with pytest.raises(RuntimeError, match="Another React build"):
            build_ui.ensure_build(project, run=compile_ui)
    assert build_ui.ensure_build(project, run=compile_ui)["build_id"]


@pytest.mark.parametrize("receipt", [[], None, {"schema": 1, "files": {"index.html": "fake", "../secret": "fake"}}])
def test_malformed_receipt_is_repairable(project, receipt):
    artifact(project / "ui/dist")
    (project / "ui/dist/build-info.json").write_text(json.dumps(receipt), encoding="utf-8")
    assert not distribution.build_status(project, current=True)["ready"]
    build_ui.ensure_build(project, run=compile_ui)
    assert distribution.build_status(project, current=True)["ready"]


def test_no_git_or_ui_still_reports_release_and_system(project, capsys):
    distribution.report_identity(project)
    output = capsys.readouterr().out
    assert "Version: 0.9.0" in output and "commit: unknown" in output
    assert "React build: unavailable" in output and "Python" in output
    assert "Errno" not in output  # not a false Pinokio shell failure on first install
    page = distribution.recovery_html(project)
    assert "Repair Web UI" in page and "npm ci --include=dev" in page
    assert "Restart Start" in page and "Version 0.9.0" in page


def test_runtime_serves_503_recovery_or_real_assets(project):
    """Execute just the actual static mount block; avoid importing WanGP/Torch."""
    fastapi = pytest.importorskip("fastapi")
    from starlette.staticfiles import StaticFiles
    import os
    tree = ast.parse((distribution.ROOT / "app/_launch_runtime.py").read_text(encoding="utf-8"))
    start = next(i for i, node in enumerate(tree.body) if isinstance(node, ast.Import) and any(
        alias.asname == "_mimetypes" for alias in node.names))
    end = next(i for i in range(start, len(tree.body)) if isinstance(tree.body[i], ast.If))
    block = ast.Module(body=tree.body[start:end + 1], type_ignores=[])
    for ready in (False, True):
        if ready:
            artifact(project / "ui/dist")
        api = fastapi.FastAPI()
        from unittest.mock import patch
        with patch.object(distribution, "build_status", lambda: {"ready": ready}):
            exec(compile(block, "react-mount", "exec"), {"api": api, "os": os,
                 "_app_dir": str(project / "app"), "StaticFiles": StaticFiles})
        async def request(path):
            messages = []
            async def receive():
                return {"type": "http.request", "body": b""}
            async def send(message):
                messages.append(message)
            await api({"type": "http", "http_version": "1.1", "method": "GET", "path": path,
                       "root_path": "", "scheme": "http", "query_string": b"", "headers": []}, receive, send)
            return messages
        response = asyncio.run(request("/"))
        assert response[0]["status"] == (200 if ready else 503)
        assert b"text/html" in dict(response[0]["headers"])[b"content-type"]
        if ready:
            asset = asyncio.run(request("/assets/main.js"))
            assert asset[0]["status"] == 200
            assert b"javascript" in dict(asset[0]["headers"])[b"content-type"]
