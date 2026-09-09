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
const { StudioMusicCommandPanel } = await import('../src/features/studio/StudioMusicCommandPanel.tsx')
const { prepareStudioMusicSubmission } = await import('../src/features/studio/musicCommandSubmission.ts')
const { createStudioMusicGenerationCommand } = await import('../src/features/studio/musicGenerationSpec.ts')
const { pendingMusicGenerationCommands, submitMusicGenerationCommand } = await import('../src/api/musicGenerationCommands.ts')

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
    workspace: 'music-panel-workspace',
    prompt: `  [Verse]\nLa noche canta ${intent}\nkeep this line exact  `,
    alt_prompt: '  acoustic pop with brushed drums\nkeep caption exact  ',
    model_type: 'ace_step_v1_5_xl_sft_lm_4b',
    resolution: '1280x720',
    lyrics_language: 'es-MX',
    video_length: 0,
    num_inference_steps: 8,
    guidance_scale: 1,
    seed: -1,
    image_mode: 0,
    generation_mode: 'audio',
    _audio_sub_mode: 'music',
    negative_prompt: '',
    repeat_generation: 1,
    batch_size: 1,
    activated_loras: [],
    loras_multipliers: '',
    multi_prompts_gen_type: 2,
    audio_prompt_type: '',
    audio_guide: null,
    audio_guide2: null,
    audio_guide3: null,
    audio_guide4: null,
    audio_guide5: null,
    audio_guide6: null,
    audio_source: null,
    duration_seconds: 20,
    sample_solver: '',
    prompt_enhancer: '',
    custom_settings: null,
    _music_description: '  a literal night scene  ',
    _music_instrumental: false,
    _tts_speaker_name1: '',
    _tts_speaker_name2: '',
    _tts_speaker_name3: '',
    _tts_speaker_name4: '',
    _tts_speaker_name5: '',
    _tts_speaker_name6: '',
    _tts_voice_count: 0,
  }
}

function command(intent: string, overrides: Record<string, unknown> = {}) {
  return createStudioMusicGenerationCommand({ ...baseParams(intent), ...overrides }, intent)
}

function formState(params: Record<string, unknown>) {
  return {
    params,
    activeWorkspace: params.workspace,
    generationMode: 'audio',
    audioSubMode: 'music',
    durationSeconds: 20,
    musicDescription: params._music_description,
    musicInstrumental: false,
    settingsOpen: false,
    dashboardOpen: false,
    sidebarMode: 'studio',
  } as Parameters<typeof prepareStudioMusicSubmission>[1]
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
      operation: 'generation.music',
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

test('music ACK renders literal lyrics/caption before POST without adding speech voices', { concurrency: false }, async () => {
  const { render, screen, waitFor, cleanup, act } = await import('@testing-library/react')
  const params = baseParams('ack')
  const state = formState(params)
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = []
  globalThis.fetch = (async (input, init) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
    calls.push({ url, body })
    if (url.endsWith('/generation/commands')) return queuedResponse(body || {})
    throw new Error(`unexpected fetch: ${url}`)
  }) as typeof fetch
  render(<StudioMusicCommandPanel workspace="music-panel-workspace" model="ace_step_v1_5_xl_sft_lm_4b" visible onRecovered={async () => undefined} />)
  try {
    const prepared = await prepareStudioMusicSubmission(params, state, () => state, {
      actor: 'wizard', commandId: 'music-panel-ack',
    })
    let submission!: ReturnType<typeof prepared.submit>
    await act(async () => {
      submission = prepared.submit()
      await Promise.resolve()
    })
    await waitFor(() => {
      const text = screen.getByRole('status').textContent || ''
      assert.match(text, /La noche canta ack/)
      assert.match(text, /acoustic pop with brushed drums/)
      assert.match(text, /0 audio references · 0 LoRAs/)
    })
    assert.equal(calls.filter(call => call.url.endsWith('/generation/commands')).length, 0)

    await act(async () => { await flushAnimationFrames() })
    await submission
    const post = calls.find(call => call.url.endsWith('/generation/commands'))?.body
    const postedParams = (post?.input as Record<string, unknown>).params as Record<string, unknown>
    assert.equal(postedParams.prompt, params.prompt)
    assert.equal(postedParams.alt_prompt, params.alt_prompt)
    assert.equal(postedParams.lyrics_language, 'es-MX')
    assert.equal(postedParams.audio_guide, null)
    assert.equal(postedParams._tts_speaker_name1, '')
    assert.equal(postedParams._tts_voice_count, 0)
  } finally {
    cleanup()
  }
})

test('music context changes during visible ACK abort before admission and clear only the new hint', { concurrency: false }, async () => {
  const { render, screen, waitFor, cleanup, act } = await import('@testing-library/react')
  const params = baseParams('context')
  const state = formState(params)
  let generationCalls = 0
  globalThis.fetch = (async input => {
    if (String(input).endsWith('/generation/commands')) generationCalls += 1
    return jsonResponse({})
  }) as typeof fetch
  const view = render(<StudioMusicCommandPanel workspace="music-panel-workspace" model="ace_step_v1_5_xl_sft_lm_4b" visible onRecovered={async () => undefined} />)
  try {
    const prepared = await prepareStudioMusicSubmission(params, state, () => state, {
      actor: 'wizard', commandId: 'music-panel-context',
    })
    let submission!: ReturnType<typeof prepared.submit>
    await act(async () => { submission = prepared.submit() })
    const rejected = assert.rejects(submission, /changed before submission/i)
    await waitFor(() => assert.match(screen.getByRole('status').textContent || '', /La noche canta context/))
    view.rerender(<StudioMusicCommandPanel workspace="different-workspace" model="ace_step_v1_5_xl_sft_lm_4b" visible onRecovered={async () => undefined} />)
    await act(async () => { await flushAnimationFrames() })
    await rejected
    assert.equal(generationCalls, 0)
    assert.deepEqual(pendingMusicGenerationCommands(), [])
  } finally {
    cleanup()
  }
})

test('music recovery replays the stored command after reload without rebuilding from current form', { concurrency: false }, async () => {
  const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react')
  const saved = command('recovery')
  const bodies: Record<string, unknown>[] = []
  let calls = 0
  globalThis.fetch = (async (_input, init) => {
    calls += 1
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    bodies.push(body)
    if (calls === 1) throw new Error('response lost after admission')
    return queuedResponse(body)
  }) as typeof fetch
  try {
    await assert.rejects(submitMusicGenerationCommand(saved), /response lost after admission/)
    assert.deepEqual(pendingMusicGenerationCommands(), [saved])

    render(<StudioMusicCommandPanel workspace="music-panel-workspace" model="ace_step_v1_5_xl_sft_lm_4b" visible onRecovered={async () => undefined} />)
    await waitFor(() => screen.getByRole('button', { name: /Recover this/ }))
    // A changed form is intentionally absent here: recovery must use the
    // durable command and cannot reconstruct from Studio's current fields.
    fireEvent.click(screen.getByRole('button', { name: /Recover this/ }))
    await waitFor(() => assert.match(screen.getByRole('status').textContent || '', /Music admitted · job-recovery/))
    assert.equal(calls, 2)
    assert.deepEqual(bodies[1], bodies[0])
    assert.deepEqual(pendingMusicGenerationCommands(), [])
  } finally {
    cleanup()
  }
})

test('music summary presents null duration as the model default', { concurrency: false }, async () => {
  const { render, screen, waitFor, cleanup } = await import('@testing-library/react')
  const saved = command('default-duration', { duration_seconds: null })
  globalThis.fetch = (async () => { throw new Error('response lost after admission') }) as typeof fetch
  try {
    await assert.rejects(submitMusicGenerationCommand(saved), /response lost after admission/)
    render(<StudioMusicCommandPanel workspace="music-panel-workspace" model="ace_step_v1_5_xl_sft_lm_4b" visible onRecovered={async () => undefined} />)
    await waitFor(() => screen.getByText(/Model default duration/))
    assert.match(screen.getByText(/Model default duration/).textContent || '', /Model default duration/)
    assert.equal(screen.queryByText('nulls'), null)
  } finally {
    cleanup()
  }
})

test('MusicControls passes the selected native duration to the song writer', { concurrency: false }, async () => {
  const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react')
  const { MusicControls } = await import('../src/components/Sidebar/MusicControls.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const before = useStore.getState()
  const requests: Record<string, unknown>[] = []
  globalThis.fetch = (async (input, init) => {
    const url = String(input)
    if (!url.endsWith('/api/v1/llm/write-song')) throw new Error(`unexpected fetch: ${url}`)
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return jsonResponse({ style: 'native style', lyrics: '[Verse]\nNative lyrics', lyria_prompt: '', raw: '' })
  }) as typeof fetch
  useStore.setState({
    generationMode: 'audio',
    audioSubMode: 'music',
    durationSeconds: 5,
    musicDescription: 'A short native Studio song',
    musicInstrumental: false,
    params: {
      ...before.params,
      model_type: 'ace_step_v1_5_xl_sft_lm_4b',
      // Deliberately differs from the Studio slider. The old Story helper
      // read this stale field and rewrote the writer request to 20 seconds.
      duration_seconds: 19,
    },
  })
  try {
    render(<MusicControls />)
    fireEvent.click(screen.getByRole('button', { name: 'Write Song' }))
    await waitFor(() => assert.equal(requests.length, 1))
    assert.equal(requests[0].duration_seconds, 5)
  } finally {
    cleanup()
    useStore.setState(before)
  }
})

test('store startGeneration keeps real defaults and ignores stale speech and voice-clone state for music', { concurrency: false }, async () => {
  const { render, act } = await import('@testing-library/react')
  const { useStore } = await import('../src/stores/useStore.ts')
  const before = useStore.getState()
  const originalInterval = globalThis.setInterval
  const workspace = 'music-store-defaults'
  const intent = 'music-store-defaults-intent'
  const literalPrompt = '  [Verse]\nLínea con espacios  \nkeep this lyric exact  '
  const literalCaption = '  acoustic night pop\nkeep this caption exact  '
  const posts: Record<string, unknown>[] = []
  // The command ACK is the assertion target; avoid creating a live polling
  // timer for this provider-free store boundary test.
  globalThis.setInterval = (() => 0) as unknown as typeof setInterval
  globalThis.fetch = (async (input, init) => {
    const url = String(input)
    if (url.includes('/model-options/')) return jsonResponse({
      audio_only: true, fps: 25, guidance_max_phases: 1,
      default_num_inference_steps: 30, default_guidance_scale: 7,
      // Installed ACE XL SFT hides this setting while returning a default.
      flow_shift: false, default_flow_shift: 5,
      duration_slider: { min: 5, max: 360, default: 120 },
    })
    if (!url.endsWith('/generation/commands')) throw new Error(`unexpected fetch: ${url}`)
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    posts.push(body)
    return queuedResponse(body)
  }) as typeof fetch
  const params = {
    ...before.params,
    workspace,
    prompt: literalPrompt,
    alt_prompt: literalCaption,
    lyrics_language: 'es-MX',
    model_type: 'ace_step_v1_5_xl_sft_lm_4b',
    generation_mode: 'audio',
    _audio_sub_mode: 'music',
    _music_description: '  literal description  ',
    _music_instrumental: false,
    audio_prompt_type: '',
    audio_guide: null,
    audio_guide2: null,
    _tts_speaker_name1: '',
    _tts_speaker_name2: '',
    _tts_speaker_name3: '',
    _tts_speaker_name4: '',
    _tts_speaker_name5: '',
    _tts_speaker_name6: '',
    _tts_voice_count: 0,
  }
  useStore.setState({
    activeWorkspace: workspace,
    generationMode: 'audio',
    audioSubMode: 'music',
    modelOptions: null,
    params,
    durationSeconds: 20,
    musicDescription: '  literal description  ',
    musicInstrumental: false,
    jobs: [],
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
  })
  const view = render(<StudioMusicCommandPanel workspace={workspace} model="ace_step_v1_5_xl_sft_lm_4b" visible onRecovered={async () => undefined} />)
  try {
    await act(async () => {
      await useStore.getState().loadModelOptions('ace_step_v1_5_xl_sft_lm_4b')
      useStore.getState().setDurationSeconds(20)
    })
    assert.equal(useStore.getState().params.flow_shift, 5)
    const start = useStore.getState().startGeneration(undefined, { actor: 'user', commandId: intent })
    for (let pass = 0; pass < 10 && posts.length === 0; pass += 1) {
      await act(async () => {
        await Promise.resolve()
        await flushAnimationFrames()
      })
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    const receipt = await start
    assert.ok(receipt, useStore.getState().jobs.map(job => job.error || job.message).join("\n"))
    assert.equal(receipt?.result.job_id, `job-${intent}`)
    assert.equal(posts.length, 1)
    const posted = posts[0]
    const input = posted.input as Record<string, unknown>
    const submitted = input.params as Record<string, unknown>
    // These values come from the store's real defaultParams object and must
    // survive the music projection unless the music branch intentionally
    // changes them.
    assert.equal(submitted.resolution, '1280x720')
    assert.equal(submitted.num_inference_steps, 30)
    assert.equal(submitted.guidance_scale, 7)
    assert.equal(submitted.flow_shift, undefined)
    assert.equal(submitted.seed, -1)
    assert.equal(submitted.repeat_generation, 1)
    assert.equal(submitted.video_length, 0)
    assert.equal(submitted.image_mode, 0)
    assert.equal(submitted.duration_seconds, 20)
    assert.equal(submitted.prompt, literalPrompt)
    assert.equal(submitted.alt_prompt, literalCaption)
    assert.equal(submitted.lyrics_language, 'es-MX')
    // Inactive video cache defaults are deliberately projected away.
    assert.equal(submitted.skip_steps_cache_type, undefined)
    assert.equal(submitted.skip_steps_multiplier, undefined)
    assert.equal(submitted.skip_steps_start_step_perc, undefined)
    // Active legacy speech/clone state is not allowed to authorize or rewrite
    // a music request.
    assert.equal(submitted._tts_speaker_name1, '')
    assert.equal(submitted._tts_voice_count, 0)
    assert.equal(submitted.voice_clone_enabled, undefined)
    assert.equal(submitted.voice_clone_refs, undefined)
  } finally {
    view.unmount()
    globalThis.setInterval = originalInterval
    useStore.setState(before)
  }
})

test('Music form submission admits after leftover SFX prompt and weight', { concurrency: false }, async () => {
  const params = {
    ...baseParams('sfx-residue'),
    MMAudio_prompt: 'thunder crash on tin roof',
    MMAudio_neg_prompt: 'music',
    sfx_text_weight: 2.5,
    sfx_mode: true,
  }
  const state = formState(params)
  const prepared = await prepareStudioMusicSubmission(
    params, state, () => state, { actor: 'user', commandId: 'music-sfx-residue' },
  )
  assert.equal(prepared.params.prompt, params.prompt)
  assert.equal('MMAudio_prompt' in prepared.params, false)
  assert.equal('sfx_text_weight' in prepared.params, false)
})
