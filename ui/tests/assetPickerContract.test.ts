import assert from 'node:assert/strict'
import test from 'node:test'
import type { AssetCatalogItem } from '../src/api/assets.ts'
import type { ApiOutput } from '../src/api/outputs.ts'
import {
  catalogItemToPickerItem,
  checkCompatibility,
  createCatalogQuerySession,
  isSameRef,
  outputToPickerItem,
  queryAssetCatalog,
  resolveAssetRef,
  type AssetPickerIntent,
} from '../src/features/asset-picker/index.ts'

function catalogItem(overrides: Partial<AssetCatalogItem> & Pick<AssetCatalogItem, 'id' | 'filename'>): AssetCatalogItem {
  return {
    kind: 'image',
    size_bytes: 12,
    created_at: 1_700_000_000,
    completed_at: 1_700_000_100,
    metadata_status: 'canonical',
    workspace_ids: ['default'],
    locations: [{ workspace_id: 'default', filename: overrides.filename, url: `/api/v1/file/${overrides.filename}` }],
    url: `/api/v1/file/${overrides.filename}`,
    origin: { tool: 'studio' },
    execution: {},
    model: {},
    prompt_preview: '',
    ...overrides,
  }
}

test('homonymous files in different workspaces keep distinct refs', () => {
  const alpha = catalogItemToPickerItem(catalogItem({
    id: 'asset_alpha', filename: 'same.png',
    workspace_ids: ['alpha'],
    locations: [{ workspace_id: 'alpha', filename: 'same.png', url: '/api/v1/file/same.png?workspace=alpha' }],
  }), 'alpha')
  const beta = catalogItemToPickerItem(catalogItem({
    id: 'asset_beta', filename: 'same.png',
    workspace_ids: ['beta'],
    locations: [{ workspace_id: 'beta', filename: 'same.png', url: '/api/v1/file/same.png?workspace=beta' }],
  }), 'beta')
  assert.equal(alpha.filename, beta.filename)
  assert.equal(isSameRef(alpha.ref, beta.ref), false)
  assert.equal(alpha.ref.scheme, 'catalog')
  if (alpha.ref.scheme === 'catalog' && beta.ref.scheme === 'catalog') {
    assert.notEqual(alpha.ref.id, beta.ref.id)
  }
})

test('missing created_at becomes unknown date, not completed_at', async () => {
  const { formatCreatedDate, formatUnknownDate } = await import('../src/features/asset-picker/titles.ts')
  const item = catalogItemToPickerItem(catalogItem({
    id: 'asset_old', filename: 'old.png', created_at: 0, completed_at: 9_999,
  }), 'default')
  assert.equal(item.createdAt, null)
  assert.equal(formatCreatedDate(item.createdAt), formatUnknownDate())
  assert.match(item.title, /Unknown date/)
})

test('legacy outputs do not invent catalog ids', () => {
  const output: ApiOutput = {
    name: 'hero.glb', type: 'model3d', mode: null, size: 4, created_at: 12,
    url: '/api/v1/file/hero.glb', thumbnail_url: '/api/v1/file/hero.png',
  }
  const item = outputToPickerItem(output, 'film')
  assert.equal(item.ref.scheme, 'legacy-output')
  if (item.ref.scheme === 'legacy-output') {
    assert.equal(item.ref.filename, 'hero.glb')
    assert.equal(item.ref.workspaceId, 'film')
  }
  assert.equal(item.kind, 'model3d')
})

test('cancel, clear and confirm are distinct intents', () => {
  const cancel: AssetPickerIntent = { type: 'cancel' }
  const clear: AssetPickerIntent = { type: 'clear' }
  const confirm: AssetPickerIntent = { type: 'confirm', items: [] }
  assert.notEqual(cancel.type, clear.type)
  assert.notEqual(clear.type, confirm.type)
})

test('constraints reject incompatible kinds and overflow', () => {
  const item = catalogItemToPickerItem(catalogItem({ id: 'a', filename: 'a.png' }), 'default')
  assert.equal(checkCompatibility(item, { kinds: ['audio'], maxCount: 1, optional: true }, 0).allowed, false)
  assert.equal(checkCompatibility(item, { kinds: ['image'], maxCount: 1, optional: false }, 1).allowed, false)
  assert.equal(checkCompatibility(item, { kinds: ['image'], maxCount: 1, optional: false }, 0).allowed, true)
})

test('query session ignores an out-of-order response', async () => {
  const originalFetch = globalThis.fetch
  let resolveFirst: ((value: Response) => void) | undefined
  const first = new Promise<Response>(resolve => { resolveFirst = resolve })
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    if (calls === 1) return first
    return new Response(JSON.stringify({
      total: 1,
      assets: [catalogItem({ id: 'second', filename: 'second.png' })],
    }))
  }) as typeof fetch
  try {
    const session = createCatalogQuerySession()
    const pending = session.run({ workspace: 'default' })
    const latest = session.run({ workspace: 'default' })
    resolveFirst?.(new Response(JSON.stringify({
      total: 1,
      assets: [catalogItem({ id: 'first', filename: 'first.png' })],
    })))
    const stale = await pending
    const fresh = await latest
    assert.equal(stale.stale, true)
    assert.equal(fresh.stale, false)
    assert.equal(fresh.items[0]?.filename, 'second.png')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('resolveAssetRef reports 404 for an unknown catalog id', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('missing', { status: 404 })) as typeof fetch
  try {
    await assert.rejects(
      () => resolveAssetRef({ version: 1, scheme: 'catalog', id: 'nope', workspaceId: 'default', filename: 'nope.png' }),
      (error: unknown) => error instanceof Error
        && error.message === 'Asset not found'
        && (error as Error & { status?: number }).status === 404,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('legacy resolve keeps homonyms distinct by workspace', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    total: 2,
    assets: [
      catalogItem({
        id: 'asset_alpha', filename: 'same.png', workspace_ids: ['alpha'],
        locations: [{ workspace_id: 'alpha', filename: 'same.png', url: '/a' }],
      }),
      catalogItem({
        id: 'asset_beta', filename: 'same.png', workspace_ids: ['beta'],
        locations: [{ workspace_id: 'beta', filename: 'same.png', url: '/b' }],
      }),
    ],
  }))) as typeof fetch
  try {
    const match = await resolveAssetRef({
      version: 1, scheme: 'legacy-output', workspaceId: 'beta', filename: 'same.png', outputType: 'image',
    })
    assert.equal(match.id, 'asset_beta')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('picker catalog queries default to created_desc and 24 items', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    calls.push(String(url))
    return new Response(JSON.stringify({ total: 0, assets: [] }))
  }) as typeof fetch
  try {
    await queryAssetCatalog({ workspace: 'default' })
    const url = new URL(calls[0], 'http://localhost')
    assert.equal(url.searchParams.get('sort'), 'created_desc')
    assert.equal(url.searchParams.get('limit'), '24')
    assert.equal(url.searchParams.get('workspace'), 'default')
  } finally {
    globalThis.fetch = originalFetch
  }
})
