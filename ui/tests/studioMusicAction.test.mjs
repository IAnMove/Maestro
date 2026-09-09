import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
})
window.matchMedia = () => ({ matches: false })

test('Wizard Music action schema and parser retain the authored fields', async () => {
  const { HOCUSPOCUS_AGENT_RESPONSE_SCHEMA, parseAgentTurn } = await import('../src/features/agent/agentActions.ts')
  const lyrics = '  [Verse]\nA literal line.\n  '
  const caption = '  acoustic pop\nbright drums  '
  const description = '  Night harbor, blue hour.  '
  const turn = parseAgentTurn(JSON.stringify({
    reply: 'I will prepare Music.',
    actions: [{
      type: 'prepare_audio', audio_sub_mode: 'music', prompt: lyrics, alt_prompt: caption,
      music_description: description, music_instrumental: true,
      model_type: 'ace_step_v1_5_xl_sft_lm_4b', duration_seconds: 5,
      seed: 1234, inference_steps: 24, guidance_scale: 1.7, output_count: 1,
    }],
  }))
  assert.equal(turn.actions.length, 1)
  assert.deepEqual(turn.actions[0], {
    type: 'prepare_audio', subMode: 'music', prompt: lyrics,
    modelType: 'ace_step_v1_5_xl_sft_lm_4b', durationSeconds: 5,
    negativePrompt: undefined, altPrompt: caption, musicDescription: description,
    musicInstrumental: true, seed: 1234, inferenceSteps: 24, guidanceScale: 1.7, outputCount: 1,
  })

  const properties = HOCUSPOCUS_AGENT_RESPONSE_SCHEMA.properties.actions.items.properties
  assert.deepEqual(properties.alt_prompt, { type: 'string', maxLength: 200_000 })
  assert.deepEqual(properties.music_description, { type: 'string', maxLength: 200_000 })
  assert.deepEqual(properties.music_instrumental, { type: 'boolean' })
})

test('prepareAudio applies Music fields to the visible native form without rewriting text', async () => {
  const { prepareAudio } = await import('../src/features/studio/actions.ts')
  const { useStore } = await import('../src/stores/useStore.ts')
  const before = useStore.getState()
  const targetModel = {
    model_type: 'ace_step_v1_5_xl_sft_lm_4b', name: 'ACE-Step', family: 'audio',
    is_downloaded: true,
  }
  try {
    useStore.setState({
      modelsLoaded: true,
      models: [targetModel],
      generationMode: 'audio',
      audioSubMode: 'speech',
      params: {
        ...before.params,
        model_type: targetModel.model_type,
        prompt: 'old lyrics',
        alt_prompt: 'old caption',
        repeat_generation: 4,
      },
      durationSeconds: 120,
      musicDescription: 'old description',
      musicInstrumental: true,
      loadModelOptions: async () => {},
      setGenerationMode: mode => useStore.setState({ generationMode: mode }),
      setAudioSubMode: subMode => useStore.setState({ audioSubMode: subMode }),
    })

    const lyrics = '  [Verse]\nKeep this line literal.\n  '
    const caption = '  acoustic pop\nbright brushed drums  '
    const description = '  A nocturnal harbor at blue hour.  '
    await prepareAudio({
      subMode: 'music',
      prompt: lyrics,
      altPrompt: caption,
      musicDescription: description,
      musicInstrumental: false,
      modelType: targetModel.model_type,
      durationSeconds: 5,
      seed: 1234,
      inferenceSteps: 24,
      guidanceScale: 1.7,
      outputCount: 1,
    })

    const after = useStore.getState()
    assert.equal(after.generationMode, 'audio')
    assert.equal(after.audioSubMode, 'music')
    assert.equal(after.durationSeconds, 5)
    assert.equal(after.params.prompt, lyrics)
    assert.equal(after.params.alt_prompt, caption)
    assert.equal(after.musicDescription, description)
    assert.equal(after.musicInstrumental, false)
    assert.equal(after.params.seed, 1234)
    assert.equal(after.params.num_inference_steps, 24)
    assert.equal(after.params.guidance_scale, 1.7)
    assert.equal(after.params.repeat_generation, 1)
  } finally {
    useStore.setState(before)
  }
})
