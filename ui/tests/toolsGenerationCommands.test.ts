import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  localStorage: dom.window.localStorage,
})

const {
  ToolsUpscaleGenerationCommandError,
  fetchToolsUpscaleGenerationCommandReceipt,
  pendingToolsUpscaleGenerationCommands,
  submitToolsUpscaleGenerationCommand,
} = await import('../src/api/toolsGenerationCommands.ts')
const {
  canonicalToolsSource,
  createStudioToolsUpscaleGenerationCommand,
} = await import('../src/features/studio/toolsGenerationSpec.ts')

const originalFetch = globalThis.fetch

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function params(): Record<string, unknown> {
  return {
    workspace: 'tools-test',
    source: '/api/v1/file/source.png?workspace=tools-test',
    source_kind: 'image',
    method: 'lanczos2',
    seed: 17,
    wangp_processor_settings: {
      spatial_upsampler_strength: 0.7,
      spatial_upsampler_face_count: 2,
    },
  }
}

function command(intentId: string) {
  return createStudioToolsUpscaleGenerationCommand(params(), intentId)
}

function queuedReceipt(value: { intent_id: string; operation: string; input: { workspace: string } }) {
  return {
    version: 1,
    commandId: value.intent_id,
    operation: value.operation,
    status: 'queued',
    entities: [],
    artifacts: [],
    taskIds: ['task-' + value.intent_id],
    pipelineIds: [],
    result: {
      job_id: 'job-' + value.intent_id,
      task_id: 'task-' + value.intent_id,
      workspace: value.input.workspace,
      status: 'queued',
    },
    commandVersion: 2,
    fingerprintVersion: 2,
    contentFingerprint: 'b'.repeat(64),
  }
}

test.afterEach(() => {
  dom.window.localStorage.clear()
  globalThis.fetch = originalFetch
})

test('Tools builder freezes typed params, preserves collection identity, and strips authority metadata', { concurrency: false }, () => {
  const source = params()
  source.provenance = { actor: 'wizard', workspace_id: 'tools-collection', command: { command_id: 'spoofed' } }
  source.runtime = { workspace: 'other-workspace' }
  const value = createStudioToolsUpscaleGenerationCommand(source, 'tools-freeze')

  assert.equal(value.version, 2)
  assert.equal(value.operation, 'tools.upscale')
  assert.equal(value.intent_id, 'tools-freeze')
  assert.equal(value.input.workspace, 'tools-test')
  assert.equal(value.input.workspace_collection_id, 'tools-collection')
  assert.equal('workspace' in value.input.params, false)
  assert.equal('provenance' in value.input.params, false)
  assert.equal('runtime' in value.input.params, false)
  assert.deepEqual(value.input.params.wangp_processor_settings, source.wangp_processor_settings)

  source.source = 'mutated.png'
  ;(source.wangp_processor_settings as Record<string, unknown>).spatial_upsampler_face_count = 5
  assert.equal(value.input.params.source, '/api/v1/file/source.png?workspace=tools-test')
  assert.equal(
    (value.input.params.wangp_processor_settings as Record<string, unknown>).spatial_upsampler_face_count,
    2,
  )
})

test('Tools source projection creates canonical workspace URLs and preserves asset IDs', { concurrency: false }, () => {
  assert.equal(
    canonicalToolsSource('nested/hero image.png', undefined, 'source-workspace', 'tools-test'),
    '/api/v1/file/nested/hero%20image.png?workspace=source-workspace',
  )
  assert.equal(
    canonicalToolsSource('hero.png', undefined, '__uploads__', 'tools-test'),
    '/api/v1/uploads/hero.png',
  )
  assert.equal(canonicalToolsSource('asset-hero', undefined, undefined, 'tools-test'), 'asset-hero')
  assert.equal(
    canonicalToolsSource('ignored-name', '/api/v1/file/exact.png?workspace=tools-test', undefined, 'tools-test'),
    '/api/v1/file/exact.png?workspace=tools-test',
  )
})

test('Tools builder preserves an asset source workspace as part of the frozen lineage', { concurrency: false }, () => {
  const value = params()
  value.source = 'asset-hero'
  value.source_workspace = '__uploads__'
  const command = createStudioToolsUpscaleGenerationCommand(value, 'tools-source-workspace')
  assert.equal(command.input.params.source, 'asset-hero')
  assert.equal(command.input.params.source_workspace, '__uploads__')
})

test('Tools builder rejects unknown, non-canonical, unsafe, and mismatched values', { concurrency: false }, () => {
  for (const field of ['guidance_scal', 'provenance_typo']) {
    const value = params()
    value[field] = undefined
    assert.throws(
      () => createStudioToolsUpscaleGenerationCommand(value, 'tools-' + field),
      /is not supported by tools\.upscale/,
      field,
    )
  }
  for (const source of [
    'https://example.invalid/source.png',
    '/tmp/source.png',
    '/api/v1/file/source.png',
    '/api/v1/file/source.png?workspace=tools-test&workspace=other',
    '/api/v1/file/a/../source.png?workspace=tools-test',
    '/api/v1/file/a/%2E%2E/source.png?workspace=tools-test',
  ]) {
    const value = params()
    value.source = source
    assert.throws(
      () => createStudioToolsUpscaleGenerationCommand(value, 'tools-source'),
      /canonical local URL or asset ID|canonical local reference|requires one workspace query|identify one exact local asset/,
      source,
    )
  }
  const wrongKind = params()
  wrongKind.source_kind = 'audio'
  assert.throws(() => createStudioToolsUpscaleGenerationCommand(wrongKind, 'tools-kind'), /source_kind/)
  const mismatchedWorkspace = params()
  mismatchedWorkspace.source_workspace = 'other-workspace'
  assert.throws(
    () => createStudioToolsUpscaleGenerationCommand(mismatchedWorkspace, 'tools-source-workspace-mismatch'),
    /source_workspace/,
  )
  const wrongMethod = params()
  wrongMethod.method = 'unknown-upscaler'
  assert.throws(() => createStudioToolsUpscaleGenerationCommand(wrongMethod, 'tools-method'), /method/)
  const injected = params()
  injected.input = { workspace: 'spoofed' }
  assert.throws(() => createStudioToolsUpscaleGenerationCommand(injected, 'tools-injected'), /envelope field input/)
})

test('Tools submission persists the exact snapshot before POST and validates its v2 receipt', { concurrency: false }, async () => {
  const value = command('tools-submit')
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    assert.deepEqual(pendingToolsUpscaleGenerationCommands('tools-test'), [value])
    return response(queuedReceipt(value))
  }
  let sawPending = false
  const receipt = await submitToolsUpscaleGenerationCommand(value, {
    submissionContext: { actor: 'wizard', workflowId: 'tools-workflow', runId: 'tools-run' },
    onSnapshotReady: snapshot => {
      sawPending = pendingToolsUpscaleGenerationCommands('tools-test').length === 1
      assert.deepEqual(snapshot, value)
      assert.notEqual(snapshot, value)
    },
  })
  assert.equal(sawPending, true)
  assert.equal(calls.length, 1)
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), value)
  const headers = calls[0]?.init?.headers as Record<string, string>
  assert.equal(headers['X-Hocus-UI-Surface'], 'wizard')
  assert.equal(headers['X-Hocus-UI-Context'], JSON.stringify({ workflowId: 'tools-workflow', runId: 'tools-run' }))
  assert.equal(receipt.operation, 'tools.upscale')
  assert.equal(receipt.result.job_id, 'job-tools-submit')
  assert.deepEqual(pendingToolsUpscaleGenerationCommands(), [])
})

test('Tools rejects a seed change after the command snapshot and before presentation', { concurrency: false }, async () => {
  const { prepareStudioToolsUpscaleSubmission } = await import('../src/features/studio/toolsCommandSubmission.ts')
  const state = {
    activeWorkspace: 'tools-test',
    generationMode: 'tools',
    toolsTool: 'upscale',
    toolsSourcePath: 'source.png',
    toolsSourceName: 'source.png',
    toolsSourceUrl: '/api/v1/file/source.png?workspace=tools-test',
    toolsSourceAssetId: null,
    toolsSourceWorkspace: null,
    toolsSourceKind: 'image',
    toolsUpscaleMethod: 'lanczos2',
    params: { seed: 17, wangp_processor_settings: null },
    settingsOpen: false,
    dashboardOpen: false,
    sidebarMode: 'studio',
  } as never
  const current = { ...state, params: { ...state.params } } as never
  let posts = 0
  globalThis.fetch = async () => {
    posts += 1
    return response(queuedReceipt(command('seed-race')))
  }
  const submission = await prepareStudioToolsUpscaleSubmission(
    params(), state, () => current, { actor: 'user', capability: 'tools.upscale' },
  )
  current.params.seed = 18
  await assert.rejects(submission.submit(), /form changed|context changed/i)
  assert.equal(posts, 0)
  assert.deepEqual(pendingToolsUpscaleGenerationCommands(), [])
})

test('an uncertain Tools response retries the same intent and exact command', { concurrency: false }, async () => {
  const value = command('tools-retry')
  const bodies: unknown[] = []
  let attempt = 0
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)))
    attempt += 1
    if (attempt === 1) throw new Error('connection lost after admission')
    return response(queuedReceipt(value))
  }

  await assert.rejects(
    submitToolsUpscaleGenerationCommand(value),
    error => error instanceof ToolsUpscaleGenerationCommandError && error.uncertain,
  )
  assert.deepEqual(pendingToolsUpscaleGenerationCommands(), [value])
  await submitToolsUpscaleGenerationCommand(value)
  assert.deepEqual(bodies, [value, value])
  assert.deepEqual(pendingToolsUpscaleGenerationCommands(), [])
})

test('a presentation failure before POST removes only a new Tools hint', { concurrency: false }, async () => {
  const value = command('tools-hook-failure')
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return response(queuedReceipt(value))
  }
  await assert.rejects(
    submitToolsUpscaleGenerationCommand(value, {
      onSnapshotReady: () => { throw new Error('Tools panel unavailable') },
    }),
    error => error instanceof ToolsUpscaleGenerationCommandError
      && error.code === 'snapshot_hook_failed'
      && !error.uncertain,
  )
  assert.equal(calls, 0)
  assert.deepEqual(pendingToolsUpscaleGenerationCommands(), [])
})

test('a v2 Tools receipt without complete fingerprint metadata remains recoverable', { concurrency: false }, async () => {
  const value = command('tools-invalid-receipt')
  globalThis.fetch = async () => {
    const invalid = queuedReceipt(value)
    delete invalid.commandVersion
    return response(invalid)
  }
  await assert.rejects(
    submitToolsUpscaleGenerationCommand(value),
    error => error instanceof ToolsUpscaleGenerationCommandError
      && error.code === 'invalid_receipt'
      && error.uncertain,
  )
  assert.deepEqual(pendingToolsUpscaleGenerationCommands(), [value])
})

test('receipt recovery uses the persisted Tools v2 command and clears it after validation', { concurrency: false }, async () => {
  const value = command('tools-receipt')
  globalThis.fetch = async () => { throw new Error('response lost') }
  await assert.rejects(submitToolsUpscaleGenerationCommand(value))
  globalThis.fetch = async input => {
    assert.match(String(input), /\/generation\/commands\/receipt\?workspace=tools-test&intent_id=tools-receipt$/)
    return response(queuedReceipt(value))
  }
  const receipt = await fetchToolsUpscaleGenerationCommandReceipt('tools-test', value.intent_id)
  assert.equal(receipt.operation, 'tools.upscale')
  assert.deepEqual(pendingToolsUpscaleGenerationCommands(), [])
})
