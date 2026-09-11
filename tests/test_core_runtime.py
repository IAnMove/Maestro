from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from core_runtime import api
from services.platform_capabilities import FEATURE_UNAVAILABLE


class CoreRuntimeTests(unittest.TestCase):
    def test_generate_is_blocked_without_importing_torch(self):
        client = TestClient(api)
        with patch("services.platform_capabilities.host_platform", return_value="darwin"), patch(
            "services.platform_capabilities.host_machine", return_value="arm64",
        ):
            listed = client.get("/api/v1/system/capabilities")
            self.assertEqual(listed.status_code, 200)
            self.assertEqual(listed.json()["profile"], "macos-arm64-core-remote")
            models = client.get("/api/v1/models")
            self.assertEqual(models.status_code, 200)
            self.assertEqual(models.json()["models"], [])
            denied = client.post("/api/v1/generate")
            self.assertEqual(denied.status_code, 409)
            self.assertEqual(denied.json()["detail"]["code"], FEATURE_UNAVAILABLE)


if __name__ == "__main__":
    unittest.main()
