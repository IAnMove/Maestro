"""Regression coverage for Maestro's MiniMax H3 Sol Engine path."""

from __future__ import annotations

from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
if str(APP) not in sys.path:
    sys.path.insert(0, str(APP))


class TestSolEngineSourceContracts(unittest.TestCase):

    def test_sol_package_and_upstream_license_are_bundled(self):
        package = APP / "shared" / "sol_attn"
        self.assertTrue((package / "interface.py").is_file())
        self.assertTrue((package / "saganaki" / "LICENSE").is_file())
        self.assertIn(
            "Apache License",
            (package / "saganaki" / "LICENSE").read_text(encoding="utf-8"),
        )
        self.assertIn(
            "SPDX-License-Identifier: Apache-2.0",
            (package / "interface.py").read_text(encoding="utf-8"),
        )








class TestSolAttentionRouting(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            import torch
        except ModuleNotFoundError as exc:
            raise unittest.SkipTest(
                "MiniMax H3 Sol routing tests require PyTorch"
            ) from exc

        cls.torch = torch

    def test_main_h3_blocks_share_sol_policy_but_refiner_does_not(self):
        from models.minimax_h3.transformer import MiniMaxH3Transformer

        model = MiniMaxH3Transformer(
            hidden_size=8,
            num_layers=2,
            token_refiner_layers=1,
            num_attention_heads=1,
            attention_head_dim=8,
            ffn_dim=12,
            video_channels=2,
            audio_channels=3,
            patch_size=(1, 1, 1),
            text_dim=6,
            curve_grid=4,
            curve_dim=2,
            rope_freq_dim=1,
            dtype=self.torch.float32,
        )

        self.assertIs(model.blocks[0].attn.sol_attention, model.sol_attention)
        self.assertIs(model.blocks[1].attn.sol_attention, model.sol_attention)
        self.assertIsNone(model.token_refiner.blocks[0].attn.sol_attention)

    def test_attention_routes_eligible_call_through_policy(self):
        from models.minimax_h3.transformer import MiniMaxH3Attention

        torch = self.torch

        class Probe:
            def __init__(self):
                self.called = False

            def use_for_layer(self, tokens, attention_mask=None):
                return tokens == 4 and attention_mask is None

            def __call__(self, qkv_list, use_sol):
                self.called = use_sol
                query, key, value = qkv_list
                qkv_list.clear()
                return torch.nn.functional.scaled_dot_product_attention(
                    query.transpose(1, 2),
                    key.transpose(1, 2),
                    value.transpose(1, 2),
                ).transpose(1, 2)

        probe = Probe()
        attention = MiniMaxH3Attention(
            8,
            1,
            8,
            1e-5,
            torch.float32,
            sol_attention=probe,
        ).eval()
        with torch.inference_mode():
            output = attention(torch.randn(1, 4, 8))

        self.assertTrue(probe.called)
        self.assertEqual(tuple(output.shape), (1, 4, 8))

    def test_float32_normalized_queries_use_value_compute_dtype(self):
        from unittest.mock import patch
        from models.minimax_h3.sol_attention import MiniMaxH3SolAttention
        torch = self.torch
        query = torch.randn(1, 4, 1, 8, dtype=torch.float32)
        value = query.clone()
        inputs = [query, query.clone(), value]
        def kernel(q, k, v, **kwargs):
            self.assertEqual(q.dtype, torch.bfloat16)
            self.assertEqual(k.dtype, torch.bfloat16)
            self.assertEqual(v.dtype, torch.bfloat16)
            return v
        with patch("shared.sol_attn.sol_attn", side_effect=kernel):
            output = MiniMaxH3SolAttention()(inputs, True)
        self.assertEqual(output.dtype, torch.float32)
        self.assertEqual(inputs, [])
        torch.testing.assert_close(output, value.bfloat16().float())

    def test_sla_normalizes_projection_dtypes_without_losing_output_dtype(self):
        from unittest.mock import patch
        from models.minimax_h3.sla_attention import MiniMaxH3SLAAttention
        torch = self.torch
        value = torch.randn(1, 4, 1, 8, dtype=torch.float32)
        inputs = [value, value.clone(), value.clone()]
        def kernel(q, k, v, *args):
            self.assertEqual({q.dtype, k.dtype, v.dtype}, {torch.bfloat16})
            return v
        with patch("models.minimax_h3.sla_block_map.get_block_map", return_value=(None, 1)), patch("models.minimax_h3.sla_kernel.block_sparse_attention", side_effect=kernel):
            output = MiniMaxH3SLAAttention()(inputs, True)
        self.assertEqual(output.dtype, torch.float32)
        self.assertEqual(inputs, [])
        torch.testing.assert_close(output, value.bfloat16().float())

    def test_kernel_failure_stays_on_dense_fallback_for_process(self):
        from models.minimax_h3.sol_attention import MiniMaxH3SolAttention

        policy = MiniMaxH3SolAttention()
        policy.enabled = True
        policy._fallback("test failure")

        self.assertTrue(policy._runtime_failed)
        self.assertFalse(policy.enabled)


if __name__ == "__main__":
    unittest.main()
