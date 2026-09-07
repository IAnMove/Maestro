#!/usr/bin/env python3
"""Stop Pinokio-cgroup runaways before the kernel OOM-kills the desktop app.

Agents launched from a Pinokio terminal (Grok, Codex, and other Node
processes whose ``comm`` is ``MainThread``) inherit Pinokio's Chromium
cgroup. When one of them balloons, systemd marks the whole scope as
``oom-kill`` and Pinokio dies. This process must run in a *separate*
user service, never inside that cgroup.

SIGSTOP does not free RAM. The guard sends SIGTERM, then SIGKILL.
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

CGROUP_FS = Path("/sys/fs/cgroup")
PROC_FS = Path("/proc")
MEMINFO_PATH = Path("/proc/meminfo")

PREFERRED_COMM = frozenset({"MainThread"})
PREFERRED_CMD_TOKENS = (
    "grok",
    "codex",
    "claude",
    "vitest",
    "playwright",
    "cursor-agent",
    "opencode",
)
PROTECTED_COMM = frozenset(
    {
        "systemd",
        "systemd-oomd",
        "gnome-shell",
        "Xorg",
        "pulseaudio",
        "pipewire",
        "dbus-daemon",
        "gdm-x-session",
    }
)
PINOKIO_COMM = "pinokio-bin"
CHROMIUM_SCOPE_PREFIX = "app-org.chromium.Chromium-"

DEFAULT_MIN_AVAILABLE_MIB = 2048
DEFAULT_WARN_AVAILABLE_MIB = 4096
DEFAULT_KILL_MIN_RSS_MIB = 2048
DEFAULT_PINOKIO_KILL_RSS_MIB = 8192
DEFAULT_POLL_SEC = 1.0
DEFAULT_TERM_WAIT_SEC = 2.0
DEFAULT_WARN_COOLDOWN_SEC = 300.0
DEFAULT_OOM_ADJ_PINOKIO = 50
DEFAULT_OOM_ADJ_AGENT = 400

INSTALL_LIB_DIR = Path.home() / ".local/lib/hocuspocus"
INSTALL_UNIT_PATH = Path.home() / ".config/systemd/user/hocuspocus-ram-guard.service"
INSTALL_USER_CONF = (
    Path.home() / ".config/systemd/user.conf.d/10-hocuspocus-oom-continue.conf"
)
INSTALL_SCOPE_DROPIN_DIR = (
    Path.home() / ".config/systemd/user/app-org.chromium.Chromium-.scope.d"
)

UNIT_TEMPLATE = """[Unit]
Description=HocusPocus RAM guard (kill Pinokio-cgroup runaways before kernel OOM)
Documentation=file://{script}
After=default.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 {script}
Restart=always
RestartSec=2
Nice=5
KillMode=process
MemoryMax=64M
MemoryHigh=32M
# Must stay out of app-org.chromium.Chromium-*.scope
Slice=app.slice

[Install]
WantedBy=default.target
"""

USER_CONF_TEMPLATE = """[Manager]
DefaultOOMPolicy=continue
"""

SCOPE_DROPIN_TEMPLATE = """[Scope]
OOMPolicy=continue
"""


@dataclass(frozen=True)
class Config:
    min_available_mib: int = DEFAULT_MIN_AVAILABLE_MIB
    warn_available_mib: int = DEFAULT_WARN_AVAILABLE_MIB
    kill_min_rss_mib: int = DEFAULT_KILL_MIN_RSS_MIB
    pinokio_kill_rss_mib: int = DEFAULT_PINOKIO_KILL_RSS_MIB
    poll_sec: float = DEFAULT_POLL_SEC
    term_wait_sec: float = DEFAULT_TERM_WAIT_SEC
    warn_cooldown_sec: float = DEFAULT_WARN_COOLDOWN_SEC
    dry_run: bool = False
    self_pid: int = 0


@dataclass(frozen=True)
class MemInfo:
    available_mib: int
    total_mib: int


@dataclass(frozen=True)
class Proc:
    pid: int
    comm: str
    cmdline: str
    rss_mib: int
    cgroup: str
    oom_score_adj: int


@dataclass(frozen=True)
class Decision:
    action: str
    victim: Proc | None
    reason: str


def parse_meminfo(text: str) -> MemInfo:
    available_kb = 0
    total_kb = 0
    for raw in text.splitlines():
        if raw.startswith("MemAvailable:"):
            available_kb = int(raw.split()[1])
        elif raw.startswith("MemTotal:"):
            total_kb = int(raw.split()[1])
    return MemInfo(available_mib=available_kb // 1024, total_mib=total_kb // 1024)


def is_pinokio_cgroup(cgroup: str) -> bool:
    return CHROMIUM_SCOPE_PREFIX in cgroup


def is_preferred_victim(proc: Proc) -> bool:
    if proc.comm in PREFERRED_COMM:
        return True
    cmd = proc.cmdline.lower()
    return any(token in cmd for token in PREFERRED_CMD_TOKENS)


def is_pinokio_bin(proc: Proc) -> bool:
    return proc.comm == PINOKIO_COMM or f"/{PINOKIO_COMM}" in proc.cmdline


def is_protected(proc: Proc, cfg: Config) -> bool:
    if cfg.self_pid and proc.pid == cfg.self_pid:
        return True
    if proc.comm in PROTECTED_COMM:
        return True
    if is_pinokio_bin(proc) and proc.rss_mib < cfg.pinokio_kill_rss_mib:
        return True
    return False


def choose_victim(procs: Sequence[Proc], cfg: Config) -> Proc | None:
    pool = [
        proc
        for proc in procs
        if proc.rss_mib >= cfg.kill_min_rss_mib
        and not is_protected(proc, cfg)
        and is_pinokio_cgroup(proc.cgroup)
    ]
    if not pool:
        return None
    return max(pool, key=lambda proc: proc.rss_mib)


def decide(mem: MemInfo, procs: Sequence[Proc], cfg: Config) -> Decision:
    if mem.available_mib > cfg.min_available_mib:
        if mem.available_mib <= cfg.warn_available_mib:
            return Decision("warn", None, "available RAM below warning threshold")
        return Decision("ok", None, "available RAM is healthy")
    victim = choose_victim(procs, cfg)
    if victim is None:
        return Decision(
            "critical_no_victim",
            None,
            "available RAM below kill threshold but no eligible Pinokio-cgroup process",
        )
    return Decision(
        "kill",
        victim,
        "available RAM below kill threshold; stopping runaway in Pinokio cgroup",
    )


def _read_text(path: Path, default: str = "") -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return default


def read_meminfo(path: Path = MEMINFO_PATH) -> MemInfo:
    return parse_meminfo(_read_text(path))


def _chromium_scope_dirs(uid: int) -> list[Path]:
    app_slice = (
        CGROUP_FS
        / "user.slice"
        / f"user-{uid}.slice"
        / f"user@{uid}.service"
        / "app.slice"
    )
    if not app_slice.is_dir():
        return []
    scopes = []
    try:
        for entry in app_slice.iterdir():
            name = entry.name
            if name.startswith(CHROMIUM_SCOPE_PREFIX) and name.endswith(".scope"):
                scopes.append(entry)
    except OSError:
        return []
    return scopes


def _pids_in_scopes(scopes: Iterable[Path]) -> list[int]:
    pids: list[int] = []
    for scope in scopes:
        text = _read_text(scope / "cgroup.procs")
        for line in text.splitlines():
            line = line.strip()
            if line.isdigit():
                pids.append(int(line))
    return pids


def _cmdline_of(pid: int) -> str:
    raw = _read_text(PROC_FS / str(pid) / "cmdline")
    return raw.replace("\x00", " ").strip()


def _status_fields(pid: int) -> tuple[str, int, int]:
    comm = ""
    rss_kb = 0
    oom_adj = 0
    for raw in _read_text(PROC_FS / str(pid) / "status").splitlines():
        if raw.startswith("Name:"):
            comm = raw.split(":", 1)[1].strip()
        elif raw.startswith("VmRSS:"):
            rss_kb = int(raw.split()[1])
        elif raw.startswith("oom_score_adj:"):
            oom_adj = int(raw.split()[1])
    return comm, rss_kb // 1024, oom_adj


def _cgroup_of(pid: int) -> str:
    return _read_text(PROC_FS / str(pid) / "cgroup").replace("\n", " ").strip()


def snapshot_pinokio_procs(uid: int | None = None) -> list[Proc]:
    if uid is None:
        uid = os.getuid()
    pids = _pids_in_scopes(_chromium_scope_dirs(uid))
    procs: list[Proc] = []
    for pid in pids:
        comm, rss_mib, oom_adj = _status_fields(pid)
        if not comm:
            continue
        procs.append(
            Proc(
                pid=pid,
                comm=comm,
                cmdline=_cmdline_of(pid),
                rss_mib=rss_mib,
                cgroup=_cgroup_of(pid),
                oom_score_adj=oom_adj,
            )
        )
    return procs


def log_event(event: str, **fields: object) -> None:
    payload = {"event": event, **fields}
    print(json.dumps(payload, ensure_ascii=True, sort_keys=True), flush=True)


def notify(title: str, body: str) -> None:
    if not os.environ.get("DISPLAY") and not os.environ.get("WAYLAND_DISPLAY"):
        return
    try:
        os.spawnlp(os.P_NOWAIT, "notify-send", "notify-send", "-u", "critical", title, body)
    except OSError:
        return


def send_signal(pid: int, sig: int, dry_run: bool) -> None:
    if dry_run:
        log_event("dry_run_signal", pid=pid, signal=sig)
        return
    os.kill(pid, sig)


def still_alive(pid: int) -> bool:
    return (PROC_FS / str(pid)).exists()


def stop_victim(victim: Proc, cfg: Config) -> None:
    log_event(
        "killing",
        pid=victim.pid,
        comm=victim.comm,
        rss_mib=victim.rss_mib,
        cmdline=victim.cmdline[:300],
        dry_run=cfg.dry_run,
    )
    notify(
        "HocusPocus RAM guard",
        f"Stopping {victim.comm} pid {victim.pid} ({victim.rss_mib} MiB) to keep Pinokio alive",
    )
    try:
        send_signal(victim.pid, signal.SIGTERM, cfg.dry_run)
    except ProcessLookupError:
        return
    if cfg.dry_run:
        return
    deadline = time.monotonic() + cfg.term_wait_sec
    while time.monotonic() < deadline and still_alive(victim.pid):
        time.sleep(0.1)
    if still_alive(victim.pid):
        log_event("escalating_sigkill", pid=victim.pid, comm=victim.comm)
        try:
            send_signal(victim.pid, signal.SIGKILL, False)
        except ProcessLookupError:
            return


def adjust_oom_scores(procs: Sequence[Proc], dry_run: bool) -> None:
    for proc in procs:
        if is_pinokio_bin(proc) and proc.oom_score_adj != DEFAULT_OOM_ADJ_PINOKIO:
            target = DEFAULT_OOM_ADJ_PINOKIO
        elif is_preferred_victim(proc) and proc.oom_score_adj < DEFAULT_OOM_ADJ_AGENT:
            target = DEFAULT_OOM_ADJ_AGENT
        else:
            continue
        if dry_run:
            continue
        path = PROC_FS / str(proc.pid) / "oom_score_adj"
        try:
            path.write_text(f"{target}\n", encoding="ascii")
        except OSError:
            continue


def config_from_env(namespace: argparse.Namespace) -> Config:
    return Config(
        min_available_mib=int(
            os.environ.get("HOCUSPOCUS_RAM_MIN_AVAILABLE_MIB", namespace.min_available_mib)
        ),
        warn_available_mib=int(
            os.environ.get("HOCUSPOCUS_RAM_WARN_AVAILABLE_MIB", namespace.warn_available_mib)
        ),
        kill_min_rss_mib=int(
            os.environ.get("HOCUSPOCUS_RAM_KILL_MIN_RSS_MIB", namespace.kill_min_rss_mib)
        ),
        pinokio_kill_rss_mib=int(
            os.environ.get(
                "HOCUSPOCUS_RAM_PINOKIO_KILL_RSS_MIB", namespace.pinokio_kill_rss_mib
            )
        ),
        poll_sec=float(os.environ.get("HOCUSPOCUS_RAM_POLL_SEC", namespace.poll_sec)),
        dry_run=namespace.dry_run,
        self_pid=os.getpid(),
    )


def install_guard(script_src: Path) -> None:
    INSTALL_LIB_DIR.mkdir(parents=True, exist_ok=True)
    dest = INSTALL_LIB_DIR / "ram_guard.py"
    dest.write_bytes(script_src.read_bytes())
    dest.chmod(0o755)
    INSTALL_UNIT_PATH.parent.mkdir(parents=True, exist_ok=True)
    INSTALL_UNIT_PATH.write_text(UNIT_TEMPLATE.format(script=dest), encoding="utf-8")
    INSTALL_USER_CONF.parent.mkdir(parents=True, exist_ok=True)
    INSTALL_USER_CONF.write_text(USER_CONF_TEMPLATE, encoding="utf-8")
    INSTALL_SCOPE_DROPIN_DIR.mkdir(parents=True, exist_ok=True)
    dropin = INSTALL_SCOPE_DROPIN_DIR / "10-oom-continue.conf"
    dropin.write_text(SCOPE_DROPIN_TEMPLATE, encoding="utf-8")
    log_event(
        "installed",
        script=str(dest),
        unit=str(INSTALL_UNIT_PATH),
        user_conf=str(INSTALL_USER_CONF),
        scope_dropin=str(dropin),
    )
    print(
        "Enable with:\n"
        "  systemctl --user daemon-reload\n"
        "  systemctl --user enable --now hocuspocus-ram-guard.service",
        flush=True,
    )


def run_once(cfg: Config) -> Decision:
    mem = read_meminfo()
    procs = snapshot_pinokio_procs()
    decision = decide(mem, procs, cfg)
    log_event(
        "sample",
        action=decision.action,
        available_mib=mem.available_mib,
        total_mib=mem.total_mib,
        pinokio_procs=len(procs),
        victim_pid=decision.victim.pid if decision.victim else None,
        victim_comm=decision.victim.comm if decision.victim else None,
        victim_rss_mib=decision.victim.rss_mib if decision.victim else None,
        reason=decision.reason,
    )
    return decision


def loop(cfg: Config) -> None:
    last_warn = 0.0
    log_event(
        "started",
        min_available_mib=cfg.min_available_mib,
        kill_min_rss_mib=cfg.kill_min_rss_mib,
        dry_run=cfg.dry_run,
        pid=cfg.self_pid,
    )
    while True:
        mem = read_meminfo()
        procs = snapshot_pinokio_procs()
        adjust_oom_scores(procs, cfg.dry_run)
        decision = decide(mem, procs, cfg)
        if decision.action == "kill" and decision.victim is not None:
            log_event(
                "critical",
                available_mib=mem.available_mib,
                reason=decision.reason,
            )
            stop_victim(decision.victim, cfg)
        elif decision.action == "warn":
            now = time.monotonic()
            if now - last_warn >= cfg.warn_cooldown_sec:
                last_warn = now
                log_event("warn", available_mib=mem.available_mib, reason=decision.reason)
        elif decision.action == "critical_no_victim":
            now = time.monotonic()
            if now - last_warn >= cfg.warn_cooldown_sec:
                last_warn = now
                log_event(
                    "critical_no_victim",
                    available_mib=mem.available_mib,
                    reason=decision.reason,
                )
        time.sleep(cfg.poll_sec)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="sample once and exit")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--install", action="store_true", help="install systemd user unit")
    parser.add_argument("--min-available-mib", type=int, default=DEFAULT_MIN_AVAILABLE_MIB)
    parser.add_argument("--warn-available-mib", type=int, default=DEFAULT_WARN_AVAILABLE_MIB)
    parser.add_argument("--kill-min-rss-mib", type=int, default=DEFAULT_KILL_MIN_RSS_MIB)
    parser.add_argument(
        "--pinokio-kill-rss-mib", type=int, default=DEFAULT_PINOKIO_KILL_RSS_MIB
    )
    parser.add_argument("--poll-sec", type=float, default=DEFAULT_POLL_SEC)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.install:
        install_guard(Path(__file__).resolve())
        return 0
    cfg = config_from_env(args)
    if args.once:
        run_once(cfg)
        return 0
    loop(cfg)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(0)
