"""External agents use the app's catalog, collections and LLM implementations."""
from services.wangp_submission import JsonRequest


def application_handlers(api):
    def endpoint(path, method):
        return next(route.endpoint for route in api.routes if getattr(route, 'path', None) == path and method in getattr(route, 'methods', set()))

    assets = endpoint('/api/v1/assets', 'GET')
    asset = endpoint('/api/v1/assets/{asset_id}', 'GET')
    create = endpoint('/api/v1/workspace-collections', 'POST')
    update = endpoint('/api/v1/workspace-collections/{workspace_id}', 'PUT')

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
        for identity in ids:
            asset(identity)  # Resolve exact IDs before modifying the collection.
        body = {key: params[key] for key in ('name', 'description', 'asset_ids', 'expected_revision') if key in params}
        identity = params.get('workspace_id')
        if identity:
            if not isinstance(params.get('expected_revision'), int) or isinstance(params['expected_revision'], bool):
                raise ValueError('Read the collection and provide its expected_revision before updating')
            return await update(identity, JsonRequest(body))
        return await create(JsonRequest(body))

    return {'assets': list_assets, 'collections': endpoint('/api/v1/workspace-collections', 'GET'),
            'organize': organize, 'analyze': endpoint('/api/v1/llm/generate', 'POST')}
