from __future__ import annotations

import base64
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from core_runtime import api
from services.platform_capabilities import FEATURE_UNAVAILABLE
from services.scene_commands import SceneCommands


class CoreRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(api)
        self.patches = [
            patch("services.platform_capabilities.host_platform", return_value="darwin"),
            patch("services.platform_capabilities.host_machine", return_value="arm64"),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in self.patches:
            item.stop()

    def _in_temp_workspace(self):
        folder = tempfile.TemporaryDirectory()
        previous = os.getcwd()
        os.chdir(folder.name)
        return folder, previous

    def _leave_temp_workspace(self, folder, previous):
        os.chdir(previous)
        folder.cleanup()

    def test_boot_surface_and_local_engines_are_blocked(self):
        listed = self.client.get("/api/v1/system/capabilities")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["profile"], "macos-arm64-core-remote")
        self.assertFalse(listed.json()["ui"]["show_cuda_controls"])
        self.assertEqual(self.client.get("/api/v1/models").json()["models"], [])
        self.assertIn("workspaces", self.client.get("/api/v1/workspaces").json())
        self.assertEqual(self.client.get("/api/v1/system-config").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/services-config").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/jobs").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/outputs").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/recipes").status_code, 200)
        denied = self.client.post("/api/v1/generate")
        self.assertEqual(denied.status_code, 409)
        self.assertEqual(denied.json()["detail"]["code"], FEATURE_UNAVAILABLE)
        self.assertEqual(self.client.post("/api/v1/model3d/generate", json={"provider": "local"}).status_code, 409)
        self.assertEqual(self.client.post("/api/v1/director/pipeline/start").status_code, 409)
        self.assertEqual(self.client.post("/api/v1/rig/generate").status_code, 409)
        mcp = self.client.post("/api/v1/wangp/mcp", json={"params": {"name": "generate"}})
        self.assertEqual(mcp.status_code, 409)
        self.assertEqual(self.client.post("/api/v1/tools/remove-background").status_code, 409)
        missing = self.client.post("/api/v1/video-editor/probe", json={"source": "missing.mp4"})
        self.assertEqual(missing.status_code, 400)

    def test_remote_llm_load_is_not_blocked_as_local_engine(self):
        with patch("services.llm_service.load_model"), patch(
            "services.llm_service.get_status", return_value={"loaded": False, "provider": "minimax"},
        ):
            response = self.client.post("/api/v1/llm/load", json={"provider": "minimax", "model_id": "MiniMax-M3"})
        self.assertEqual(response.status_code, 200)

    def test_video3d_world3d_save_persists_the_document(self):
        document = SceneCommands(None).execute({
            "version": 1,
            "operation": "scenes.effects.showcase",
            "input": {"dimension": "3d", "collection": "anime"},
        })["result"]["document"]
        preview = "data:image/png;base64," + base64.b64encode(
            b"\x89PNG\r\n\x1a\npreview"
        ).decode()
        folder, previous = self._in_temp_workspace()
        try:
            missing = self.client.post("/api/v1/scenes/world3d", json=[])
            saved = self.client.post("/api/v1/scenes/world3d", json={
                "workspace": "default",
                "document": document,
                "name": "../My shot / v2",
                "preview": preview,
            })
        finally:
            self._leave_temp_workspace(folder, previous)
        self.assertEqual(missing.status_code, 422)
        self.assertEqual(saved.status_code, 200, saved.text)
        body = saved.json()
        self.assertTrue(body["name"].endswith(".world3d.scene.json"))
        self.assertIn("workspace=default", body["url"])
        self.assertNotIn("..", body["name"])

    def test_wizard_conversation_put_round_trips_instead_of_emptying(self):
        conversation = {
            "version": 1,
            "revision": 0,
            "messages": [{
                "id": "msg-1",
                "role": "user",
                "text": "Exporta el plano",
                "createdAt": 1,
            }],
            "executions": [],
        }
        folder, previous = self._in_temp_workspace()
        try:
            empty = self.client.get("/api/v1/wizard/conversations")
            saved = self.client.put("/api/v1/wizard/conversations", json={
                "workspace": "default",
                "baseRevision": 0,
                "conversation": conversation,
            })
            loaded = self.client.get("/api/v1/wizard/conversations")
            conflict = self.client.put("/api/v1/wizard/conversations", json={
                "workspace": "default",
                "baseRevision": 0,
                "conversation": conversation,
            })
        finally:
            self._leave_temp_workspace(folder, previous)
        self.assertEqual(empty.status_code, 200)
        self.assertEqual(empty.json()["messages"], [])
        self.assertEqual(empty.json()["revision"], 0)
        self.assertNotIn("conversations", empty.json())
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["revision"], 1)
        self.assertEqual(saved.json()["messages"][0]["text"], "Exporta el plano")
        self.assertEqual(loaded.json()["messages"][0]["id"], "msg-1")
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["detail"]["code"], "wizard_conversation_revision_conflict")

    def test_video_editor_export_name_cannot_escape_the_workspace(self):
        from services import core_editor, core_workspace as core

        folder, previous = self._in_temp_workspace()
        try:
            workspace = core.workspace_dir("default")
            with patch.object(core_editor, "resolve_media", return_value=os.path.join(workspace, "clip.mp4")), \
                 patch.object(core_editor, "render_project", return_value={"duration": 1}):
                Path(workspace, "clip.mp4").write_bytes(b"x")
                job = core_editor.start_export({
                    "clips": [{"source": "clip.mp4"}],
                    "name": "../etc/passwd / cut",
                    "workspace": "default",
                })
        finally:
            self._leave_temp_workspace(folder, previous)
        self.assertNotIn("..", job["filename"])
        self.assertNotIn("/", job["filename"])
        self.assertTrue(job["filename"].endswith("_etc_passwd_cut.mp4"))

    def test_production_profile_defaults_to_remote_providers(self):
        listed = self.client.get("/api/v1/production-profile")
        self.assertEqual(listed.status_code, 200)
        profile = listed.json()["profile"]
        self.assertEqual(profile["text"]["provider"], "minimax")
        self.assertEqual(profile["image"]["provider"], "minimax")
        self.assertEqual(profile["music"]["provider"], "minimax")
        self.assertEqual(profile["model3d"]["provider"], "meshy")

    def test_mcp_lists_read_tools_and_omits_local_generate(self):
        response = self.client.post("/api/v1/wangp/mcp", json={
            "jsonrpc": "2.0", "id": 1, "method": "tools/list",
        })
        self.assertEqual(response.status_code, 200)
        names = {tool["name"] for tool in response.json()["result"]["tools"]}
        self.assertIn("assets", names)
        self.assertNotIn("generate", names)

    def test_story_and_series_libraries_persist(self):
        folder, previous = self._in_temp_workspace()
        try:
            Path("outputs").mkdir()
            library = self.client.put("/api/v1/stories/library", json={
                "workspace": "default",
                "baseRevision": 0,
                "library": {"version": 2, "revision": 0, "activeId": "", "projects": {}},
            })
            created = self.client.post("/api/v1/series", json={"workspace": "default", "title": "Mac series"})
        finally:
            self._leave_temp_workspace(folder, previous)
        self.assertEqual(library.status_code, 200)
        self.assertEqual(created.status_code, 200)
        self.assertTrue(str(created.json()["id"]).startswith("series_"))

    def test_meshy_generate_starts_a_remote_job(self):
        folder, previous = self._in_temp_workspace()
        try:
            Path("outputs").mkdir()
            fake = {"filename": "meshy-test.glb", "path": "meshy-test.glb", "provider": "meshy"}
            with patch("services.meshy_3d_service.generate_model", return_value=fake), patch(
                "services.execution_mode.validate_remote_provider",
            ):
                response = self.client.post("/api/v1/model3d/generate", json={
                    "provider": "meshy", "prompt": "a clay robot", "workspace": "default",
                })
        finally:
            self._leave_temp_workspace(folder, previous)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"], "meshy")

    def test_minimax_music_rejects_local_models(self):
        denied = self.client.post("/api/v1/stories/music-candidates/jobs", json={
            "model": "ace_step_v1_5_xl_sft_lm_4b",
            "prompt": "synthwave",
            "lyrics": "hello",
            "workspace": "default",
        })
        self.assertEqual(denied.status_code, 409)
        self.assertEqual(denied.json()["detail"]["code"], FEATURE_UNAVAILABLE)

    def test_local_llm_load_is_blocked(self):
        blocked = self.client.post("/api/v1/llm/load", json={"provider": "local"})
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.json()["detail"]["code"], FEATURE_UNAVAILABLE)


if __name__ == "__main__":
    unittest.main()
