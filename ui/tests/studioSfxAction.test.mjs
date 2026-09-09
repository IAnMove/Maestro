import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent })
window.matchMedia = () => ({ matches: false })

const { parseAgentTurn } = await import('../src/features/agent/agentActions.ts')
const { getCapability } = await import('../src/features/agent/capabilityRegistry.ts')
const { prepareAudio } = await import('../src/features/studio/actions.ts')
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
      loadModelOptions: async () => { throw new Error('SFX has no carrier model options') },
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
