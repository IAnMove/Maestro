import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent })
window.matchMedia = () => ({ matches: false })

const { parseAgentTurn } = await import('../src/features/agent/agentActions.ts')
const { getCapability } = await import('../src/features/agent/capabilityRegistry.ts')
const { prepareAudio, queueSfxPack } = await import('../src/features/studio/actions.ts')
const { useStore } = await import('../src/stores/useStore.ts')
const guide = '/api/v1/file/guide.mp4?workspace=source'
const literal = '  Rain on a tin roof.\nKeep this exact.  '
const rawAction = { type: 'prepare_audio', audio_sub_mode: 'sfx', model_type: 'mmaudio_v2',
  prompt: literal, negative_prompt: '', duration_seconds: 3, seed: 20260909,
  inference_steps: 25, guidance_scale: 4.5, output_count: 1, sfx_text_weight: 1.2 }
const parse = raw => parseAgentTurn(JSON.stringify({ reply: 'Prepared', actions: [raw] })).actions[0]

async function withStudio(callback) {
  const before = useStore.getState()
  try {
    useStore.setState({ modelsLoaded: true,
      models: [{ model_type: 'mmaudio_v2', name: 'MMAudio v2', family: 'audio', is_downloaded: true }],
      activeWorkspace: 'sfx-output', generationMode: 'audio', audioSubMode: 'speech',
      params: { ...before.params, model_type: 'mmaudio_v2', prompt: 'old',
        video_guide: guide, seed: 8, repeat_generation: 4, MMAudio_neg_prompt: 'old negative' },
      durationSeconds: 120,
      setGenerationMode: mode => useStore.setState({ generationMode: mode }),
      setAudioSubMode: subMode => useStore.setState({ audioSubMode: subMode }),
      loadModelOptions: before.loadModelOptions,
    })
    await callback()
  } finally { useStore.setState(before) }
}

test('Wizard SFX capability shares its parser and preserves literal fields through preparation', async () => {
  const action = parse({ ...rawAction, video_guide: guide })
  const capability = getCapability('prepare_audio')
  assert.deepEqual(capability.resolve({ ...rawAction, video_guide: guide }), action)
  assert.equal(action.prompt, literal)
  assert.equal(action.negativePrompt, '')
  assert.equal(action.videoGuide, guide)
  assert.equal(action.sfxTextWeight, 1.2)
  assert.equal(action.seed, 20260909)
  const withLanguage = { ...action, languageIntent: { conversationLanguage: 'es',
    contentLanguage: 'es', technicalPromptLanguage: 'en', verbatimSegments: [] } }
  assert.equal(await capability.prepare(withLanguage), withLanguage)
  assert.ok(capability.parameters.includes('video_guide'))
  assert.ok(capability.parameters.includes('sfx_text_weight'))
})

test('SFX parser rejects unsupported controls and unsafe guides instead of clamping', () => {
  for (const invalid of [
    { duration_seconds: 0 }, { duration_seconds: 21, video_guide: null },
    { seed: 1.5 }, { guidance_scale: -1 }, { inference_steps: 24 }, { output_count: 2 },
    { sfx_text_weight: 5.1 }, { video_guide: '' }, { video_guide: '/tmp/guide.mp4' },
    { video_guide: 'https://example.com/guide.mp4' },
  ]) assert.equal(parse({ ...rawAction, ...invalid }), undefined, JSON.stringify(invalid))
})

test('SFX preparation applies native controls, retains an omitted guide and explicitly clears null', async () => {
  await withStudio(async () => {
    await prepareAudio(parse(rawAction))
    let state = useStore.getState()
    assert.equal(state.audioSubMode, 'sfx')
    assert.equal(state.params.prompt, literal)
    assert.equal(state.params.MMAudio_prompt, literal)
    assert.equal(state.params.MMAudio_neg_prompt, '')
    assert.equal(state.params.seed, 20260909)
    assert.equal(state.params.guidance_scale, 4.5)
    assert.equal(state.params.num_inference_steps, 25)
    assert.equal(state.params.repeat_generation, 1)
    assert.equal(state.params.sfx_text_weight, 1.2)
    assert.equal(state.params.video_guide, guide)
    assert.equal(state.durationSeconds, 3)
    await prepareAudio(parse({ ...rawAction, video_guide: null }))
    state = useStore.getState()
    assert.equal(state.params.video_guide, undefined)
    assert.equal(state.params.MMAudio_neg_prompt, '')
  })
})

test('SFX preparation validates the effective guide before any form mutation', async () => {
  await withStudio(async () => {
    const long = parse({ ...rawAction, duration_seconds: 21 })
    // An omitted guide may preserve a video; only the server probes its duration.
    await prepareAudio(long)
    assert.equal(useStore.getState().durationSeconds, 21)
    useStore.getState().setParams({ video_guide: undefined })
    const before = useStore.getState()
    await assert.rejects(prepareAudio(long), /duration/i)
    assert.equal(useStore.getState(), before)
    await assert.rejects(prepareAudio({ ...parse(rawAction), videoGuide: '' }), /video_guide/i)
    assert.equal(useStore.getState(), before)
  })
})

for (const settleWithFailure of [false, true]) {
  test(`entering SFX clears H3 constraints and ignores a late options ${settleWithFailure ? 'failure' : 'response'}`, async () => {
    const before = useStore.getState()
    const fetchBefore = globalThis.fetch
    let finish
    const options = { fps: 30, frames_minimum: 155, frames_maximum: 601,
      guidance_max_phases: 1, default_guidance_scale: 7 }
    const requests = []
    globalThis.fetch = async url => {
      if (String(url).endsWith('/model-selections')) return new Response('{}', { headers: { 'content-type': 'application/json' } })
      requests.push(String(url))
      assert.match(String(url), /model-options.*minimax_h3/)
      return new Promise((resolve, reject) => {
        finish = () => settleWithFailure ? reject(new Error('late request failed'))
          : resolve(new Response(JSON.stringify(options), { headers: { 'content-type': 'application/json' } }))
      })
    }
    try {
      useStore.setState({ generationMode: 'video', audioSubMode: 'speech', modelsLoaded: true,
        models: [{ model_type: 'mmaudio_v2', name: 'MMAudio v2', family: 'tts', is_downloaded: true }],
        selectedModelPerAudioSubMode: {}, selectedModelPerMode: { audio: 'mmaudio_v2' }, activeWorkspace: 'sfx-output',
        params: { ...before.params, model_type: 'minimax_h3', video_guide: guide },
        modelOptions: options, durationSeconds: 5.166666666666667 })
      const pending = useStore.getState().loadModelOptions('minimax_h3')
      assert.equal(useStore.getState().modelOptionsLoading, true)
      await prepareAudio(parse(rawAction))
      assert.equal(useStore.getState().modelOptions, null)
      assert.equal(useStore.getState().modelOptionsLoading, false)
      assert.equal(useStore.getState().durationSeconds, 3)
      assert.equal(useStore.getState().params.video_guide, guide)
      const prepared = useStore.getState()
      finish()
      await pending
      assert.equal(useStore.getState(), prepared, 'obsolete completion must not mutate the SFX form')
      assert.equal(requests.length, 1, 'MMAudio must not fetch backend options or LoRAs')
      // Returning to Audio with its persisted virtual selection must also clear
      // options without relying on setAudioSubMode changing the sub-tab.
      useStore.setState({ generationMode: 'video', modelOptions: options,
        selectedModelPerMode: { audio: 'mmaudio_v2' } })
      useStore.getState().setGenerationMode('audio')
      assert.equal(useStore.getState().modelOptions, null)
      assert.equal(requests.length, 1)
    } finally {
      globalThis.fetch = fetchBefore
      useStore.setState(before)
    }
  })
}

test('queue_sfx_pack mints a unique generation.sfx intent for each clip', async () => {
  await withStudio(async () => {
    const seen = []
    useStore.setState({
      jobs: [],
      loadModelOptions: async () => undefined,
      startGeneration: async (_scheduled, context) => {
        seen.push(context?.commandId)
        const job = { id: `job-${seen.length}`, status: 'queued' }
        useStore.setState(state => ({ jobs: [job, ...state.jobs] }))
      },
    })
    await queueSfxPack({
      type: 'queue_sfx_pack',
      confirm: true,
      clips: [
        { name: 'hit', prompt: 'impact', durationSeconds: 2 },
        { name: 'whoosh', prompt: 'whoosh', durationSeconds: 3 },
        { name: 'hit-again', prompt: 'impact', durationSeconds: 2 },
      ],
      modelType: 'mmaudio_v2',
    }, { actor: 'wizard', capability: 'queue_sfx_pack', commandId: 'pack-intent' })
    assert.equal(seen.length, 3)
    assert.equal(new Set(seen).size, 3)
    assert.ok(seen.every(id => typeof id === 'string' && id.length > 0 && id !== 'pack-intent'))
  })
})
