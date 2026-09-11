from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from core_runtime import api
from services.platform_capabilities import FEATURE_UNAVAILABLE


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
        self.assertEqual(self.client.post("/api/v1/model3d/generate").status_code, 409)
        self.assertEqual(self.client.post("/api/v1/rig/generate").status_code, 409)
        mcp = self.client.post("/api/v1/wangp/mcp", json={"params": {"name": "generate"}})
        self.assertEqual(mcp.status_code, 409)

    def test_remote_llm_load_is_not_blocked_as_local_engine(self):
        with patch("services.llm_service.load_model"), patch(
            "services.llm_service.get_status", return_value={"loaded": False, "provider": "minimax"},
        ):
            response = self.client.post("/api/v1/llm/load", json={"provider": "minimax", "model_id": "MiniMax-M3"})
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
