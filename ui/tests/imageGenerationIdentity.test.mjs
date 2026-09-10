import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

function createDom() {
  const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.localStorage = dom.window.localStorage
  globalThis.Event = dom.window.Event
  globalThis.CustomEvent = dom.window.CustomEvent
  window.matchMedia = () => ({ matches: false })
  // The production polling delay is intentionally bypassed in these unit tests.
  dom.window.setTimeout = callback => { callback(); return 0 }
  return dom
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function assertWorkspaceUrl(value, pathname, workspace) {
  const url = new URL(value, 'http://localhost')
  assert.equal(url.pathname, pathname)
  assert.equal(url.searchParams.get('workspace'), workspace)
}

test('MiniMax recovery fetches the saved terminal job and preserves all task identities', async () => {
  const dom = createDom()
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), method: init.method || 'GET' })
    if (String(input).includes('/jobs/saved-job')) {
      return new Response(JSON.stringify({
        jobId: 'saved-job', status: 'completed', workspace: 'story references',
        phase: 'complete', message: 'Ready', current: 1, total: 1, progress: 1,
        taskId: 'task-from-job', rootTaskId: 'root-from-job',
        result: { asset: { id: 'asset-1', name: 'saved.webp', kind: 'local', source: '/api/v1/file/saved.webp', thumbnail: '/api/v1/file/saved.webp', metadata: {
          jobId: 'old-job', taskId: 'old-task', rootTaskId: 'old-root',
        } } },
      }), { headers: { 'content-type': 'application/json' } })
    }
    throw new Error(`unexpected request: ${String(input)}`)
  }
  try {
    const { generateImageAsset } = await import('../src/lib/imageGeneration.ts')

    const asset = await generateImageAsset('minimax', 'A rainy cyclist', undefined, undefined, '', {
      existingJobId: 'saved-job',
    })

    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, 'GET')
    assert.match(calls[0].url, /\/jobs\/saved-job$/)
    assertWorkspaceUrl(asset.source, '/api/v1/file/saved.webp', 'story references')
    assertWorkspaceUrl(asset.thumbnail, '/api/v1/file/saved.webp', 'story references')
    assert.deepEqual(asset.metadata, {
      jobId: 'saved-job', taskId: 'task-from-job', rootTaskId: 'root-from-job',
    })
  } finally {
    globalThis.fetch = originalFetch
    dom.window.close()
  }
})

test('MiniMax strips a same-workspace file query for legacy reference servers and scopes distinct outputs', async () => {
  const dom = createDom()
  const { generateImageAsset } = await import('../src/lib/imageGeneration.ts')
  const { useStore } = await import('../src/stores/useStore.ts')
  const originalFetch = globalThis.fetch
  const previousWorkspace = useStore.getState().activeWorkspace
  const calls = []
  useStore.setState({ activeWorkspace: 'story references' })
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init })
    return jsonResponse({
      jobId: 'new-job', status: 'completed', workspace: 'story references',
      phase: 'complete', message: 'Ready', current: 1, total: 1, progress: 1,
      result: { asset: {
        id: 'asset-new', name: 'output.webp', kind: 'minimax',
        source: '/api/v1/file/output.webp',
        thumbnail: '/api/v1/file/output-thumb.webp',
      } },
    })
  }
  try {
    const asset = await generateImageAsset(
      'minimax',
      'A rainy cyclist',
      undefined,
      '/api/v1/file/reference.png?workspace=story%20references',
    )
    assert.equal(calls.length, 1)
    const body = JSON.parse(String(calls[0].init.body))
    assert.equal(body.subject_reference, '/api/v1/file/reference.png')
    assert.equal(body.workspace, 'story references')
    assertWorkspaceUrl(asset.source, '/api/v1/file/output.webp', 'story references')
    assertWorkspaceUrl(asset.thumbnail, '/api/v1/file/output-thumb.webp', 'story references')
  } finally {
    globalThis.fetch = originalFetch
    useStore.setState({ activeWorkspace: previousWorkspace })
    dom.window.close()
  }
})

test('MiniMax rejects a cross-workspace identity reference before creating a provider job', async () => {
  const dom = createDom()
  const { generateImageAsset } = await import('../src/lib/imageGeneration.ts')
  const { useStore } = await import('../src/stores/useStore.ts')
  const originalFetch = globalThis.fetch
  const previousWorkspace = useStore.getState().activeWorkspace
  const calls = []
  useStore.setState({ activeWorkspace: 'story references' })
  globalThis.fetch = async (...args) => {
    calls.push(args)
    throw new Error('provider must not be called')
  }
  try {
    await assert.rejects(
      generateImageAsset(
        'minimax',
        'A rainy cyclist',
        undefined,
        '/api/v1/file/reference.png?workspace=other-story',
      ),
      /must belong to the requested workspace/,
    )
    assert.equal(calls.length, 0)
  } finally {
    globalThis.fetch = originalFetch
    useStore.setState({ activeWorkspace: previousWorkspace })
    dom.window.close()
  }
})

test('MiniMax keeps the captured workspace when the active UI workspace changes during polling', async () => {
  const dom = createDom()
  const { generateImageAsset } = await import('../src/lib/imageGeneration.ts')
  const { useStore } = await import('../src/stores/useStore.ts')
  const originalFetch = globalThis.fetch
  const previousWorkspace = useStore.getState().activeWorkspace
  const calls = []
  useStore.setState({ activeWorkspace: 'story references' })
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input)
    calls.push({ url, init })
    if (init.method === 'POST') {
      useStore.setState({ activeWorkspace: 'other-story' })
      return jsonResponse({
        jobId: 'switch-job', status: 'running', workspace: 'story references',
        phase: 'running', message: 'Working', current: 0, total: 1, progress: 0,
      })
    }
    if (url.endsWith('/jobs/switch-job')) {
      return jsonResponse({
        jobId: 'switch-job', status: 'completed',
        phase: 'complete', message: 'Ready', current: 1, total: 1, progress: 1,
        // A legacy status response may omit workspace; requestedWorkspace is the
        // only safe fallback captured before the asynchronous provider call.
        result: { asset: {
          id: 'asset-switch', name: 'switch.webp', kind: 'minimax',
          source: '/api/v1/file/switch.webp',
          thumbnail: '/api/v1/file/switch-thumb.webp',
        } },
      })
    }
    throw new Error(`unexpected request: ${url}`)
  }
  try {
    const asset = await generateImageAsset('minimax', 'A rainy cyclist')
    const post = calls.find(call => call.init.method === 'POST')
    assert.ok(post)
    assert.equal(JSON.parse(String(post.init.body)).workspace, 'story references')
    assert.equal(useStore.getState().activeWorkspace, 'other-story')
    assertWorkspaceUrl(asset.source, '/api/v1/file/switch.webp', 'story references')
    assertWorkspaceUrl(asset.thumbnail, '/api/v1/file/switch-thumb.webp', 'story references')
  } finally {
    globalThis.fetch = originalFetch
    useStore.setState({ activeWorkspace: previousWorkspace })
    dom.window.close()
  }
})
