import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'
import type { SpeechPresentation } from '../src/features/studio/speechCommandPresentation'

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

const { setUiLanguage } = await import('../src/i18n/index.ts')
await setUiLanguage('en')
const { StudioSpeechCommandPanel } = await import('../src/features/studio/StudioSpeechCommandPanel.tsx')
const { prepareStudioSpeechSubmission } = await import('../src/features/studio/speechCommandSubmission.ts')
const { createStudioSpeechGenerationCommand } = await import('../src/features/studio/speechGenerationSpec.ts')
const { pendingSpeechGenerationCommands } = await import('../src/api/speechGenerationCommands.ts')
const { presentStudioSpeechCommand, SPEECH_PRESENTATION_EVENT } = await import('../src/features/studio/speechCommandPresentation.ts')

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
  return {
    workspace: 'speech-ack-workspace',
    prompt: `Speaker one says hello ${intent}\nsecond line stays exact`,
    _tts_original_prompt: `Speaker one says hello ${intent}\nsecond line stays exact`,
    model_type: 'kugelaudio_0_open',
    resolution: '1280x720',
    num_inference_steps: 0,
    guidance_scale: 3,
    seed: -1,
    image_mode: 0,
    video_length: 0,
    generation_mode: 'audio',
    _audio_sub_mode: 'speech',
    negative_prompt: '',
    repeat_generation: 1,
    activated_loras: [],
    loras_multipliers: '',
    multi_prompts_gen_type: 2,
    _tts_speaker_name1: '',
    _tts_speaker_name2: '',
    _tts_voice_count: 0,
    duration_seconds: 20,
  }
}

function formState(params: Record<string, unknown>) {
  return {
    params,
    activeWorkspace: params.workspace,
    generationMode: 'audio',
    audioSubMode: 'speech',
    durationSeconds: 20,
    ttsVoiceCount: 0,
    ttsSpeakerName1: '',
    ttsSpeakerName2: '',
    ttsVoices: [],
    settingsOpen: false,
    dashboardOpen: false,
    sidebarMode: 'studio',
  } as Parameters<typeof prepareStudioSpeechSubmission>[1]
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
      operation: 'generation.speech',
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

test('speech panel ACK shows original text, duration, voice and reference counts before POST', { concurrency: false }, async () => {
  const { render, screen, waitFor, cleanup, act } = await import('@testing-library/react')
  const params = baseParams('ack')
  const state = formState(params)
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = []
  globalThis.fetch = (async (input, init) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
    calls.push({ url, body })
    if (url.includes('/references')) return jsonResponse({ references: body?.references || [] })
    if (url.endsWith('/generation/commands')) return queuedResponse(body || {})
    throw new Error(`unexpected fetch: ${url}`)
  }) as typeof fetch
  render(<StudioSpeechCommandPanel workspace="speech-ack-workspace" model="kugelaudio_0_open" visible onRecovered={async () => undefined} />)
  try {
    const prepared = await prepareStudioSpeechSubmission(params, state, () => state, { actor: 'wizard', commandId: 'speech-panel-ack' })
    let submission!: ReturnType<typeof prepared.submit>
    await act(async () => {
      submission = prepared.submit()
      await Promise.resolve()
    })
    await waitFor(() => {
      assert.match(screen.getByRole('status').textContent || '', /Speaker one says hello ack/)
      assert.match(screen.getByRole('status').textContent || '', /20s/)
      assert.match(screen.getByRole('status').textContent || '', /0 audio references · 0 voices · 0 LoRAs/)
    })
    assert.equal(calls.filter(call => call.url.endsWith('/generation/commands')).length, 0)
    await act(async () => { await flushAnimationFrames() })
    await submission
    assert.equal(calls.filter(call => call.url.endsWith('/generation/commands')).length, 1)
    const posted = calls.find(call => call.url.endsWith('/generation/commands'))?.body
    assert.equal(posted?.operation, 'generation.speech')
    assert.equal(((posted?.input as Record<string, unknown>).params as Record<string, unknown>)._tts_original_prompt, params._tts_original_prompt)
  } finally {
    cleanup()
  }
})

test('changing duration or voice file while audio references resolve aborts before POST', { concurrency: false }, async () => {
  const params = { ...baseParams('race'), audio_guide: '/api/v1/uploads/voice.wav' }
  const before = formState(params)
  let live = before
  let resolveReference!: (value: Response) => void
  let generationCalls = 0
  globalThis.fetch = (async (input) => {
    const url = String(input)
    if (url.includes('/references')) {
      return await new Promise<Response>(resolve => { resolveReference = resolve })
    }
    if (url.endsWith('/generation/commands')) generationCalls += 1
    return jsonResponse({})
  }) as typeof fetch

  const preparedPromise = prepareStudioSpeechSubmission(params, before, () => live, { actor: 'wizard', commandId: 'speech-race' })
  live = {
    ...before,
    durationSeconds: 28,
    ttsVoiceCount: 1,
    ttsVoices: [{ name: 'Voice', filename: 'voice.wav', path: '/workspace/voice.wav' }],
  }
  resolveReference(jsonResponse({ references: ['/api/v1/uploads/voice.wav'] }))
  const prepared = await preparedPromise
  await assert.rejects(prepared.submit(), /changed before submission/i)
  assert.equal(generationCalls, 0)
  assert.deepEqual(pendingSpeechGenerationCommands(), [])
})

test('a malformed audio reference is rejected before resolution and cannot shift a later voice slot', { concurrency: false }, async () => {
  const params = {
    ...baseParams('malformed-reference'),
    audio_guide: 123,
    audio_guide2: '/api/v1/uploads/later-voice.wav',
  }
  const before = formState(params)
  let referenceCalls = 0
  let generationCalls = 0
  globalThis.fetch = (async input => {
    if (String(input).includes('/references')) referenceCalls += 1
    if (String(input).endsWith('/generation/commands')) generationCalls += 1
    return jsonResponse({ references: ['/api/v1/uploads/resolved.wav'] })
  }) as typeof fetch

  const prepared = await prepareStudioSpeechSubmission(
    params,
    before,
    () => before,
    { actor: 'wizard', commandId: 'speech-malformed-reference' },
  )
  await assert.rejects(prepared.submit(), /audio_guide.*string audio reference/i)
  assert.equal(referenceCalls, 0)
  assert.equal(generationCalls, 0)
})

test('the native zero duration sentinel is presented as auto duration', { concurrency: false }, async () => {
  const { render, screen, waitFor, cleanup, act } = await import('@testing-library/react')
  const params = { ...baseParams('auto-duration'), duration_seconds: 0 }
  const command = createStudioSpeechGenerationCommand(params, 'speech-auto-duration')
  render(<StudioSpeechCommandPanel workspace="speech-ack-workspace" model="kugelaudio_0_open" visible onRecovered={async () => undefined} />)
  try {
    const presented = presentStudioSpeechCommand(command)
    await waitFor(() => assert.match(screen.getByRole('status').textContent || '', /auto duration/i))
    await act(async () => { await flushAnimationFrames() })
    await presented
  } finally {
    cleanup()
  }
})

test('Load Settings/reroll speech preparation projects stale H3 controls before the strict builder', { concurrency: false }, async () => {
  const params = {
    ...baseParams('reroll-load-settings'),
    // These values can be restored into the shared form by a video/H3
    // sidecar. Speech keeps its native fields while dropping this known UI
    // residue before entering the closed generation command.
    h3_reference_mode: 'first_frame',
    minimax_h3_planning_style: 'faithful',
    minimax_h3_audio_policy: 'native',
    minimax_h3_reference_sequence: false,
    minimax_h3_turbo_preset: 'standard',
    perturbation_layers: [9],
    stage2_steps: 8,
    voice_clone_enabled: true,
    voice_clone_refs: ['/tmp/voice.wav'],
    h3_ref_videos: [],
    h3_ref_audios: [],
    minimax_h3_references: [],
  }
  const state = formState(params)
  const prepared = await prepareStudioSpeechSubmission(
    params,
    state,
    () => state,
    { actor: 'wizard', commandId: 'speech-reroll-load-settings' },
  )
  assert.equal(prepared.params.duration_seconds, 20)
  assert.deepEqual(prepared.params.h3_ref_videos, [])
  assert.deepEqual(prepared.params.h3_ref_audios, [])
  assert.equal(prepared.params.minimax_h3_planning_style, undefined)
  assert.equal(prepared.params.perturbation_layers, undefined)
  assert.equal(prepared.params.voice_clone_refs, undefined)
})

test('speech presentation waits for the listening panel and cancels when it is removed', { concurrency: false }, async () => {
  const command = createStudioSpeechGenerationCommand(baseParams('lifecycle'), 'speech-lifecycle')
  const root = document.createElement('div')
  root.dataset.studioSpeechReady = 'true'
  root.dataset.studioSpeechListening = 'false'
  document.body.append(root)
  const requests: SpeechPresentation[] = []
  const receive = (event: Event) => {
    const request = (event as CustomEvent<SpeechPresentation>).detail
    requests.push(request)
    root.dataset.studioSpeechCommand = request.command.intent_id
    request.respond()
  }
  window.addEventListener(SPEECH_PRESENTATION_EVENT, receive)
  const waiting = presentStudioSpeechCommand(command)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(requests.length, 0)
  root.dataset.studioSpeechListening = 'true'
  await waiting
  assert.equal(requests.length, 1)
  window.removeEventListener(SPEECH_PRESENTATION_EVENT, receive)
  root.remove()

  const disappearing = document.createElement('div')
  disappearing.dataset.studioSpeechReady = 'true'
  disappearing.dataset.studioSpeechListening = 'true'
  document.body.append(disappearing)
  const removeOnRequest = (event: Event) => {
    const request = (event as CustomEvent<SpeechPresentation>).detail
    disappearing.remove()
    assert.equal(request.active, true)
  }
  window.addEventListener(SPEECH_PRESENTATION_EVENT, removeOnRequest)
  await assert.rejects(
    presentStudioSpeechCommand(createStudioSpeechGenerationCommand(baseParams('removed'), 'speech-removed')),
    /could not be shown/i,
  )
  window.removeEventListener(SPEECH_PRESENTATION_EVENT, removeOnRequest)
})

test('Speech form submission admits after leftover SFX prompt and weight', { concurrency: false }, async () => {
  const params = {
    ...baseParams('sfx-residue'),
    MMAudio_prompt: 'thunder crash on tin roof',
    MMAudio_neg_prompt: 'music',
    sfx_text_weight: 2.5,
    sfx_mode: true,
  }
  const state = formState(params)
  const prepared = await prepareStudioSpeechSubmission(
    params, state, () => state, { actor: 'user', commandId: 'speech-sfx-residue' },
  )
  assert.equal(prepared.params.prompt, params.prompt)
  assert.equal('MMAudio_prompt' in prepared.params, false)
  assert.equal('sfx_text_weight' in prepared.params, false)
})

test('Speech form accepts Music slider and lyric-language residue while direct commands reject it', { concurrency: false }, async () => {
  const params = { ...baseParams('music-residue'), alt_guidance_scale: 3, lyrics_language: 'en' }
  assert.throws(() => createStudioSpeechGenerationCommand(params, 'direct-music-residue'), /alt_guidance_scale/)
  const state = formState(params)
  const prepared = await prepareStudioSpeechSubmission(params, state, () => state)
  assert.equal(prepared.params.prompt, params.prompt)
  assert.equal('alt_guidance_scale' in prepared.params, false)
  assert.equal('lyrics_language' in prepared.params, false)
  assert.equal(params.alt_guidance_scale, 3, 'projection does not erase the original Music draft')
})
