import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
  localStorage: dom.window.localStorage,
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

const {
  newCollectionIntentId,
  pendingCollectionCommands,
  submitCollectionCommand,
} = await import('../src/api/workspaceCommands.ts')

const originalFetch = globalThis.fetch

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function command(intentId: string, name = 'Test collection') {
  return {
    version: 1 as const,
    operation: 'collections.create' as const,
    intent_id: intentId,
    input: {
      name,
      description: 'A literal description',
      asset_ids: ['asset-1'],
    },
  }
}

function receipt(value: ReturnType<typeof command>, overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    commandId: value.intent_id,
    operation: value.operation,
    replayed: false,
    status: 'completed',
    entities: [],
    artifacts: [],
    taskIds: [],
    pipelineIds: [],
    result: {
      schema: 'hocuspocus.workspace-record',
      schema_version: 1,
      id: `collection-${value.intent_id}`,
      revision: 1,
      name: value.input.name,
      description: value.input.description,
      project_ids: [],
      asset_ids: value.input.asset_ids,
      production_ids: [],
      created_at: null,
      updated_at: null,
    },
    ...overrides,
  }
}

function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
  assert.ok(init?.body)
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

test.afterEach(() => {
  dom.window.localStorage.clear()
  globalThis.fetch = originalFetch
})

test('new intent IDs are stable identifiers for a command and are not reused', { concurrency: false }, () => {
  const first = newCollectionIntentId()
  const second = newCollectionIntentId()
  assert.match(first, /.+/)
  assert.match(second, /.+/)
  assert.notEqual(first, second)
})

test('the pending command is cached by intention before transport and removed after a valid receipt', { concurrency: false }, async () => {
  const value = command('intent-cache-1')
  let pendingAtTransport: unknown
  globalThis.fetch = (async () => {
    pendingAtTransport = pendingCollectionCommands()
    return response(receipt(value))
  }) as typeof fetch

  const result = await submitCollectionCommand(value)

  assert.deepEqual(pendingAtTransport, [value])
  assert.equal(result.commandId, value.intent_id)
  assert.deepEqual(pendingCollectionCommands(), [])
})

test('a known pre-admission rejection clears the recovery hint and does not retry implicitly', { concurrency: false }, async () => {
  const value = command('intent-rejected-before-admission')
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return response({ detail: 'invalid collection' }, 400)
  }) as typeof fetch

  await assert.rejects(
    submitCollectionCommand(value),
    error => error instanceof Error && 'status' in error && error.status === 400,
  )
  assert.equal(calls, 1)
  assert.deepEqual(pendingCollectionCommands(), [])
})

test('an uncertain after-admission response keeps the exact JSON for an explicit retry', { concurrency: false }, async () => {
  const value = command('intent-retry-exact-json')
  const calls: Array<Record<string, unknown>> = []
  let attempt = 0
  globalThis.fetch = (async (_input, init) => {
    calls.push(bodyOf(init))
    attempt += 1
    return attempt === 1 ? response({ detail: 'gateway timeout after admission' }, 503) : response(receipt(value, { replayed: true }))
  }) as typeof fetch

  await assert.rejects(submitCollectionCommand(value), /Request: intent-retry-exact-json/)
  assert.deepEqual(pendingCollectionCommands(), [value])

  const replay = await submitCollectionCommand(value)

  assert.equal(replay.replayed, true)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1], calls[0])
  assert.deepEqual(calls[0], {
    version: 1,
    operation: 'collections.create',
    intent_id: 'intent-retry-exact-json',
    input: { name: 'Test collection', description: 'A literal description', asset_ids: ['asset-1'] },
  })
  assert.deepEqual(pendingCollectionCommands(), [])
})

test('an invalid success response preserves recovery until the same intention is confirmed', { concurrency: false }, async () => {
  const value = command('intent-invalid-receipt')
  let attempt = 0
  globalThis.fetch = (async () => {
    attempt += 1
    if (attempt === 1) return response({ commandId: value.intent_id, operation: value.operation, status: 'completed' })
    return response(receipt(value, { replayed: true }))
  }) as typeof fetch

  await assert.rejects(submitCollectionCommand(value), /result could not be verified/i)
  assert.deepEqual(pendingCollectionCommands(), [value])

  const recovered = await submitCollectionCommand(value)

  assert.equal(recovered.commandId, value.intent_id)
  assert.equal(recovered.replayed, true)
  assert.deepEqual(pendingCollectionCommands(), [])
})

test('equal inputs with different intention IDs each submit independently', { concurrency: false }, async () => {
  const first = command('intent-independent-a')
  const second = command('intent-independent-b')
  const calls: Array<Record<string, unknown>> = []
  globalThis.fetch = (async (_input, init) => {
    const body = bodyOf(init)
    calls.push(body)
    const value = body.intent_id === first.intent_id ? first : second
    return response(receipt(value))
  }) as typeof fetch

  const results = await Promise.all([
    submitCollectionCommand(first),
    submitCollectionCommand(second),
  ])

  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map(call => call.intent_id), [first.intent_id, second.intent_id])
  assert.deepEqual(results.map(result => result.commandId), [first.intent_id, second.intent_id])
  assert.deepEqual(pendingCollectionCommands(), [])
})
