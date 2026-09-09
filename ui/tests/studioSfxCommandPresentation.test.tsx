import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
let nextFrameId = 1
const frameCallbacks = new Map<number, FrameRequestCallback>()
const requestAnimationFrame = (callback: FrameRequestCallback): number => {
  const id = nextFrameId++
  frameCallbacks.set(id, callback)
  return id
}
const cancelAnimationFrame = (id: number): void => { frameCallbacks.delete(id) }

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
  localStorage: dom.window.localStorage,
  React,
  requestAnimationFrame,
  cancelAnimationFrame,
  IS_REACT_ACT_ENVIRONMENT: true,
})
Object.defineProperty(dom.window, 'requestAnimationFrame', { configurable: true, value: requestAnimationFrame })
Object.defineProperty(dom.window, 'cancelAnimationFrame', { configurable: true, value: cancelAnimationFrame })
Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: () => undefined })
Object.defineProperty(dom.window, 'setTimeout', { configurable: true, value: globalThis.setTimeout })
Object.defineProperty(dom.window, 'clearTimeout', { configurable: true, value: globalThis.clearTimeout })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

const { setUiLanguage } = await import('../src/i18n/index.ts')
await setUiLanguage('en')
const { StudioSfxCommandPanel } = await import('../src/features/studio/StudioSfxCommandPanel.tsx')
const { prepareStudioSfxSubmission } = await import('../src/features/studio/sfxCommandSubmission.ts')
const {
  pendingSfxGenerationCommands,
} = await import('../src/api/sfxGenerationCommands.ts')
const { useStore } = await import('../src/stores/useStore.ts')

const originalFetch = globalThis.fetch

async function flushAnimationFrames(): Promise<void> {
  for (let pass = 0; pass < 8 && frameCallbacks.size > 0; pass += 1) {
    const pending = [...frameCallbacks.entries()]
    frameCallbacks.clear()
    for (const [, callback] of pending) callback(0)
    await Promise.resolve()
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function baseParams(intent: string): Record<string, unknown> {
  const literalPrompt = `  rain on a tin roof ${intent}\nkeep this line exact  `
  return {
    workspace: 'sfx-output',
    prompt: literalPrompt,
    MMAudio_prompt: literalPrompt,
    MMAudio_neg_prompt: '  music, speech  ',
    model_type: 'mmaudio_v2',
    duration_seconds: 7.5,
    seed: 41,
    guidance_scale: 4.5,
    sfx_text_weight: 1.2,
    num_inference_steps: 25,
    video_guide: null,
    generation_mode: 'audio',
    _audio_sub_mode: 'sfx',
    image_mode: 0,
    video_length: 0,
    MMAudio_setting: 1,
    sfx_mode: true,
  }
}

function formState(params: Record<string, unknown>) {
  return {
    params,
    activeWorkspace: params.workspace,
    generationMode: 'audio',
    audioSubMode: 'sfx',
    durationSeconds: params.duration_seconds,
    settingsOpen: false,
    dashboardOpen: false,
    sidebarMode: 'studio',
  } as Parameters<typeof prepareStudioSfxSubmission>[1]
}

function queuedResponse(body: Record<string, unknown>): Response {
  const input = body.input as Record<string, unknown>
  const workspace = String(input.workspace)
  const intent = String(body.intent_id)
  const taskId = `task-${intent}`
  return jsonResponse({
    receipt: {
      version: 1,
      commandId: intent,
      operation: 'generation.sfx',
      status: 'queued',
      entities: [],
      artifacts: [],
      taskIds: [taskId],
      pipelineIds: [],
      result: { job_id: `job-${intent}`, task_id: taskId, workspace, status: 'queued' },
      commandVersion: 2,
      fingerprintVersion: 2,
      contentFingerprint: 'a'.repeat(64),
    },
    replayed: false,
  })
}

test.afterEach(() => {
  frameCallbacks.clear()
  dom.window.localStorage.clear()
  globalThis.fetch = originalFetch
  document.body.replaceChildren()
})

test('SFX ACK presents the literal prompt and canonical source before POST without TTS injection', { concurrency: false }, async () => {
  const { render, screen, waitFor, cleanup, act } = await import('@testing-library/react')
  const params = baseParams('panel')
  const sourceReference = '/api/v1/file/guide.mp4?workspace=source-video'
  const canonicalReference = '/api/v1/file/canonical-guide.mp4?workspace=source-video'
  params.video_guide = sourceReference
  const state = formState(params)
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = []
  globalThis.fetch = (async (input, init) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
    calls.push({ url, body })
    if (url.includes('/references')) {
      assert.deepEqual(body?.references, [sourceReference])
      assert.equal(body?.media_kind, 'video')
      return jsonResponse({ references: [canonicalReference] })
    }
    if (url.endsWith('/generation/commands')) return queuedResponse(body || {})
    throw new Error(`unexpected fetch: ${url}`)
  }) as typeof fetch

  render(<StudioSfxCommandPanel workspace="sfx-output" model="mmaudio_v2" visible onRecovered={async () => undefined} />)
  try {
    const prepared = await prepareStudioSfxSubmission(params, state, () => state, {
      actor: 'wizard', commandId: 'sfx-panel-ack',
    })
    let submission!: ReturnType<typeof prepared.submit>
    await act(async () => {
      submission = prepared.submit()
      await Promise.resolve()
    })
    await waitFor(() => {
      const text = screen.getByRole('status').textContent || ''
      assert.match(text, /rain on a tin roof panel/)
      assert.match(text, /canonical-guide\.mp4\?workspace=source-video/)
      assert.equal(text.includes('Speaker'), false)
      assert.equal(calls.filter(call => call.url.endsWith('/generation/commands')).length, 0)
    })

    await act(async () => { await flushAnimationFrames() })
    const receipt = await submission
    assert.equal(receipt.job_id, 'job-sfx-panel-ack')
    const post = calls.find(call => call.url.endsWith('/generation/commands'))?.body
    assert.equal(post?.operation, 'generation.sfx')
    const postedInput = post?.input as Record<string, unknown>
    const postedParams = postedInput.params as Record<string, unknown>
    assert.equal(postedInput.workspace, 'sfx-output')
    assert.equal(postedParams.video_guide, canonicalReference)
    assert.equal(postedParams.MMAudio_prompt, params.MMAudio_prompt)
    assert.equal(postedParams.prompt, params.prompt)
    assert.equal(postedParams.sfx_mode, true)
    assert.equal(postedParams.duration_seconds, 7.5)
    assert.equal('voice_clone_enabled' in postedParams, false)
    assert.equal('_tts_voice_count' in postedParams, false)
    assert.deepEqual(pendingSfxGenerationCommands(), [])
  } finally {
    cleanup()
  }
})

test('SFX canonical reference resolution aborts on a changed Studio context before admission', { concurrency: false }, async () => {
  const params = { ...baseParams('context'), video_guide: '/api/v1/file/guide.mp4?workspace=source-video' }
  const before = formState(params)
  let live = before
  let resolveReference!: (value: Response) => void
  let generationCalls = 0
  globalThis.fetch = (async input => {
    const url = String(input)
    if (url.includes('/references')) return await new Promise<Response>(resolve => { resolveReference = resolve })
    if (url.endsWith('/generation/commands')) generationCalls += 1
    return jsonResponse({})
  }) as typeof fetch

  const preparedPromise = prepareStudioSfxSubmission(
    params,
    before,
    () => live,
    { actor: 'wizard', commandId: 'sfx-context-race' },
  )
  live = { ...before, durationSeconds: 12 }
  resolveReference(jsonResponse({ references: ['/api/v1/file/guide.mp4?workspace=source-video'] }))
  const prepared = await preparedPromise
  // The SFX branch must expose its own context message; the shared image
  // translation would mislead the user about which form changed.
  await assert.rejects(prepared.submit(), /Studio context changed/i)
  assert.equal(generationCalls, 0)
  assert.deepEqual(pendingSfxGenerationCommands(), [])
})

test('store SFX submission keeps defaults and literal prompt while ignoring stale TTS and clone state', { concurrency: false }, async () => {
  const { render, act } = await import('@testing-library/react')
  const before = useStore.getState()
  const originalInterval = globalThis.setInterval
  const workspace = 'sfx-store-defaults'
  const intent = 'sfx-store-defaults-intent'
  const literalPrompt = '  thunder over a valley\nkeep this exact  '
  const params = {
    ...before.params,
    workspace,
    prompt: literalPrompt,
    MMAudio_prompt: literalPrompt,
    MMAudio_neg_prompt: 'music, speech',
    model_type: 'mmaudio_v2',
    generation_mode: 'audio',
    _audio_sub_mode: 'sfx',
    duration_seconds: 7.5,
    seed: -1,
    guidance_scale: 4.5,
    sfx_text_weight: 1,
    num_inference_steps: 25,
    video_guide: null,
    image_mode: 0,
    video_length: 0,
    MMAudio_setting: 1,
    sfx_mode: true,
    skip_steps_cache_type: 'first_block',
    voice_clone_enabled: true,
    voice_clone_refs: ['/api/v1/uploads/stale-voice.wav'],
  }
  const posts: Record<string, unknown>[] = []
  globalThis.setInterval = (() => 0) as unknown as typeof setInterval
  globalThis.fetch = (async (input, init) => {
    const url = String(input)
    if (!url.endsWith('/generation/commands')) throw new Error(`unexpected fetch: ${url}`)
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    posts.push(body)
    return queuedResponse(body)
  }) as typeof fetch

  useStore.setState({
    activeWorkspace: workspace,
    generationMode: 'audio',
    audioSubMode: 'sfx',
    modelOptions: null,
    params,
    durationSeconds: 7.5,
    ttsVoiceCount: 2,
    ttsVoices: [
      { name: 'Old Speaker', filename: 'old.wav', path: '/api/v1/uploads/old.wav' },
      { name: 'Second Speaker', filename: 'second.wav', path: '/api/v1/uploads/second.wav' },
    ],
    voiceCloneEnabled: true,
    voiceCloneMode: 'two',
    voiceCloneRefs: [
      { filename: 'clone-a.wav', path: '/api/v1/uploads/clone-a.wav' },
      { filename: 'clone-b.wav', path: '/api/v1/uploads/clone-b.wav' },
    ],
    llmStatus: { ...before.llmStatus, loaded: false },
    jobs: [],
  })
  const view = render(<StudioSfxCommandPanel workspace={workspace} model="mmaudio_v2" visible onRecovered={async () => undefined} />)
  try {
    const start = useStore.getState().startGeneration(undefined, { actor: 'user', commandId: intent })
    for (let pass = 0; pass < 10 && posts.length === 0; pass += 1) {
      await act(async () => {
        await Promise.resolve()
        await flushAnimationFrames()
      })
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    const receipt = await start
    assert.equal(receipt?.result.job_id, `job-${intent}`)
    assert.equal(posts.length, 1)
    const input = posts[0]?.input as Record<string, unknown>
    const submitted = input.params as Record<string, unknown>
    assert.equal(input.workspace, workspace)
    assert.equal(submitted.model_type, 'mmaudio_v2')
    assert.equal(submitted.MMAudio_prompt, literalPrompt)
    assert.equal(submitted.prompt, literalPrompt)
    assert.equal(submitted.duration_seconds, 7.5)
    assert.equal(submitted.num_inference_steps, 25)
    assert.equal(submitted.image_mode, 0)
    assert.equal(submitted.video_length, 0)
    assert.equal(submitted._mmaudio_variant, 'v2')
    assert.equal(submitted.sfx_mode, true)
    assert.equal(submitted.MMAudio_setting, 1)
    assert.equal(submitted.skip_steps_cache_type, undefined)
    assert.equal(submitted.voice_clone_enabled, undefined)
    assert.equal(submitted.voice_clone_refs, undefined)
    assert.equal(submitted._tts_speaker_name1, undefined)
    assert.equal(submitted._tts_voice_count, undefined)
  } finally {
    view.unmount()
    globalThis.setInterval = originalInterval
    useStore.setState(before)
  }
})
