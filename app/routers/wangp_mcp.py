"""Opt-in MCP access to the existing Hocuspocus generation endpoints.

The request journal prevents transport retries from creating duplicate jobs. It
never executes, schedules, cancels or stores progress for canonical tasks.
"""
from __future__ import annotations

import hashlib
import inspect
import json
import os
from pathlib import Path
import secrets
import sqlite3

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from services.wangp_submission import JsonRequest

PROTOCOL = '2025-03-26'
MUTATIONS = {'generate', 'recast', 'upscale', 'organize'}
REQUEST_TOOLS = MUTATIONS | {'analyze'}


def tool_definitions():
    tools = []
    for name, description in [
        ('models', 'Discover exact model identifiers and capabilities.'),
        ('processors', 'Discover available postprocessors and hardware restrictions.'),
        ('status', 'Read the canonical status of a previously submitted job.'),
        ('assets', 'Find existing canonical media IDs and URLs. Paginate with limit and offset; never invent filenames.'),
        ('collections', 'Read existing Workspace collections and their revisions.'),
        ('organize', 'Group exact asset_ids in a Workspace collection without moving files. Create with name, or update exact workspace_id with expected_revision. Supplied asset_ids replace collection membership.'),
        ('analyze', 'Analyze up to four images or one video with the selected vision LLM. params: prompt, workspace, media=[{source: canonical URL, kind: image|video}]. Video uses 8 sampled frames and no audio. Returns text and evidence, not a generation job.'),
        ('generate', 'Submit one image/video generation to Hocuspocus. Preserve literal prompts. Returns a job ID, not a finished artifact.'),
        ('recast', 'Submit Viggle character replacement: model_type=viggle_animate, video_path and ref_image_path (an edited frame of that video).'),
        ('upscale', 'Process an existing image/video using the shared Tools queue: face refinement, DLSS, RIFE or existing upscalers.'),
    ]:
        properties, required = {}, []
        if name in REQUEST_TOOLS:
            properties = {'request_id': {'type': 'string', 'minLength': 1, 'maxLength': 160},
                          'params': {'type': 'object', 'description': 'Parameters accepted by the corresponding /api/v1 endpoint, including workspace.'}}
            required = ['request_id', 'params']
        elif name == 'status':
            properties = {'job_id': {'type': 'string', 'minLength': 1}}
            required = ['job_id']
        elif name == 'assets':
            properties = {key: {'type': 'string'} for key in ('search', 'kind', 'workspace')}
            properties.update(limit={'type': 'integer', 'minimum': 1, 'maximum': 500}, offset={'type': 'integer', 'minimum': 0})
        elif name == 'models':
            properties = {'model_type': {'type': 'string', 'description': 'Optional exact ID to get input/options instead of the catalog.'}}
        tools.append({'name': name, 'description': description,
                      'inputSchema': {'type': 'object', 'properties': properties, 'required': required, 'additionalProperties': False},
                      'annotations': {'readOnlyHint': name not in MUTATIONS, 'destructiveHint': False, 'idempotentHint': True}})
    return tools


class RequestJournal:
    def __init__(self, path):
        self.path = Path(path)

    def reserve(self, request_id, digest):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.path, timeout=15) as db:
            db.execute('CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT)')
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT digest, result FROM requests WHERE id=?', (request_id,)).fetchone()
            if row:
                if row[0] != digest:
                    raise ValueError('request_id was already used with different parameters')
                if row[1] is None:
                    raise ValueError('Submission already reserved. Inspect Activity; do not resubmit with another request_id after an uncertain response.')
                return json.loads(row[1])
            db.execute('INSERT INTO requests VALUES (?, ?, NULL)', (request_id, digest))
        return None

    def finish(self, request_id, result):
        with sqlite3.connect(self.path, timeout=15) as db:
            db.execute('UPDATE requests SET result=? WHERE id=?', (json.dumps(result), request_id))


def _request_arguments(name, arguments):
    request_id, params = arguments.get('request_id'), arguments.get('params')
    if not isinstance(request_id, str) or not 1 <= len(request_id) <= 160 or not isinstance(params, dict):
        raise ValueError('request_id and params are required')
    if name == 'recast' and params.get('model_type') != 'viggle_animate':
        raise ValueError('MCP recast requires model_type=viggle_animate')
    digest = hashlib.sha256(json.dumps([name, params], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return request_id, params, digest


def create_wangp_mcp_router(*, handlers, journal_path, token_getter=None):
    router = APIRouter()
    journal = RequestJournal(journal_path)
    token_getter = token_getter or (lambda: os.environ.get('HOCUS_MCP_TOKEN', ''))

    async def call_tool(name, arguments):
        if name not in handlers or not isinstance(arguments, dict):
            raise ValueError('Unknown tool or invalid arguments')
        if name in REQUEST_TOOLS:
            request_id, params, digest = _request_arguments(name, arguments)
            existing = journal.reserve(request_id, digest)
            if existing is not None:
                return existing
            params = dict(params)
            from services.generation_provenance import normalize_submission_provenance
            provenance = normalize_submission_provenance(params.get('provenance'), trusted_tool='external_agent')
            provenance.update(actor='user', capability=name)
            provenance['command']['command_id'] = request_id
            params['provenance'] = provenance
            try:
                result = handlers[name](JsonRequest(params, trusted_tool='external_agent'))
                if inspect.isawaitable(result):
                    result = await result
            except HTTPException as error:
                result = {'error': error.detail, 'status_code': error.status_code}
            # Unexpected failures deliberately retain the reservation. A queue
            # admission could have succeeded before its response was lost.
            journal.finish(request_id, result)
            return result
        if name == 'status':
            result = handlers[name](arguments['job_id'])
        elif name in {'assets', 'models'}:
            result = handlers[name](arguments)
        else:
            result = handlers[name]()
        return await result if inspect.isawaitable(result) else result

    async def dispatch(message):
        if not isinstance(message, dict) or message.get('jsonrpc') != '2.0':
            return {'jsonrpc': '2.0', 'id': None, 'error': {'code': -32600, 'message': 'Invalid request'}}
        if 'id' not in message:
            return None
        request_id, method = message['id'], message.get('method')
        try:
            if method == 'initialize':
                result = {'protocolVersion': PROTOCOL, 'capabilities': {'tools': {}},
                          'serverInfo': {'name': 'hocuspocus', 'version': '1'},
                          'instructions': 'One queue: keep returned job IDs and poll status. Reuse request_id on retries; never assume generated quality from submission success.'}
            elif method == 'ping':
                result = {}
            elif method == 'tools/list':
                result = {'tools': tool_definitions()}
            elif method == 'tools/call':
                params = message.get('params') or {}
                value = await call_tool(params.get('name'), params.get('arguments') or {})
                result = {'content': [{'type': 'text', 'text': json.dumps(value, ensure_ascii=False)}], 'isError': isinstance(value, dict) and 'error' in value}
            else:
                return {'jsonrpc': '2.0', 'id': request_id, 'error': {'code': -32601, 'message': 'Method not found'}}
            return {'jsonrpc': '2.0', 'id': request_id, 'result': result}
        except (ValueError, KeyError, TypeError, HTTPException) as error:
            detail = error.detail if isinstance(error, HTTPException) else str(error)
            return {'jsonrpc': '2.0', 'id': request_id, 'result': {'isError': True, 'content': [{'type': 'text', 'text': str(detail)}]}}

    @router.post('/api/v1/wangp/mcp')
    async def mcp(request: Request):
        token = token_getter()
        if not token:
            raise HTTPException(503, 'External agent access is disabled; configure HOCUS_MCP_TOKEN')
        if not secrets.compare_digest(request.headers.get('authorization', ''), f'Bearer {token}'):
            raise HTTPException(401, 'Invalid MCP credentials')
        origin = request.headers.get('origin')
        if origin and origin != f'{request.url.scheme}://{request.url.netloc}':
            raise HTTPException(403, 'Origin is not permitted')
        try:
            payload = await request.json()
        except ValueError:
            return JSONResponse({'jsonrpc': '2.0', 'id': None, 'error': {'code': -32700, 'message': 'Parse error'}}, status_code=400)
        messages = payload if isinstance(payload, list) else [payload]
        if not 1 <= len(messages) <= 32:
            raise HTTPException(400, 'Invalid batch size')
        results = [result for message in messages if (result := await dispatch(message)) is not None]
        if not results:
            return Response(status_code=202)
        return JSONResponse(results if isinstance(payload, list) else results[0])

    @router.get('/api/v1/wangp/mcp')
    async def no_stream():
        return Response(status_code=405, headers={'Allow': 'POST'})

    return router
