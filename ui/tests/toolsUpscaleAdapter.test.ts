import assert from 'node:assert/strict'
import test from 'node:test'

const { createToolsAdapter } = await import('../src/features/agent/toolsAdapter.ts')
const { useStore } = await import('../src/stores/useStore.ts')

const originalFetch = globalThis.fetch

function asset() {
  return {
    id: 'asset-race',
    kind: 'image',
    filename: 'source.png',
    size_bytes: 12,
    created_at: 1,
    completed_at: 2,
    metadata_status: 'canonical',
    workspace_ids: ['workspace-a'],
    locations: [{
      workspace_id: 'workspace-a',
      filename: 'source.png',
      url: '/api/v1/file/source.png?workspace=workspace-a',
    }],
    url: '/api/v1/file/source.png?workspace=workspace-a',
    origin: { tool: 'studio' },
    execution: {},
    model: { provider: 'local', id: 'lanczos2' },
    prompt_preview: '',
  }
}

function multiLocationAsset() {
  return {
    ...asset(),
    id: 'asset-multi',
    workspace_ids: ['workspace-a', 'workspace-b'],
    locations: [
      ...asset().locations,
      {
        workspace_id: 'workspace-b',
        filename: 'source.png',
        url: '/api/v1/file/source.png?workspace=workspace-b',
      },
    ],
  }
}

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test('upscale aborts when the active workspace changes during asset resolution', { concurrency: false }, async () => {
  const originalWorkspace = useStore.getState().activeWorkspace
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  let navigateCalls = 0
  globalThis.fetch = async input => {
    assert.match(String(input), /\/api\/v1\/assets\/asset-race$/)
    await held
    return new Response(JSON.stringify(asset()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  useStore.setState({ activeWorkspace: 'workspace-a' })
  const adapter = createToolsAdapter(async () => {
    navigateCalls += 1
    return { message: 'studio', target: { kind: 'tab', id: 'studio', title: 'Studio' } }
  })
  try {
    const pending = adapter.upscale({
      type: 'upscale', assetId: 'asset-race', sourceKind: 'image', method: 'lanczos2', confirm: true,
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    useStore.setState({ activeWorkspace: 'workspace-b' })
    release()
    await assert.rejects(pending, /active workspace changed/i)
    assert.equal(navigateCalls, 0)
  } finally {
    useStore.setState({ activeWorkspace: originalWorkspace })
  }
})

test('upscale rejects an ambiguous asset instead of choosing an arbitrary source location', { concurrency: false }, async () => {
  let navigateCalls = 0
  globalThis.fetch = async input => {
    assert.match(String(input), /\/api\/v1\/assets\/asset-multi$/)
    return new Response(JSON.stringify(multiLocationAsset()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const originalWorkspace = useStore.getState().activeWorkspace
  useStore.setState({ activeWorkspace: 'workspace-c' })
  const adapter = createToolsAdapter(async () => {
    navigateCalls += 1
    return { message: 'studio', target: { kind: 'tab', id: 'studio', title: 'Studio' } }
  })
  try {
    await assert.rejects(
      adapter.upscale({
        type: 'upscale', assetId: 'asset-multi', sourceKind: 'image', method: 'lanczos2', confirm: true,
      }),
      /source workspace/i,
    )
    assert.equal(navigateCalls, 0)
  } finally {
    useStore.setState({ activeWorkspace: originalWorkspace })
  }
})

test('upscale capability preserves an exact source workspace and rejects padded values', { concurrency: false }, async () => {
  const { registerToolCapabilities } = await import('../src/features/agent/toolCapabilities.ts')
  const definitions: Array<{ name: string; resolve: (raw: Record<string, unknown>) => unknown }> = []
  registerToolCapabilities(definition => {
    definitions.push(definition as typeof definitions[number])
    return definition
  })
  const upscale = definitions.find(definition => definition.name === 'upscale')
  assert.ok(upscale)
  assert.deepEqual(upscale.resolve({
    type: 'upscale', asset_id: 'asset-multi', source_workspace: 'workspace-b',
    source_kind: 'image', method: 'lanczos2', confirm: true,
  }), {
    type: 'upscale', assetId: 'asset-multi', source: undefined, sourceWorkspace: 'workspace-b',
    sourceKind: 'image', method: 'lanczos2', confirm: true,
  })
  assert.equal(upscale.resolve({
    type: 'upscale', asset_id: 'asset-multi', source_workspace: ' workspace-b ',
    source_kind: 'image', method: 'lanczos2', confirm: true,
  }), null)
})
