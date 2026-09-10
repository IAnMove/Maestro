"""Ensure repeated benchmark monitoring never submits duplicate GPU jobs."""
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('h3_benchmark_client', Path(__file__).resolve().parents[1] / 'app/scripts/benchmark_h3.py')
client = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(client)


def test_existing_result_keeps_original_measurement(tmp_path):
    row = client.matrix()[0]
    folder = tmp_path / row['id']
    folder.mkdir()
    expected = {'result': {'status': 'completed'}, 'memory': {'samples': 43}}
    (folder / 'result.json').write_text(json.dumps(expected))
    with patch.object(client, 'request', side_effect=AssertionError('must not submit')):
        assert client.run_row('unused', tmp_path, row, server_pid=99999999) == expected


def test_reattach_uses_recorded_job(tmp_path):
    row = client.matrix()[0]
    folder = tmp_path / row['id']
    folder.mkdir()
    active = {'job_id': 'still-running', 'started_at': 10}
    (folder / 'active.json').write_text(json.dumps(active))
    with patch.object(client, 'request', side_effect=AssertionError('must not submit')), patch.object(client, 'monitor_job', return_value={'reattached': True}) as monitor:
        assert client.run_row('unused', tmp_path, row) == {'reattached': True}
    monitor.assert_called_once_with('unused', folder, row, active)


def test_impossible_process_aggregate_is_not_a_ram_requirement(tmp_path):
    import threading
    from types import SimpleNamespace
    spec = importlib.util.spec_from_file_location('h3_memory', Path(__file__).resolve().parents[1] / 'app/scripts/benchmark_h3_memory.py')
    memory = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(memory)
    sampler = memory.MemorySampler.__new__(memory.MemorySampler)
    sampler.stop_event = threading.Event()
    sampler.thread = SimpleNamespace(join=lambda **kwargs: None)
    sampler.process = SimpleNamespace(pid=123)
    sampler.psutil = SimpleNamespace(virtual_memory=lambda: SimpleNamespace(total=1024))
    sampler.folder = tmp_path
    sampler.samples, sampler.server_samples = 10, 4
    sampler.errors = []
    sampler.peaks = {'process_pss_bytes': 2048, 'server_pss_bytes': 512,
                     'system_ram_unavailable_bytes': 800}
    result = sampler.finish()
    assert result['invalid_peak_fields'] == ['process_pss_bytes']
    assert result['peak_bytes']['process_pss_bytes'] == 2048  # preserve evidence
    assert result['server_metrics_partial'] is True
    assert result['errors']
