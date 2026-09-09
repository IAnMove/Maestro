"""External agents use the app's catalog, collections and LLM implementations."""
from services.wangp_submission import JsonRequest


def _mounted_routes(router):
    # FastAPI 0.140 retains included routers instead of flattening api.routes.
    for route in router.routes:
        included = getattr(route, 'original_router', None)
        if included is not None:
            yield from _mounted_routes(included)
        else:
            yield route


def application_handlers(api):
    def endpoint(path, method):
        return next(route.endpoint for route in _mounted_routes(api) if getattr(route, 'path', None) == path and method in getattr(route, 'methods', set()))

    assets = endpoint('/api/v1/assets', 'GET')
    asset = endpoint('/api/v1/assets/{asset_id}', 'GET')
    create = endpoint('/api/v1/workspace-collections', 'POST')
    update = endpoint('/api/v1/workspace-collections/{workspace_id}', 'PUT')
    try:
        command = endpoint('/api/v1/commands', 'POST')
    except StopIteration:
        command = None

    async def submit_command(value):
        request = JsonRequest(value, trusted_tool='external_agent')
        request.app = api  # The HTTP route can resolve canonical references in minimal embeddings too.
        return await command(request)

    def list_assets(arguments):
        limit, offset = int(arguments.get('limit', 100)), int(arguments.get('offset', 0))
        if not 1 <= limit <= 500 or offset < 0:
            raise ValueError('Catalog pagination requires limit 1..500 and offset >= 0')
        return assets(search=arguments.get('search', ''), kind=arguments.get('kind', ''),
                      workspace=arguments.get('workspace', ''), collection='', sort='', limit=limit, offset=offset)

    async def organize(request):
        params = await request.json()
        ids = params.get('asset_ids')
        if not isinstance(ids, list) or not ids or len(ids) != len(set(ids)):
            raise ValueError('Provide a nonempty list of unique canonical asset_ids')
        body = {key: params[key] for key in ('name', 'description', 'asset_ids', 'expected_revision') if key in params}
        identity = params.get('workspace_id')
        if identity:
            if not isinstance(params.get('expected_revision'), int) or isinstance(params['expected_revision'], bool):
                raise ValueError('Read the collection and provide its expected_revision before updating')
        provenance = params.get('provenance') or {}
        intent_id = (provenance.get('command') or {}).get('command_id')
        if command is not None and getattr(request, 'trusted_tool', None) == 'external_agent' and intent_id:
            if identity:
                body['workspace_id'] = identity
            receipt = await submit_command({
                'version': 1, 'operation': 'collections.update' if identity else 'collections.create',
                'intent_id': intent_id, 'input': body,
            })
            return receipt['result']  # Preserve the legacy organize response shape.
        for asset_id in ids:
            asset(asset_id)  # Older embeddings still resolve exact IDs before mutation.
        if identity:
            return await update(identity, JsonRequest(body))
        return await create(JsonRequest(body))

    handlers = {'assets': list_assets, 'collections': endpoint('/api/v1/workspace-collections', 'GET'),
                'organize': organize, 'analyze': endpoint('/api/v1/llm/generate', 'POST')}
    # New versioned operations bypass the legacy transport journal: effects and
    # receipts are committed together by the existing WorkspaceRegistry.
    from services.workspace_commands import OPERATIONS
    if command is None:
        # Older/minimal embeddings keep the original ten-tool surface.
        return handlers

    def adapt_command(operation):
        async def invoke(arguments):
            if 'operation' in arguments:
                raise ValueError('The MCP tool name identifies the operation')
            return await submit_command({**arguments, 'operation': operation})
        return invoke

    handlers.update({name: adapt_command(name) for name in OPERATIONS})
    return handlers
