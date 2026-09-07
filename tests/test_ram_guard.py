"""Unit tests for the Pinokio-cgroup RAM guard."""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ram_guard", ROOT / "scripts" / "ram_guard.py")
assert SPEC is not None and SPEC.loader is not None
ram_guard = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ram_guard
SPEC.loader.exec_module(ram_guard)


def _proc(**kwargs) -> ram_guard.Proc:
    fields = {
        "pid": 1,
        "comm": "proc",
        "cmdline": "/usr/bin/proc",
        "rss_mib": 100,
        "cgroup": "/user.slice/user-1000.slice/user@1000.service/app.slice/app-org.chromium.Chromium-1994132.scope",
        "oom_score_adj": 200,
    }
    fields.update(kwargs)
    return ram_guard.Proc(**fields)


SEP6_STYLE = [
    _proc(pid=1994132, comm="pinokio-bin", cmdline="/opt/Pinokio/pinokio-bin", rss_mib=145),
    _proc(
        pid=3543985,
        comm="MainThread",
        cmdline="node /home/ina/pinokio/cache/npm_config_cache/_npx/grok",
        rss_mib=55910,
    ),
    _proc(
        pid=2115391,
        comm="python",
        cmdline="python launch.py",
        rss_mib=677,
    ),
    _proc(
        pid=36854,
        comm="firefox",
        cmdline="/snap/firefox/firefox",
        rss_mib=740,
        cgroup="/user.slice/user-1000.slice/user@1000.service/app.slice/app-firefox.scope",
    ),
]


class ParseMeminfoTests(unittest.TestCase):
    def test_reads_available_and_total(self):
        text = "MemTotal:       65536000 kB\nMemFree:        1000 kB\nMemAvailable:   2097152 kB\n"
        mem = ram_guard.parse_meminfo(text)
        self.assertEqual(mem.total_mib, 64000)
        self.assertEqual(mem.available_mib, 2048)


class ClassificationTests(unittest.TestCase):
    def test_pinokio_cgroup_detects_chromium_scope(self):
        self.assertTrue(ram_guard.is_pinokio_cgroup(SEP6_STYLE[0].cgroup))
        self.assertFalse(ram_guard.is_pinokio_cgroup(SEP6_STYLE[3].cgroup))

    def test_preferred_victim_is_node_agent_comm(self):
        self.assertTrue(ram_guard.is_preferred_victim(SEP6_STYLE[1]))
        self.assertFalse(ram_guard.is_preferred_victim(SEP6_STYLE[2]))

    def test_pinokio_bin_is_protected_until_renderer_leak(self):
        cfg = ram_guard.Config(self_pid=99)
        self.assertTrue(ram_guard.is_protected(SEP6_STYLE[0], cfg))
        leaked = _proc(pid=7, comm="pinokio-bin", cmdline="/opt/Pinokio/pinokio-bin", rss_mib=9000)
        self.assertFalse(ram_guard.is_protected(leaked, cfg))

    def test_guard_does_not_select_itself(self):
        cfg = ram_guard.Config(self_pid=42, kill_min_rss_mib=100)
        self.assertTrue(ram_guard.is_protected(_proc(pid=42, rss_mib=8000, comm="MainThread"), cfg))


class ChooseVictimTests(unittest.TestCase):
    def test_selects_agent_not_hocuspocus_python_or_firefox(self):
        cfg = ram_guard.Config(self_pid=1, kill_min_rss_mib=2048)
        victim = ram_guard.choose_victim(SEP6_STYLE, cfg)
        self.assertIsNotNone(victim)
        assert victim is not None
        self.assertEqual(victim.pid, 3543985)
        self.assertEqual(victim.comm, "MainThread")

    def test_ignores_fat_process_outside_pinokio_cgroup(self):
        cfg = ram_guard.Config(self_pid=1, kill_min_rss_mib=2048)
        procs = [
            SEP6_STYLE[0],
            _proc(
                pid=9,
                comm="MainThread",
                cmdline="node grok",
                rss_mib=40000,
                cgroup="/user.slice/user-1000.slice/user@1000.service/app.slice/app-other.scope",
            ),
        ]
        self.assertIsNone(ram_guard.choose_victim(procs, cfg))

    def test_selects_largest_eligible_rss(self):
        cfg = ram_guard.Config(self_pid=1, kill_min_rss_mib=2048)
        procs = [
            SEP6_STYLE[0],
            _proc(pid=10, comm="python", cmdline="python launch.py", rss_mib=3000),
            _proc(pid=11, comm="MainThread", cmdline="node grok", rss_mib=2500),
        ]
        victim = ram_guard.choose_victim(procs, cfg)
        self.assertIsNotNone(victim)
        assert victim is not None
        self.assertEqual(victim.pid, 10)


class DecideTests(unittest.TestCase):
    def test_healthy_memory_is_ok(self):
        cfg = ram_guard.Config(self_pid=1)
        decision = ram_guard.decide(ram_guard.MemInfo(55000, 64000), SEP6_STYLE, cfg)
        self.assertEqual(decision.action, "ok")
        self.assertIsNone(decision.victim)

    def test_warns_before_killing(self):
        cfg = ram_guard.Config(self_pid=1, min_available_mib=2048, warn_available_mib=4096)
        decision = ram_guard.decide(ram_guard.MemInfo(3000, 64000), SEP6_STYLE, cfg)
        self.assertEqual(decision.action, "warn")
        self.assertIsNone(decision.victim)

    def test_kills_when_two_gib_remain(self):
        cfg = ram_guard.Config(self_pid=1, min_available_mib=2048)
        decision = ram_guard.decide(ram_guard.MemInfo(1500, 64000), SEP6_STYLE, cfg)
        self.assertEqual(decision.action, "kill")
        assert decision.victim is not None
        self.assertEqual(decision.victim.pid, 3543985)

    def test_critical_without_eligible_victim(self):
        cfg = ram_guard.Config(self_pid=1, kill_min_rss_mib=2048)
        small = [
            _proc(pid=1994132, comm="pinokio-bin", cmdline="/opt/Pinokio/pinokio-bin", rss_mib=200),
            _proc(pid=8, comm="MainThread", cmdline="node grok", rss_mib=80),
        ]
        decision = ram_guard.decide(ram_guard.MemInfo(500, 64000), small, cfg)
        self.assertEqual(decision.action, "critical_no_victim")
        self.assertIsNone(decision.victim)


if __name__ == "__main__":
    unittest.main()
