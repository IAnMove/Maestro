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
from services.core_remote_image import catalog_entry


class ImmediateThread:
    def __init__(self, target=None, args=(), kwargs=None, daemon=None, name=None):
        self._target = target
        self._args = args

    def start(self):
        self._target(*self._args)


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
        model = self.client.get("/api/v1/models").json()["models"][0]
        self.assertEqual(model["model_type"], "minimax:image-01")
        self.assertFalse(model["is_t2v"])
        self.assertEqual(model["family"], "minimax")
        self.assertFalse(catalog_entry()["is_t2v"])
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

    def test_series_import_copies_story_uploads_into_the_workspace(self):
        folder, previous = self._in_temp_workspace()
        try:
            Path("outputs").mkdir()
            Path("uploads").mkdir()
            Path("uploads", "hero.png").write_bytes(b"png-bytes")
            saved = self.client.put("/api/v1/stories/library", json={
                "workspace": "default",
                "baseRevision": 0,
                "library": {
                    "version": 2,
                    "revision": 0,
                    "activeId": "story_mac",
                    "projects": {
                        "story_mac": {
                            "id": "story_mac",
                            "title": "Harbour",
                            "premise": "A lantern wakes the harbour.",
                            "assets": {
                                "asset_hero": {
                                    "id": "asset_hero",
                                    "name": "Hero",
                                    "source": "/api/v1/uploads/hero.png",
                                }
                            },
                            "characters": [{
                                "id": "char_keeper",
                                "name": "Keeper",
                                "referenceAssetIds": ["asset_hero"],
                                "primaryReferenceAssetId": "asset_hero",
                            }],
                        }
                    },
                },
            })
            imported = self.client.post("/api/v1/series/import-story", json={
                "workspace": "default",
                "storyId": "story_mac",
            })
            series = imported.json() if imported.status_code == 200 else {}
            copied_bytes = b""
            copied_count = 0
            if series.get("id"):
                assets_dir = Path("outputs") / "assets" / series["id"]
                copied = list(assets_dir.glob("*")) if assets_dir.is_dir() else []
                copied_count = len(copied)
                copied_bytes = copied[0].read_bytes() if copied else b""
        finally:
            self._leave_temp_workspace(folder, previous)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(imported.status_code, 200, imported.text)
        assets = series.get("assets") or {}
        self.assertIn("asset_hero", assets)
        self.assertTrue(str(assets["asset_hero"]["uri"]).startswith(f"assets/{series['id']}/"))
        self.assertTrue(str(assets["asset_hero"]["uri"]).endswith(".png"))
        self.assertEqual(series["characters"][0]["referenceAssetIds"], ["asset_hero"])
        self.assertEqual(series["characters"][0]["primaryReferenceAssetId"], "asset_hero")
        self.assertEqual(copied_count, 1)
        self.assertEqual(copied_bytes, b"png-bytes")

    def test_series_import_rejects_a_missing_story_upload(self):
        folder, previous = self._in_temp_workspace()
        try:
            Path("outputs").mkdir()
            Path("uploads").mkdir()
            denied = self.client.post("/api/v1/series/import-story", json={
                "workspace": "default",
                "story": {
                    "id": "story_missing",
                    "title": "Missing hero",
                    "assets": {
                        "asset_hero": {
                            "id": "asset_hero",
                            "name": "Hero",
                            "source": "/api/v1/uploads/missing.png",
                        }
                    },
                },
            })
        finally:
            self._leave_temp_workspace(folder, previous)
        self.assertEqual(denied.status_code, 400, denied.text)
        self.assertIn("no longer available", denied.json()["detail"])

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

    def test_minimax_image_generate_starts_a_studio_job(self):
        folder, previous = self._in_temp_workspace()
        try:
            Path("outputs").mkdir()
            fake = {"name": "minimax.jpg", "path": "minimax.jpg", "prompt": "a lantern", "aspect_ratio": "1:1"}
            with patch("services.minimax_image_service.generate_image", return_value=fake), patch(
                "services.execution_mode.validate_remote_provider",
            ):
                response = self.client.post("/api/v1/generate", json={
                    "model_type": "minimax:image-01",
                    "generation_mode": "image",
                    "prompt": "a lantern in the rain",
                    "workspace": "default",
                })
        finally:
            self._leave_temp_workspace(folder, previous)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("job_id", response.json())
        status = self.client.get(f"/api/v1/status/{response.json()['job_id']}")
        self.assertEqual(status.status_code, 200)

    def test_series_plan_start_uses_the_remote_llm(self):
        series = {
            "id": "series_mac", "revision": 1, "provider": {},
            "episodesById": {"ep1": {"id": "ep1", "premise": "A lantern wakes the harbour.", "updatedAt": "t"}},
        }
        library = {"seriesById": {"series_mac": series}}

        folder, previous = self._in_temp_workspace()
        try:
            Path("outputs").mkdir()
            with patch("services.core_series_plan._series_or_404", return_value=(series, library)), patch(
                "services.core_series_plan._generate_json", return_value={"outline": {"beats": ["The lantern wakes."]}},
            ), patch("services.core_series_plan._writing_override", return_value=None), patch(
                "services.core_series_plan.threading.Thread", ImmediateThread,
            ):
                started = self.client.post(
                    "/api/v1/series/series_mac/episodes/ep1/plan/start",
                    json={"workspace": "default", "scope": "outline"},
                )
        finally:
            os.chdir(previous)
            folder.cleanup()
        self.assertEqual(started.status_code, 200, started.text)
        self.assertTrue(str(started.json()["jobId"]).startswith("series-plan-"))

    def test_series_known_series_bootstrap_auto_applies(self):
        folder, previous = self._in_temp_workspace()
        try:
            Path("outputs").mkdir()
            created = self.client.post("/api/v1/series", json={"workspace": "default", "title": "Untitled series"})
            self.assertEqual(created.status_code, 200, created.text)
            series_id = created.json()["id"]
            raw = {
                "setup": {
                    "title": "Harbour Lights",
                    "premise": "A lantern wakes the harbour every dusk.",
                    "visualStyle": "Wet cobbles, amber lamps",
                    "format": "episodic",
                    "defaultEpisodeDurationSeconds": 75,
                },
                "canon": {
                    "worldSummary": "A coastal town that bargains with the tide.",
                    "immutableRules": [{"id": "rule_tide", "description": "The lantern must be lit at dusk."}],
                    "currentFacts": [],
                    "forbiddenChanges": [],
                    "themes": ["duty"],
                    "longArcs": [],
                    "timeline": [],
                },
                "characters": [{"id": "mara", "name": "Mara", "role": "keeper"}],
                "locations": [{"id": "harbour", "name": "Harbour"}],
                "relationships": [],
                "props": [],
            }
            with patch("services.core_series_plan._generate_json", return_value=raw), patch(
                "services.core_series_plan._writing_override", return_value=None,
            ), patch("services.core_series_plan.threading.Thread", ImmediateThread):
                started = self.client.post(
                    f"/api/v1/series/{series_id}/canon/prepare/start",
                    json={
                        "workspace": "default",
                        "instruction": "Continue Harbour Lights",
                        "bootstrapKnownSeries": True,
                        "autoApply": True,
                    },
                )
            self.assertEqual(started.status_code, 200, started.text)
            job_id = started.json()["jobId"]
            job = self.client.get(f"/api/v1/series/plan/jobs/{job_id}")
            self.assertEqual(job.status_code, 200, job.text)
            body = job.json()
            self.assertEqual(body["status"], "completed")
            self.assertTrue(body["autoApplied"])
            self.assertEqual(body["seriesResult"]["title"], "Harbour Lights")
            self.assertEqual(body["seriesResult"]["canon"]["immutableRules"][0]["description"], "The lantern must be lit at dusk.")
            stored = self.client.get(f"/api/v1/series/{series_id}", params={"workspace": "default"})
            self.assertEqual(stored.status_code, 200, stored.text)
            project = stored.json()
            self.assertEqual(project["title"], "Harbour Lights")
            self.assertEqual(project["characters"][0]["name"], "Mara")
            self.assertEqual(project["characters"][0]["approval"], "draft")
        finally:
            self._leave_temp_workspace(folder, previous)

    def test_series_canon_prepare_normalizes_before_review(self):
        folder, previous = self._in_temp_workspace()
        try:
            Path("outputs").mkdir()
            created = self.client.post("/api/v1/series", json={
                "workspace": "default",
                "title": "Harbour Lights",
            })
            self.assertEqual(created.status_code, 200, created.text)
            series_id = created.json()["id"]
            raw = {
                "canon": {
                    "worldSummary": "A coastal town that bargains with the tide.",
                    "immutableRules": [{"id": "rule_tide", "description": "The lantern must be lit at dusk."}],
                    "forbiddenChanges": ["No daylight lantern"],
                    "themes": ["duty"],
                    "longArcs": [],
                },
                "characters": [{"id": "mara", "name": "Mara"}],
                "locations": [{"id": "harbour", "name": "Harbour"}],
                "relationships": [],
            }
            with patch("services.core_series_plan._generate_json", return_value=raw), patch(
                "services.core_series_plan._writing_override", return_value=None,
            ), patch("services.core_series_plan.threading.Thread", ImmediateThread):
                started = self.client.post(
                    f"/api/v1/series/{series_id}/canon/prepare/start",
                    json={"workspace": "default", "instruction": "Tighten the bible"},
                )
            self.assertEqual(started.status_code, 200, started.text)
            job = self.client.get(f"/api/v1/series/plan/jobs/{started.json()['jobId']}")
            self.assertEqual(job.status_code, 200, job.text)
            proposal = job.json()["seriesResult"]
            self.assertEqual(job.json()["status"], "completed")
            self.assertFalse(job.json().get("autoApplied"))
            self.assertEqual(proposal["characters"][0]["approval"], "draft")
            self.assertEqual(proposal["canon"]["immutableRules"][0]["status"], "draft")
            applied = self.client.post(f"/api/v1/series/plan/jobs/{started.json()['jobId']}/apply-canon")
            self.assertEqual(applied.status_code, 200, applied.text)
            self.assertEqual(applied.json()["characters"][0]["name"], "Mara")
        finally:
            self._leave_temp_workspace(folder, previous)

    def test_local_llm_load_is_blocked(self):
        blocked = self.client.post("/api/v1/llm/load", json={"provider": "local"})
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.json()["detail"]["code"], FEATURE_UNAVAILABLE)


if __name__ == "__main__":
    unittest.main()
