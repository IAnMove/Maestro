"""React artifact checks and support identity; standard library only, no AI imports."""
from __future__ import annotations

import hashlib
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import platform
import subprocess
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = "build-info.json"


def source_identity(root: Path = ROOT) -> dict:
    def git(*args):
        try:
            return subprocess.run(["git", *args], cwd=root, capture_output=True,
                                  text=True, timeout=5, check=True).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            return "unknown"
    try:
        version = (root / "VERSION").read_text(encoding="utf-8").strip() or "unknown"
    except OSError:
        version = "unknown"
    return {"version": version, "revision": git("describe", "--tags", "--always", "--dirty"),
            "commit": git("rev-parse", "HEAD"), "branch": git("branch", "--show-current") or "detached"}


def source_digest(root: Path = ROOT) -> str:
    """Hash build inputs, including the scoped developer architecture snapshot."""
    ui = root / "ui"
    paths = [p for p in ui.iterdir() if p.is_file() and p.suffix in {".json", ".ts", ".js", ".html"}]
    for directory in ("src", "public", "scripts"):
        paths.extend(p for p in (ui / directory).rglob("*") if p.is_file()
                     and not p.is_relative_to(ui / "public/dev/architecture"))
    paths.extend([root / "VERSION", root / "scripts/graphs/story_director_audio_flow.py",
                  root / "scripts/build_ui.py", root / "app/services/ui_distribution.py",
                  root / "app/_launch_runtime.py", root / "tests/fixtures/route_table.json"])
    digest = hashlib.sha256()
    for p in sorted(set(paths)):
        digest.update(p.relative_to(root).as_posix().encode())
        digest.update(b"\0")
        digest.update(p.read_bytes())
    return digest.hexdigest()


class _References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
        self.modules = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        url = attrs.get("src") if tag == "script" else attrs.get("href") if tag == "link" else None
        if url:
            self.urls.append(url)
        if tag == "script" and attrs.get("type") == "module" and url:
            self.modules.append(url)


def _asset(dist: Path, name: str) -> Path:
    path = (dist / name).resolve()
    if not path.is_relative_to(dist.resolve()):
        raise ValueError("UI asset escapes the build directory")
    return path


def validate_artifact(dist: Path, *, managed: bool = False) -> dict:
    """Check entry assets, and every generated chunk when a receipt is available."""
    parser = _References()
    parser.feed((dist / "index.html").read_text(encoding="utf-8"))
    if not parser.modules:
        raise ValueError("React entry module missing from index.html")
    for url in parser.urls:
        ref = urlsplit(url)
        if ref.scheme or ref.netloc:
            continue
        file = _asset(dist, unquote(ref.path).lstrip("/"))
        if not file.is_file() or file.stat().st_size == 0:
            raise ValueError(f"UI asset missing or empty: {ref.path}")
    manifest = dist / MANIFEST
    if not manifest.exists() and not managed:
        return {}  # Plain `npm run build` remains supported; identity is unavailable.
    info = json.loads(manifest.read_text(encoding="utf-8"))
    if (not isinstance(info, dict) or info.get("schema") != 1
            or not isinstance(info.get("files"), dict) or "index.html" not in info["files"]
            or any(not isinstance(info.get(key), str) or not info[key]
                   for key in ("build_id", "built_at", "source_digest", "version", "commit"))):
        raise ValueError("Invalid React build receipt")
    for name, expected in info["files"].items():
        if not isinstance(name, str) or not isinstance(expected, str):
            raise ValueError("Invalid UI asset fingerprint")
        if hashlib.sha256(_asset(dist, name).read_bytes()).hexdigest() != expected:
            raise ValueError(f"UI asset changed: {name}")
    return info


def build_status(root: Path = ROOT, *, current: bool = False) -> dict:
    try:
        info = validate_artifact(root / "ui/dist", managed=current)
        if current and info.get("source_digest") != source_digest(root):
            return {"ready": False, "reason": "React build is older than its source files", "build": info}
        return {"ready": True, "reason": "", "build": info}
    except FileNotFoundError:
        # Missing output is expected on fresh installs. Pinokio treats literal
        # 'Errno' in any output as a shell failure, even while recovery succeeds.
        return {"ready": False, "reason": "React build files are missing", "build": {}}
    except (OSError, ValueError, TypeError) as exc:
        return {"ready": False, "reason": str(exc), "build": {}}


def report_identity(root: Path = ROOT) -> None:
    source = source_identity(root)
    state = build_status(root)
    info = state["build"]
    print(f"[HocusPocus] Version: {source['version']} | branch: {source['branch']} | commit: {source['commit']} | revision: {source['revision']}", flush=True)
    print(f"[HocusPocus] System: {platform.system()} {platform.release()} ({platform.version()}) | {platform.machine()} | Python {platform.python_version()}", flush=True)
    print(f"[HocusPocus] React build: {info.get('build_id', 'unavailable')} | built: {info.get('built_at', 'unknown')} | commit: {info.get('commit', 'unknown')}", flush=True)
    print(f"[HocusPocus] React status: {'ready' if state['ready'] else 'unavailable'} {state['reason']}", flush=True)


def recovery_html(root: Path = ROOT) -> str:
    source = source_identity(root)
    details = escape(f"Version {source['version']} | branch {source['branch']} | commit {source['commit']} | React build unavailable")
    return f"""<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HocusPocus — Web UI needs repair</title>
<body style="font:16px system-ui;background:#111;color:#eee;max-width:760px;margin:10vh auto;padding:24px">
<h1>HocusPocus Web UI needs repair</h1>
<p>The API started, but the React interface is missing or incomplete.</p>
<ol><li>Stop Start in Pinokio.</li><li>Click <b>Repair Web UI</b> in the app menu.</li>
<li>Wait for “React build ready”, then click <b>Start</b> again.</li></ol>
<p>Manual repair from the repository folder:</p><pre>python scripts/build_ui.py --force</pre>
<p>For older installations without Repair Web UI:</p>
<pre>cd ui\nnpm ci --include=dev\nnpm run build</pre>
<p>Restart Start after building. This repair does not reinstall models.</p>
<p><a href="/classic/">Classic UI</a> · <a href="/docs">API documentation</a></p>
<p>Include this information and the first installation error in your report:</p>
<pre style="white-space:pre-wrap;overflow-wrap:anywhere">{details}</pre></body></html>"""
