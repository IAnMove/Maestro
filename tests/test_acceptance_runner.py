"""The live runner preserves failures and never turns a resume into a new full run."""
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'


@pytest.fixture
def runner(monkeypatch):
    monkeypatch.syspath_prepend(str(SCRIPTS))
    spec = importlib.util.spec_from_file_location('acceptance_runner_test', SCRIPTS / 'run_wizard_acceptance.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, 'read_json', lambda _: {'execution_mode': 'real'})
    return module


def invoke(monkeypatch, runner, root, *extra):
    monkeypatch.setattr(sys, 'argv', ['runner', '--base-url', 'http://127.0.0.1:42004',
        '--profile', 'real', '--confirm-real', '--scenario', 'app-generate',
        '--output-dir', str(root), *extra])
    return runner.main()


def test_resume_keeps_original_evidence_and_copies_only_failed_ids(monkeypatch, runner, tmp_path):
    calls = []

    def execute(command, *, env, **_):
        attempt = Path(env['HOCUSPOCUS_E2E_ARTIFACT_DIR'])
        last_run = attempt / 'raw' / '.last-run.json'
        if calls:
            assert '--last-failed' in command
            assert json.loads(last_run.read_text())['failedTests'] == ['music-id']
        last_run.parent.mkdir(exist_ok=True)
        last_run.write_text(json.dumps({'status': 'failed', 'failedTests': ['music-id']}))
        (attempt / 'results.json').write_text(json.dumps({'stats': {'expected': int(bool(calls)), 'unexpected': int(not calls)}}))
        calls.append(attempt)
        return SimpleNamespace(returncode=1 if len(calls) == 1 else 0)

    monkeypatch.setattr(runner.subprocess, 'run', execute)
    assert invoke(monkeypatch, runner, tmp_path) == 1
    original = (calls[0] / 'results.json').read_bytes()
    assert invoke(monkeypatch, runner, tmp_path, '--resume') == 0
    manifest = json.loads((tmp_path / 'run.json').read_text())
    assert [attempt['status'] for attempt in manifest['attempts']] == ['failed', 'passed']
    assert calls[0] != calls[1]
    assert (calls[0] / 'results.json').read_bytes() == original
    assert '1 fallan' in (tmp_path / 'index.html').read_text()


@pytest.mark.parametrize('failure,code,status', [(KeyboardInterrupt(), 130, 'interrupted'), (OSError('npm absent'), 2, 'failed')])
def test_launch_interruptions_are_finalized(monkeypatch, runner, tmp_path, failure, code, status):
    def execute(*_, **__):
        raise failure
    monkeypatch.setattr(runner.subprocess, 'run', execute)
    assert invoke(monkeypatch, runner, tmp_path) == code
    record = json.loads((tmp_path / 'run.json').read_text())['attempts'][0]
    assert record['status'] == status
    assert record['finished_at']
    assert 'sin resultado Playwright' in (tmp_path / 'index.html').read_text()


@pytest.mark.parametrize('manifest', ['{incomplete', json.dumps({'attempts': [{'status': 'running'}]})])
def test_invalid_or_running_attempt_is_preserved(monkeypatch, runner, tmp_path, manifest):
    (tmp_path / 'run.json').write_text(manifest)
    monkeypatch.setattr(runner.subprocess, 'run', lambda *_a, **_k: pytest.fail('Must not submit'))
    assert invoke(monkeypatch, runner, tmp_path, '--resume') == 2
    assert (tmp_path / 'run.json').read_text() == manifest


def test_mode_mismatch_does_not_launch(monkeypatch, runner, tmp_path):
    monkeypatch.setattr(runner, 'read_json', lambda _: {'execution_mode': 'simulate'})
    monkeypatch.setattr(runner.subprocess, 'run', lambda *_a, **_k: pytest.fail('Must not submit'))
    assert invoke(monkeypatch, runner, tmp_path) == 2
    assert not (tmp_path / 'run.json').exists()


@pytest.mark.parametrize('last_run', ['{truncated', 'null', '[]', '{}',
    '{"status":"failed","failedTests":[]}', '{"status":"passed","failedTests":["old-id"]}',
    '{"status":"failed","failedTests":[""]}', '{"status":"failed","failedTests":[3]}'])
def test_resume_rejects_missing_or_corrupt_failure_filter_without_running_all_tests(monkeypatch, runner, tmp_path, last_run):
    previous = tmp_path / 'attempt-original'
    (previous / 'raw').mkdir(parents=True)
    state = previous / 'raw' / '.last-run.json'
    state.write_text(last_run)
    manifest = {'profile': 'real', 'attempts': [{'path': str(previous), 'scenario': 'app-generate', 'status': 'failed'}]}
    (tmp_path / 'run.json').write_text(json.dumps(manifest))
    monkeypatch.setattr(runner.subprocess, 'run', lambda *_a, **_k: pytest.fail('Corrupt --last-failed would run every test'))
    assert invoke(monkeypatch, runner, tmp_path, '--resume') == 2
    assert list(tmp_path.glob('attempt-*')) == [previous]
    assert state.read_text() == last_run
    assert json.loads((tmp_path / 'run.json').read_text()) == manifest


def test_portable_report_escapes_content_and_shows_incomplete_evidence(monkeypatch, runner, tmp_path):
    attempt = tmp_path / 'attempt-one'
    attempt.mkdir()
    (tmp_path / 'run.json').write_text(json.dumps({'attempts': [{'path': '/old/computer/attempt-one', 'status': 'interrupted'}]}))
    (attempt / 'results.json').write_text('{truncated')
    (attempt / 'features.json').write_text(json.dumps([{'id': 'image', 'route': ['<script>alert(1)</script>'], 'status': 'failed', 'screenshot': 'one image.png', 'wizard': {'support': 'manual', 'actions': [], 'example': '<img src=x onerror=alert(1)>', 'note': 'a & b'}}]))
    html = runner.build_report(tmp_path).read_text()
    assert '<script>alert(1)</script>' not in html
    assert '&lt;script&gt;' in html and 'one%20image.png' in html
    assert 'interrupted' in html and 'Evidencia incompleta' in html
    assert '/old/computer' not in html
