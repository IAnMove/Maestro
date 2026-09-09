import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
})

const handoff = await import('../src/features/agent/programmaticVideoHandoff.ts')

const preparation = (overrides = {}) => ({
  intent: 'Monta una escena Video3D con los outputs existentes.',
  generationPolicy: 'provided_only',
  workspace: 'demo',
  outputNames: ['hero.glb'],
  ...overrides,
})

test('waits for the mounted form and acknowledges one reflected preparation', async () => {
  let calls = 0
  const pending = handoff.requestProgrammaticVideoPreparation(preparation())
  await Promise.resolve()
  assert.equal(calls, 0)

  const unsubscribe = handoff.listenForProgrammaticVideoPreparation(async request => {
    calls += 1
    assert.equal(request.workspace, 'demo')
    return { message: 'form-ready', policy: request.generationPolicy }
  })
  try {
    assert.deepEqual(await pending, { message: 'form-ready', policy: 'provided_only' })
    assert.equal(calls, 1)
  } finally {
    unsubscribe()
  }
})

test('rejects a concurrent request while the form is busy', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const unsubscribe = handoff.listenForProgrammaticVideoPreparation(async request => {
    await gate
    return { message: request.intent, policy: request.generationPolicy }
  })
  try {
    const first = handoff.requestProgrammaticVideoPreparation(preparation())
    await Promise.resolve()
    await assert.rejects(
      handoff.requestProgrammaticVideoPreparation(preparation({ intent: 'otra escena' })),
      /already in progress/i,
    )
    release()
    assert.equal((await first).message, preparation().intent)
  } finally {
    unsubscribe()
  }
})

test('times out a request that never reaches a mounted form', async () => {
  const originalSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = ((callback) => {
    queueMicrotask(callback)
    return 0
  })
  try {
    await assert.rejects(
      handoff.requestProgrammaticVideoPreparation(preparation()),
      /timed out waiting/i,
    )
  } finally {
    globalThis.setTimeout = originalSetTimeout
  }
})

test('releases a timed-out listener slot without allowing its late acknowledgement to win', async () => {
  const originalSetTimeout = globalThis.setTimeout
  let resolveFirst
  let calls = 0
  const firstListener = new Promise(resolve => { resolveFirst = resolve })
  const unsubscribe = handoff.listenForProgrammaticVideoPreparation(async request => {
    calls += 1
    if (calls === 1) {
      await firstListener
      return { message: 'late-first', policy: request.generationPolicy }
    }
    return { message: 'second-wins', policy: request.generationPolicy }
  })
  globalThis.setTimeout = ((callback) => {
    queueMicrotask(callback)
    return 0
  })
  try {
    const first = handoff.requestProgrammaticVideoPreparation(preparation())
    await assert.rejects(first, /timed out waiting/i)
  } finally {
    globalThis.setTimeout = originalSetTimeout
  }
  try {
    const second = handoff.requestProgrammaticVideoPreparation(preparation({ intent: 'segunda preparación' }))
    assert.deepEqual(await second, { message: 'second-wins', policy: 'provided_only' })
    resolveFirst()
    await Promise.resolve()
    assert.equal(calls, 2)
  } finally {
    unsubscribe()
  }
})

test('propagates workspace correlation failures from the mounted form', async () => {
  const pending = handoff.requestProgrammaticVideoPreparation(preparation({ workspace: 'workspace-a' }))
  const unsubscribe = handoff.listenForProgrammaticVideoPreparation(async request => {
    if (request.workspace !== 'workspace-b') throw new Error('workspace changed')
    return { message: 'unexpected', policy: request.generationPolicy }
  })
  try {
    await assert.rejects(pending, /workspace changed/)
  } finally {
    unsubscribe()
  }
})

test('preserves literal intent and rejects invalid output names instead of filtering them', async () => {
  const literalIntent = '  Conserva exactamente este espacio final.  '
  const unsubscribe = handoff.listenForProgrammaticVideoPreparation(async request => ({
    message: request.intent,
    policy: request.generationPolicy,
  }))
  try {
    assert.deepEqual(
      await handoff.requestProgrammaticVideoPreparation(preparation({ intent: literalIntent })),
      { message: literalIntent, policy: 'provided_only' },
    )
    await assert.rejects(
      handoff.requestProgrammaticVideoPreparation(preparation({ outputNames: [''] })),
      /output names must be non-empty/i,
    )
    await assert.rejects(
      handoff.requestProgrammaticVideoPreparation(preparation({ outputNames: [123] })),
      /output names must be non-empty/i,
    )
    await assert.rejects(
      handoff.requestProgrammaticVideoPreparation(preparation({ outputNames: ['x'.repeat(301)] })),
      /output name is too long/i,
    )
  } finally {
    unsubscribe()
  }
})
