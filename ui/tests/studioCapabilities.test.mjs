import assert from 'node:assert/strict'
import test from 'node:test'

async function registeredStudioCapabilities() {
  const { registerStudioCapabilities } = await import('../src/features/agent/studioCapabilities.ts')
  const definitions = []
  registerStudioCapabilities(definition => {
    definitions.push(definition)
    return definition
  })
  return new Map(definitions.map(definition => [definition.name, definition]))
}

test('registers the complete Studio family behind one injected registrar', async () => {
  const definitions = await registeredStudioCapabilities()
  assert.deepEqual([...definitions.keys()], [
    'prepare_video',
    'prepare_image',
    'prepare_audio',
    'prepare_3d',
    'queue_sfx_pack',
    'start_generation',
    'attach_studio_references',
    'configure_studio_loras',
    'download_model',
  ])
  assert.equal(definitions.get('prepare_video').presentation.destination, 'studio')
  assert.equal(definitions.get('prepare_video').report.successState, 'prepared')
  assert.equal(definitions.get('queue_sfx_pack').confirmation, 'required')
})
test('resolves Studio forms with bounded, canonical camelCase actions', async () => {
  const definitions = await registeredStudioCapabilities()

  const video = definitions.get('prepare_video').resolve({
    type: 'prepare_video',
    prompt: '  un castillo flotante  ',
    model_type: 'video-model',
    duration_seconds: 7.5,
    resolution_preset: '720p',
    aspect_ratio: '16:9',
    resolution: '1280x720',
    seed: 42,
    inference_steps: 28,
    guidance_scale: 6.5,
    output_count: 2,
    audio_direction: 'trueno grave',
    turbo: 'on',
    ignored: 'drop me',
  })
  assert.deepEqual(video, {
    type: 'prepare_video',
    prompt: 'un castillo flotante',
    modelType: 'video-model',
    durationSeconds: 7.5,
    resolutionPreset: '720p',
    resolution: '1280x720',
    aspectRatio: '16:9',
    negativePrompt: undefined,
    seed: 42,
    inferenceSteps: 28,
    guidanceScale: 6.5,
    outputCount: 2,
    audioDirection: 'trueno grave',
    turbo: true,
  })
  assert.deepEqual(definitions.get('prepare_video').validate(video), [])
  assert.equal(definitions.get('prepare_video').resolve({ type: 'prepare_video', prompt: '' }), null)

  const audio = definitions.get('prepare_audio').resolve({
    type: 'prepare_audio', audio_sub_mode: 'music', prompt: 'heavy metal vocal en español', duration_seconds: 75,
  })
  assert.deepEqual(audio, {
    type: 'prepare_audio', subMode: 'music', prompt: 'heavy metal vocal en español', modelType: undefined,
    durationSeconds: 75, negativePrompt: undefined,
    altPrompt: undefined, musicDescription: undefined, musicInstrumental: undefined,
    seed: undefined, inferenceSteps: undefined, guidanceScale: undefined, outputCount: undefined,
  })

  const model3d = definitions.get('prepare_3d').resolve({
    type: 'prepare_3d', prompt: 'un mago con capa', preset: 'cinematic', seed: 12,
  })
  assert.deepEqual(model3d, {
    type: 'prepare_3d', prompt: 'un mago con capa', modelType: undefined, preset: 'cinematic', seed: 12,
  })
})

test('keeps compute confirmation and exact reference/LoRA semantics', async () => {
  const definitions = await registeredStudioCapabilities()
  const sfx = definitions.get('queue_sfx_pack')
  assert.equal(sfx.resolve({ type: 'queue_sfx_pack', confirm: false, sfx_clips: [{ name: 'hit', prompt: 'hit' }] }), null)
  const pack = sfx.resolve({
    type: 'queue_sfx_pack', confirm: true, visual_style: 'arcade', sfx_clips: [
      { name: 'hit', prompt: 'impact', duration_seconds: 3 },
      { name: '', prompt: 'ignored' },
    ],
  })
  assert.deepEqual(pack, {
    type: 'queue_sfx_pack', style: 'arcade', clips: [{ name: 'hit', prompt: 'impact', durationSeconds: 3 }],
    modelType: undefined, negativePrompt: undefined, confirm: true,
  })
  assert.deepEqual(sfx.validate(pack), [])

  const references = definitions.get('attach_studio_references').resolve({
    type: 'attach_studio_references', reference_output_names: ['a.webp', 'b.webp'], reference_role: 'style',
    replace_existing: false, remove_background: true,
  })
  assert.deepEqual(references, {
    type: 'attach_studio_references', outputNames: ['a.webp', 'b.webp'], role: 'style',
    replaceExisting: false, removeBackground: true,
  })

  const clearLoras = definitions.get('configure_studio_loras').resolve({
    type: 'configure_studio_loras', loras: [], replace_existing: true,
  })
  assert.deepEqual(clearLoras, { type: 'configure_studio_loras', loras: [], replaceExisting: true })
  assert.deepEqual(definitions.get('configure_studio_loras').validate(clearLoras), [])
  assert.equal(definitions.get('configure_studio_loras').resolve({ type: 'configure_studio_loras', loras: [] }), null)
})

test('image preparation preserves literal prompts and language metadata without appending instructions', async () => {
  const definitions = await registeredStudioCapabilities()
  const definition = definitions.get('prepare_image')
  const prompt = '  A blue origami octopus.\nNo text or watermark.  '
  const negative = '  blur\nextra letters  '
  const languageIntent = { contentLanguage: 'en', technicalPromptLanguage: 'en',
    verbatimSegments: [{ kind: 'visible_text', text: prompt, language: 'en' }] }
  const parsed = definition.resolve({ type: 'prepare_image', prompt, negative_prompt: negative,
    model_type: 'flux2_klein_9b', guidance_scale: -1 })
  assert.equal(parsed.prompt, prompt)
  assert.equal(parsed.negativePrompt, negative)
  assert.equal(parsed.guidanceScale, undefined, 'unspecified CFG keeps the selected model default')
  const prepared = await definition.prepare({ ...parsed, languageIntent })
  let received
  await definition.execute(prepared, { adapters: { studio: { async prepareImage(action) {
    received = action
    return { message: 'Prepared' }
  } } } })
  assert.equal(received.prompt, prompt)
  assert.equal(received.negativePrompt, negative)
  assert.deepEqual(received.languageIntent, languageIntent)
})

test('image prompts are accepted intact or rejected rather than silently truncated', async () => {
  const definition = (await registeredStudioCapabilities()).get('prepare_image')
  const prompt = 'x'.repeat(10_000) + '\nfin'
  assert.equal(definition.resolve({ type: 'prepare_image', prompt }).prompt, prompt)
  assert.equal(definition.resolve({ type: 'prepare_image', prompt: 'x'.repeat(200_001) }), null)
  assert.equal(definition.resolve({ type: 'prepare_image', prompt, negative_prompt: 'x'.repeat(200_001) }), null)
})

test('speech preparation preserves authored multiline text, language metadata and native duration', async () => {
  const definitions = await registeredStudioCapabilities()
  const definition = definitions.get('prepare_audio')
  const prompt = '  Buenos días, Tentri.\nLee este diagnóstico exactamente.  '
  const negative = '  No añadas una despedida.\nConserva los saltos.  '
  const languageIntent = {
    contentLanguage: 'es', technicalPromptLanguage: 'es',
    verbatimSegments: [{ kind: 'spoken_text', text: prompt, language: 'es' }],
  }

  const parsedAtZero = definition.resolve({ type: 'prepare_audio', audio_sub_mode: 'speech',
    prompt, negative_prompt: negative, model_type: 'kugelaudio_0_open', duration_seconds: 0 })
  assert.equal(parsedAtZero.prompt, prompt)
  assert.equal(parsedAtZero.negativePrompt, negative)
  assert.equal(parsedAtZero.durationSeconds, 0)

  const parsedAtSixty = definition.resolve({ type: 'prepare_audio', audio_sub_mode: 'speech',
    prompt, model_type: 'kugelaudio_0_open', duration_seconds: 60 })
  assert.equal(parsedAtSixty.durationSeconds, 60)

  const prepared = await definition.prepare({ ...parsedAtSixty, languageIntent })
  assert.equal(prepared.prompt, prompt)
  assert.equal(prepared.negativePrompt, undefined)
  assert.deepEqual(prepared.languageIntent, languageIntent)

  let received
  await definition.execute(prepared, { adapters: { studio: { async prepareAudio(action) {
    received = action
    return { message: 'Prepared speech' }
  } } } })
  assert.equal(received.prompt, prompt)
  assert.deepEqual(received.languageIntent, languageIntent)
  assert.equal(definition.resolve({ type: 'prepare_audio', audio_sub_mode: 'speech',
    prompt: 'x'.repeat(200_001) }), null)
  assert.equal(definition.resolve({ type: 'prepare_audio', audio_sub_mode: 'speech',
    prompt, negative_prompt: 'x'.repeat(200_001) }), null)
})

test('music preparation keeps literal lyrics/caption/description and native controls separate', async () => {
  const definition = (await registeredStudioCapabilities()).get('prepare_audio')
  const lyrics = '  [Verse]\nA line with 9,000 characters.\n' + 'la '.repeat(3_000) + '  '
  const caption = '  acoustic pop\nbright brushed drums  '
  const description = '  A nocturnal harbor at blue hour.\nNo spoken voice.  '
  const languageIntent = {
    contentLanguage: 'en', technicalPromptLanguage: 'en',
    verbatimSegments: [{ kind: 'sung_lyrics', text: lyrics, language: 'en' }],
  }
  const action = definition.resolve({
    type: 'prepare_audio', audio_sub_mode: 'music', prompt: lyrics, alt_prompt: caption,
    music_description: description, music_instrumental: false,
    model_type: 'ace_step_v1_5_xl_sft_lm_4b', duration_seconds: 5,
    seed: 1234, inference_steps: 24, guidance_scale: 1.7, output_count: 1,
  })
  assert.equal(action.prompt, lyrics)
  assert.equal(action.altPrompt, caption)
  assert.equal(action.musicDescription, description)
  assert.equal(action.musicInstrumental, false)
  assert.equal(action.durationSeconds, 5)
  assert.equal(action.seed, 1234)
  assert.equal(action.inferenceSteps, 24)
  assert.equal(action.guidanceScale, 1.7)
  assert.equal(action.outputCount, 1)

  const prepared = await definition.prepare({ ...action, languageIntent })
  assert.equal(prepared.prompt, lyrics)
  assert.equal(prepared.altPrompt, caption)
  assert.equal(prepared.musicDescription, description)
  assert.deepEqual(prepared.languageIntent, languageIntent)

  let received
  await definition.execute(prepared, { adapters: { studio: { async prepareAudio(value) {
    received = value
    return { message: 'Prepared music' }
  } } } })
  assert.equal(received.prompt, lyrics)
  assert.equal(received.altPrompt, caption)
  assert.equal(received.musicDescription, description)
  assert.equal(received.musicInstrumental, false)
  assert.equal(received.inferenceSteps, 24)
  assert.equal(received.guidanceScale, 1.7)
  assert.deepEqual(received.languageIntent, languageIntent)
  assert.equal(definition.resolve({ type: 'prepare_audio', audio_sub_mode: 'music', prompt: lyrics,
    alt_prompt: 'x'.repeat(200_001) }), null)
  assert.equal(definition.resolve({ type: 'prepare_audio', audio_sub_mode: 'music', prompt: lyrics,
    music_description: 'x'.repeat(200_001) }), null)
})
