#!/usr/bin/env python3
"""Run the manual Wizard acceptance suite against a live HocusPocus API."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.error import URLError
from urllib.request import urlopen

from acceptance_report import build_report


ROOT = Path(__file__).resolve().parents[1]


def read_json(url: str) -> dict:
    with urlopen(url, timeout=10) as response:  # noqa: S310 - explicit local acceptance URL
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default=os.environ.get('HOCUSPOCUS_BASE_URL'))
    parser.add_argument('--profile', choices=('plan', 'simulate', 'real'), default='simulate')
    parser.add_argument('--scenario', choices=('smoke', 'full', 'studio', 'language', 'music-video', 'music-video-new', 'comic', 'series', 'failure', 'cancel', 'workspace', 'app-tour', 'app-generate', 'app'), default='smoke')
    parser.add_argument('--headed', action='store_true')
    parser.add_argument('--resume', action='store_true', help='Run only tests that failed in the previous Playwright invocation')
    parser.add_argument('--confirm-real', action='store_true')
    parser.add_argument('--output-dir', type=Path, help='Evidence root; each attempt gets its own directory')
    parser.add_argument('--workspace-prefix', help='New real-mode output folders start with this e2e_ prefix')
    parser.add_argument('--browser-executable', help='Optional Chromium executable, e.g. /snap/bin/chromium')
    args = parser.parse_args()

    if not args.base_url:
        print(
            'Pass --base-url with the URL shown by Pinokio, or set HOCUSPOCUS_BASE_URL.',
            file=sys.stderr,
        )
        return 2
    base_url = args.base_url.rstrip('/')
    try:
        config = read_json(f'{base_url}/api/v1/system-config')
    except (OSError, URLError, ValueError) as exc:
        print(f'HocusPocus is not reachable at {base_url}: {exc}', file=sys.stderr)
        return 2
    actual = config.get('execution_mode', 'real')
    if actual != args.profile:
        print(
            f'Backend mode is {actual!r}, requested {args.profile!r}. Restart HocusPocus with '
            f'HOCUSPOCUS_EXECUTION_MODE={args.profile} before running this suite.',
            file=sys.stderr,
        )
        return 2
    if args.profile == 'real' and not args.confirm_real:
        print('Real generation requires --confirm-real.', file=sys.stderr)
        return 2
    if args.scenario in ('app-generate', 'app') and args.profile != 'real':
        print('Native media assertions require --profile real --confirm-real. Use app-tour for other profiles.', file=sys.stderr)
        return 2

    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    output = (args.output_dir or ROOT / 'outputs' / f'acceptance-{stamp}').resolve()
    manifest_path = output / 'run.json'
    if args.resume and not manifest_path.exists():
        print('--resume needs --output-dir pointing to an existing run.json.', file=sys.stderr)
        return 2
    try:
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'attempts': []}
        if not isinstance(manifest, dict) or not isinstance(manifest.get('attempts'), list):
            raise ValueError('expected an attempts list')
    except (OSError, ValueError) as exc:
        print(f'Cannot read existing manifest; preserving it: {exc}', file=sys.stderr)
        return 2
    prefix = args.workspace_prefix or manifest.get('workspace_prefix') or f'e2e_acceptance_{stamp}'
    if not prefix.startswith(('e2e_', 'e2e-')) or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in prefix):
        print('--workspace-prefix must be an e2e_ name containing only letters, digits, _ or -.', file=sys.stderr)
        return 2
    previous = None
    if args.resume:
        if not manifest['attempts'] or manifest['attempts'][-1]['status'] == 'running':
            print('Previous attempt is not finalized. Inspect its process and backend task before resuming.', file=sys.stderr)
            return 2
        if manifest['attempts'][-1]['scenario'] != args.scenario or manifest.get('profile') != args.profile:
            print('--resume must use the previous scenario and profile.', file=sys.stderr)
            return 2
        previous = Path(manifest['attempts'][-1]['path']) / 'raw' / '.last-run.json'
        if not previous.exists():
            print('Previous attempt has no Playwright .last-run.json; cannot resume.', file=sys.stderr)
            return 2
        try:
            last_run = json.loads(previous.read_text())
            failed_ids = last_run.get('failedTests') if isinstance(last_run, dict) else None
            if (
                not isinstance(last_run, dict)
                or last_run.get('status') not in ('failed', 'interrupted', 'timedout')
                or not isinstance(failed_ids, list)
                or not failed_ids
                or not all(isinstance(item, str) and item.strip() for item in failed_ids)
            ):
                raise ValueError('expected a failed/interrupted run with non-empty failed test IDs')
        except (OSError, ValueError) as exc:
            print(f'Cannot resume invalid or empty Playwright failure state; no tests launched: {exc}', file=sys.stderr)
            return 2
    attempt = output / f'attempt-{stamp}'
    attempt.mkdir(parents=True, exist_ok=False)
    if previous:
        (attempt / 'raw').mkdir()
        shutil.copy2(previous, attempt / 'raw' / '.last-run.json')
    manifest.update({'base_url': base_url, 'profile': args.profile, 'workspace_prefix': prefix})
    record = {'path': str(attempt), 'scenario': args.scenario, 'base_url': base_url, 'profile': args.profile, 'workspace_prefix': prefix, 'started_at': stamp, 'status': 'running'}
    manifest['attempts'].append(record)
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

    environment = os.environ.copy()
    environment.update({
        'HOCUSPOCUS_BASE_URL': base_url,
        'HOCUSPOCUS_E2E_PROFILE': args.profile,
        'HOCUSPOCUS_E2E_SCENARIO': args.scenario,
        'HOCUSPOCUS_E2E_CONFIRM_REAL': 'YES' if args.confirm_real else '',
        'HOCUSPOCUS_E2E_WORKSPACE': prefix,
        'HOCUSPOCUS_E2E_ARTIFACT_DIR': str(attempt),
    })
    if args.browser_executable:
        environment['HOCUSPOCUS_E2E_CHROMIUM_EXECUTABLE'] = args.browser_executable
    command = ['npm', 'run', 'test:e2e:wizard', '--']
    if args.headed:
        command.append('--headed')
    if args.resume:
        command.append('--last-failed')
    print(f'Evidence: {attempt}', flush=True)
    try:
        result = subprocess.run(command, cwd=ROOT / 'ui', env=environment, check=False).returncode
    except KeyboardInterrupt:
        result = 130
    except OSError as exc:
        print(f'Cannot launch browser suite: {exc}', file=sys.stderr)
        result = 2
    record.update({'status': 'passed' if result == 0 else 'interrupted' if result in (130, -2, -15) else 'failed', 'exit_code': result, 'finished_at': datetime.now(timezone.utc).isoformat()})
    latest = json.loads(manifest_path.read_text())
    by_path = {item['path']: item for item in latest['attempts']}
    by_path[record['path']] = record
    latest['attempts'] = sorted(by_path.values(), key=lambda item: item['started_at'])
    manifest_path.write_text(json.dumps(latest, indent=2) + '\n')
    print(f'Review: {build_report(output)}')
    return result


if __name__ == '__main__':
    raise SystemExit(main())
