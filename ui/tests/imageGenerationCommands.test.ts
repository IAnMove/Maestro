import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Event: dom.window.Event,
  localStorage: dom.window.localStorage,
})

const {
  createImageGenerationCommand,
  fetchImageGenerationCommandReceipt,
  newImageGenerationIntentId,
  pendingImageGenerationCommand,
  pendingImageGenerationCommands,
  submitImageGenerationCommand,
  ImageGenerationCommandError,
} = await import('../src/api/imageGenerationCommands.ts')

const originalFetch = globalThis.fetch

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function command(
  intentId = 'intent-image-1',
  workspace = 'workspace-a',
  overrides: Record<string, unknown> = {},
) {
  const input = {
    workspace,
    model_type: 'pi_flux2',
    prompt: '  literal prompt: mañana\nkeep spaces  ',
    resolution: '512x512',
    num_inference_steps: 1,
    seed: -1,
    guidance_scale: 1.0,
  }
  Object.assign(input, overrides)
  return createImageGenerationCommand(intentId, input)
}

function receipt(value: ReturnType<typeof command>, overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    commandId: value.intent_id,
    operation: value.operation,
    status: 'queued',
    entities: [],
    artifacts: [],
    taskIds: [`task-${value.intent_id}`],
    pipelineIds: [],
    result: {
      job_id: `job-${value.intent_id}`,
      task_id: `task-${value.intent_id}`,
      root_task_id: `root-${value.intent_id}`,
      workspace: value.input.workspace,
      status: 'queued',
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

test('creation requires an explicit intention and detaches the exact image envelope', { concurrency: false }, () => {
  const input = {
    workspace: 'workspace-a',
    model_type: 'pi_flux2',
    prompt: '  keep literal\nmañana  ',
    negative_prompt: ' do not rewrite  ',
    resolution: '512x512',
    num_inference_steps: 1,
    seed: -1,
    guidance_scale: 1.0,
  }
  const value = createImageGenerationCommand(' exact-intent ', input)

  input.prompt = 'changed after creation'
  assert.equal(value.intent_id, ' exact-intent ')
  assert.equal(value.input.prompt, '  keep literal\nmañana  ')
  assert.equal(value.input.negative_prompt, ' do not rewrite  ')
  assert.equal('generation_mode' in value.input, false)
  assert.equal('image_mode' in value.input, false)
  assert.equal('video_length' in value.input, false)
})

test('integer fields reject JavaScript values that cannot preserve the native literal', { concurrency: false }, () => {
  assert.throws(
    () => command('intent-unsafe-seed', 'workspace-a', { seed: Number.MAX_SAFE_INTEGER + 1 }),
    /input\.seed/,
  )
})

test('unsupported mode and client metadata cannot enter the image envelope', { concurrency: false }, async () => {
  assert.throws(
    () => command('intent-extra-input', 'workspace-a', { generation_mode: 'image' }),
    /generation_mode/,
  )
  const withClient = { ...command('intent-extra-envelope'), client: 'wizard' }
  await assert.rejects(submitImageGenerationCommand(withClient), /command\.client/)
})

test('the exact envelope is persisted before POST and a valid queued receipt clears it', { concurrency: false }, async () => {
  const value = command('intent-before-post')
  let requestUrl = ''
  let bodyAtTransport: Record<string, unknown> | undefined
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input)
    bodyAtTransport = bodyOf(init)
    assert.deepEqual(pendingImageGenerationCommands(), [value])
    return response({ receipt: receipt(value), replayed: false })
  }) as typeof fetch

  const result = await submitImageGenerationCommand(value)

  assert.equal(requestUrl, '/api/v1/generation/commands')
  assert.deepEqual(bodyAtTransport, value)
  assert.equal(result.commandId, value.intent_id)
  assert.equal(result.operation, 'generation.image')
  assert.equal(result.status, 'queued')
  assert.equal(result.replayed, false)
  assert.deepEqual(result.taskIds, [`task-${value.intent_id}`])
  assert.deepEqual(result.result, receipt(value).result)
  assert.deepEqual(pendingImageGenerationCommands(), [])
})

test('pending getter is storage-backed, workspace-scoped, and returns detached snapshots', { concurrency: false }, async () => {
  const first = command('intent-pending-a', 'workspace-a')
  const second = command('intent-pending-b', 'workspace-b')
  globalThis.fetch = (async () => { throw new Error('connection lost') }) as typeof fetch

  await assert.rejects(submitImageGenerationCommand(first), error => error instanceof ImageGenerationCommandError && error.uncertain)
  await assert.rejects(submitImageGenerationCommand(second), error => error instanceof ImageGenerationCommandError && error.uncertain)

  const recoveredView = pendingImageGenerationCommands()
  assert.deepEqual(recoveredView.map(item => item.intent_id), [first.intent_id, second.intent_id])
  assert.deepEqual(pendingImageGenerationCommands('workspace-a'), [first])
  assert.deepEqual(pendingImageGenerationCommands('workspace-b'), [second])
  assert.equal(pendingImageGenerationCommand(first.intent_id, 'workspace-b'), null)

  recoveredView[0].input.prompt = 'mutated view'
  assert.equal(pendingImageGenerationCommand(first.intent_id)?.input.prompt, first.input.prompt)
})

test('a lost response retries the same JSON and intention without inventing a fresh ID', { concurrency: false }, async () => {
  const value = command('intent-lost-response')
  const bodies: Record<string, unknown>[] = []
  let attempt = 0
  globalThis.fetch = (async (_input, init) => {
    bodies.push(bodyOf(init))
    attempt += 1
    if (attempt === 1) throw new Error('socket closed after admission')
    return response({ receipt: receipt(value), replayed: true })
  }) as typeof fetch

  await assert.rejects(
    submitImageGenerationCommand(value),
    error => error instanceof ImageGenerationCommandError
      && error.uncertain && /socket closed after admission/.test(error.message),
  )
  assert.deepEqual(pendingImageGenerationCommands(), [value])

  const replay = await submitImageGenerationCommand(value)

  assert.equal(replay.replayed, true)
  assert.equal(bodies.length, 2)
  assert.deepEqual(bodies[1], bodies[0])
  assert.equal((bodies[1].intent_id as string), value.intent_id)
  assert.deepEqual(pendingImageGenerationCommands(), [])
})

test('an initial definitive 4xx may clear its pending hint', { concurrency: false }, async () => {
  const value = command('intent-invalid-before-admission')
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return response({ detail: { code: 'invalid_resolution', message: 'bad resolution' } }, 422)
  }) as typeof fetch

  await assert.rejects(
    submitImageGenerationCommand(value),
    error => error instanceof ImageGenerationCommandError && error.status === 422 && !error.uncertain,
  )
  assert.equal(calls, 1)
  assert.deepEqual(pendingImageGenerationCommands(), [])
})

test('a later 401 does not erase a hint left by an uncertain prior attempt', { concurrency: false }, async () => {
  const value = command('intent-uncertain-then-auth')
  let attempt = 0
  globalThis.fetch = (async () => {
    attempt += 1
    if (attempt === 1) throw new Error('response lost after commit')
    if (attempt === 2) return response({ detail: 'authentication expired' }, 401)
    return response({ receipt: receipt(value), replayed: true })
  }) as typeof fetch

  await assert.rejects(submitImageGenerationCommand(value), error => error instanceof ImageGenerationCommandError && error.uncertain)
  await assert.rejects(
    submitImageGenerationCommand(value),
    error => error instanceof ImageGenerationCommandError && error.status === 401 && error.uncertain,
  )
  assert.deepEqual(pendingImageGenerationCommands(), [value])

  const replay = await submitImageGenerationCommand(value)
  assert.equal(replay.replayed, true)
  assert.deepEqual(pendingImageGenerationCommands(), [])
})

test('same intent cannot be retried with a changed workspace or literal', { concurrency: false }, async () => {
  const original = command('intent-workspace-conflict', 'workspace-a')
  const changed = command('intent-workspace-conflict', 'workspace-b', { prompt: 'changed literal' })
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    throw new Error('uncertain transport')
  }) as typeof fetch

  await assert.rejects(submitImageGenerationCommand(original))
  await assert.rejects(
    submitImageGenerationCommand(changed),
    error => error instanceof ImageGenerationCommandError && error.code === 'intent_conflict',
  )
  assert.equal(calls, 1)
  assert.deepEqual(pendingImageGenerationCommands(), [original])
})

test('a false 200 with uncorrelated or non-queued data is rejected and remains recoverable', { concurrency: false }, async () => {
  const value = command('intent-false-200')
  let attempt = 0
  globalThis.fetch = (async () => {
    attempt += 1
    if (attempt === 1) return response({ receipt: receipt(value, { commandId: 'other-intent' }), replayed: false })
    return response({ receipt: receipt(value), replayed: true })
  }) as typeof fetch

  await assert.rejects(
    submitImageGenerationCommand(value),
    error => error instanceof ImageGenerationCommandError
      && error.code === 'invalid_receipt' && error.status === 200 && error.uncertain,
  )
  assert.deepEqual(pendingImageGenerationCommands(), [value])

  const valid = receipt(value, { status: 'completed' })
  globalThis.fetch = (async () => response({ receipt: valid, replayed: true })) as typeof fetch
  await assert.rejects(submitImageGenerationCommand(value), /Receipt could not be verified/)
  assert.deepEqual(pendingImageGenerationCommands(), [value])
})

test('a valid committed receipt is returned even when local cleanup fails', { concurrency: false }, async () => {
  const value = command('intent-cleanup-failure')
  globalThis.fetch = (async () => response({ receipt: receipt(value), replayed: false })) as typeof fetch
  const storagePrototype = Object.getPrototypeOf(dom.window.localStorage) as Storage
  const originalRemoveItem = storagePrototype.removeItem
  Object.defineProperty(storagePrototype, 'removeItem', {
    configurable: true,
    value: () => { throw new Error('storage cleanup unavailable') },
  })
  try {
    const result = await submitImageGenerationCommand(value)
    assert.equal(result.commandId, value.intent_id)
    assert.deepEqual(pendingImageGenerationCommands(), [value])
  } finally {
    Object.defineProperty(storagePrototype, 'removeItem', {
      configurable: true,
      value: originalRemoveItem,
    })
  }
})

test('receipt query uses exact workspace and intention and recovers the POST wrapper', { concurrency: false }, async () => {
  const value = command('intent / recovery', 'workspace A')
  globalThis.fetch = (async () => { throw new Error('lost POST response') }) as typeof fetch
  await assert.rejects(submitImageGenerationCommand(value))

  let requestUrl = ''
  globalThis.fetch = (async input => {
    requestUrl = String(input)
    return response({ receipt: receipt(value), task: { id: `task-${value.intent_id}`, status: 'queued' } })
  }) as typeof fetch

  const recovered = await fetchImageGenerationCommandReceipt(value.input.workspace, value.intent_id)

  assert.equal(
    requestUrl,
    '/api/v1/generation/commands/receipt?workspace=workspace%20A&intent_id=intent%20%2F%20recovery',
  )
  assert.equal(recovered.commandId, value.intent_id)
  assert.equal(recovered.result.workspace, value.input.workspace)
  assert.deepEqual(pendingImageGenerationCommands(), [])
})

test('an invalid receipt from the recovery GET does not clear the pending command', { concurrency: false }, async () => {
  const value = command('intent-invalid-get')
  globalThis.fetch = (async () => { throw new Error('lost POST response') }) as typeof fetch
  await assert.rejects(submitImageGenerationCommand(value))

  globalThis.fetch = (async () => response({ receipt: { version: 1, status: 'queued' } })) as typeof fetch
  await assert.rejects(
    fetchImageGenerationCommandReceipt(value.input.workspace, value.intent_id),
    error => error instanceof ImageGenerationCommandError && error.code === 'invalid_receipt',
  )
  assert.deepEqual(pendingImageGenerationCommands(), [value])
})

test('generated IDs are only a creation helper; submit never changes an explicit ID', { concurrency: false }, async () => {
  const generated = newImageGenerationIntentId()
  const value = command(generated)
  const sentIds: unknown[] = []
  globalThis.fetch = (async (_input, init) => {
    sentIds.push(bodyOf(init).intent_id)
    return response({ receipt: receipt(value), replayed: false })
  }) as typeof fetch

  await submitImageGenerationCommand(value)

  assert.equal(sentIds.length, 1)
  assert.equal(sentIds[0], generated)
})
