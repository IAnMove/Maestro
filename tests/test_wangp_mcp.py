"""Transport retries must reuse queue admission, including across a restart."""
import asyncio

import pytest
from routers.wangp_mcp import RequestJournal, create_wangp_mcp_router


class Request:
    headers = {'authorization': 'Bearer test-token'}
    url = type('URL', (), {'scheme': 'http', 'netloc': 'localhost:42000'})()
    def __init__(self, value): self.value = value
    async def json(self): return self.value


def endpoint(path, handler):
    router = create_wangp_mcp_router(handlers={'generate': handler}, journal_path=path, token_getter=lambda: 'test-token')
    return next(route.endpoint for route in router.routes if route.path.endswith('/mcp') and 'POST' in route.methods)


def test_duplicate_rpc_after_restart_is_one_job(tmp_path):
    calls = []
    async def submit(request):
        calls.append(await request.json())
        return {'job_id': 'canonical-1', 'status': 'queued'}
    path = tmp_path / 'journal.db'
    message = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': 'generate', 'arguments': {'request_id': 'edit-1', 'params': {'model_type': 'sensenova_u1_5_8b_mot', 'prompt': 'Write exactly "mañana"'}}}}
    first = asyncio.run(endpoint(path, submit)(Request(message)))
    second = asyncio.run(endpoint(path, submit)(Request(message)))
    assert first.body == second.body
    assert len(calls) == 1
    assert calls[0]['prompt'] == 'Write exactly "mañana"'
    assert calls[0]['provenance']['command']['command_id'] == 'edit-1'


def test_uncertain_admission_cannot_be_replayed(tmp_path):
    journal = RequestJournal(tmp_path / 'journal.db')
    assert journal.reserve('a', 'payload-1') is None
    with pytest.raises(ValueError, match='already reserved'):
        RequestJournal(journal.path).reserve('a', 'payload-1')
    with pytest.raises(ValueError, match='different parameters'):
        journal.reserve('a', 'payload-2')


def test_notifications_acknowledged_and_cross_origin_rejected(tmp_path):
    post = endpoint(tmp_path / 'journal.db', lambda _: {})
    request = Request({'jsonrpc': '2.0', 'method': 'notifications/initialized'})
    assert asyncio.run(post(request)).status_code == 202
    request.headers = {'authorization': 'Bearer test-token', 'origin': 'https://foreign.invalid'}
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as caught:
        asyncio.run(post(request))
    assert caught.value.status_code == 403


def test_external_provenance_survives_normalization_and_preserves_context(tmp_path):
    from services.generation_provenance import normalize_submission_provenance
    calls = []
    async def submit(request):
        body = await request.json()
        calls.append(normalize_submission_provenance(body['provenance'], trusted_tool=request.trusted_tool))
        return {'job_id': 'task-a'}
    message = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': 'generate', 'arguments': {'request_id': 'a', 'params': {'provenance': {'workspace_id': 'collection-a', 'project_id': 'project-a', 'command': {'run_id': 'run-a', 'job_id': 'spoof'}}}}}}
    asyncio.run(endpoint(tmp_path / 'journal.db', submit)(Request(message)))
    assert calls == [{'actor': 'user', 'tool': 'external_agent', 'capability': 'generate', 'workspace_id': 'collection-a', 'project_id': 'project-a', 'command': {'command_id': 'a', 'run_id': 'run-a'}}]
    assert normalize_submission_provenance({'tool': 'external_agent'})['tool'] == 'studio'


def test_mcp_is_reachable_before_spa_mount(tmp_path):
    from fastapi import FastAPI
    from fastapi.staticfiles import StaticFiles
    from fastapi.testclient import TestClient
    app = FastAPI()
    app.include_router(create_wangp_mcp_router(handlers={}, journal_path=tmp_path / 'requests.db', token_getter=lambda: 'test-token'))
    app.mount('/', StaticFiles(directory=tmp_path), name='spa')
    with TestClient(app) as client:
        response = client.post('/api/v1/wangp/mcp', headers={'Authorization': 'Bearer test-token'}, json={'jsonrpc': '2.0', 'id': 1, 'method': 'initialize'})
        assert response.status_code == 200
        assert response.json()['result']['protocolVersion'] == '2025-03-26'
