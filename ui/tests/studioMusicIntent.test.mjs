import assert from 'node:assert/strict'
import test from 'node:test'

const musicRequest = [
  'Use the configured local music provider to run exactly one Studio music generation now with model_type="ace_step_v1_5_xl_sft_lm_4b".',
  'Prepare one song with audio_sub_mode="music" and preserve these literal fields exactly:',
  'Lyrics/prompt (including line breaks):',
  '[Verse]',
  'The city listens',
  'Every light replies',
  'Native alt_prompt (including line breaks):',
  'Soft drums, luminous synths.',
  'A quiet chorus.',
  'Native music_description: A supervisor watches the city.',
  'Use duration_seconds=20, seed=20260909, repeat_generation=1, batch_size=1, music_instrumental=false.',
  'This is an explicit execution request: start one generation in output workspace mcp-p5-music-20260909-live; no image/video generation, no second action, and no retry after an uncertain admission.',
].join('\n')

const badVideoTurn = {
  reply: 'I prepared Studio video.',
  actions: [
    { type: 'prepare_video', prompt: 'an invented video', durationSeconds: 5, resolutionPreset: '720p', aspectRatio: '16:9' },
    { type: 'start_generation', confirm: true },
  ],
}

test('recognizes the literal Studio music execution request and repairs a video misroute', async () => {
  const { isExplicitAudioGenerationRequest, reconcileAgentTurnWithRequest } = await import('../src/features/agent/agentActions.ts')

  assert.equal(isExplicitAudioGenerationRequest(musicRequest), true)
  const repaired = await reconcileAgentTurnWithRequest(musicRequest, badVideoTurn)
  assert.deepEqual(repaired.actions.map(action => action.type), ['prepare_audio', 'start_generation'])
  assert.equal(repaired.actions[0].subMode, 'music')
  assert.equal(repaired.actions[0].prompt, '[Verse]\nThe city listens\nEvery light replies')
  assert.equal(repaired.actions[0].altPrompt, 'Soft drums, luminous synths.\nA quiet chorus.')
})

test('accepts explicit English and Spanish Studio music commands', async () => {
  const { isExplicitAudioGenerationRequest } = await import('../src/features/agent/agentActions.ts')
  for (const request of [
    'Run one Studio music generation now.',
    'Execute one music track in Studio Audio.',
    'Generate a song in Studio → Audio now.',
    'Ejecuta una generación de música en Studio → Audio ahora.',
    'En Studio Audio genera una canción vocal de prueba.',
  ]) {
    assert.equal(isExplicitAudioGenerationRequest(request), true, request)
  }
})

test('keeps educational, negated, Story and music-video requests out of Studio generation', async () => {
  const { isExplicitAudioGenerationRequest, reconcileAgentTurnWithRequest } = await import('../src/features/agent/agentActions.ts')
  for (const request of [
    'Explain how to generate music in Studio Audio.',
    'How can I generate music in Studio Audio?',
    'What model should I choose to generate music in Studio Audio?',
    'Explícame cómo generar música en Studio Audio.',
    'No generes música en Studio Audio.',
    'Genera una canción heavy metal en Story Lab.',
    'Run a music video in Studio.',
  ]) {
    assert.equal(isExplicitAudioGenerationRequest(request), false, request)
    const result = await reconcileAgentTurnWithRequest(request, { reply: 'I will generate it.', actions: [] })
    assert.deepEqual(result.actions, [], request)
  }
})

test('restores explicitly bounded Music fields after a provider collapses newlines', async () => {
  const { reconcileAgentTurnWithRequest } = await import('../src/features/agent/agentActions.ts')
  const action = { type: 'prepare_audio', subMode: 'music', prompt: 'rewritten lyrics',
    altPrompt: 'Soft drums, luminous synths. A quiet chorus.', musicDescription: 'rewritten description', seed: 42 }
  const repaired = await reconcileAgentTurnWithRequest(musicRequest, { reply: 'Prepared', actions: [action] })
  assert.equal(repaired.actions[0].prompt, '[Verse]\nThe city listens\nEvery light replies')
  assert.equal(repaired.actions[0].altPrompt, 'Soft drums, luminous synths.\nA quiet chorus.')
  assert.equal(repaired.actions[0].musicDescription, 'A supervisor watches the city.')
  assert.equal(repaired.actions[0].seed, 42)
  assert.equal(action.prompt, 'rewritten lyrics')
})

test('literal Music recovery preserves spaces and declines ambiguous or unbounded blocks', async () => {
  const { restoreAuthoredMusicFields: restore } = await import('../src/features/agent/audioActionParser.ts')
  const action = { type: 'prepare_audio', subMode: 'music', prompt: 'initial', altPrompt: 'initial caption' }
  const request = 'prompt:\n  authored lyrics  \n\nalt_prompt:\n  caption\r\nwith lines  \nmusic_description: metadata'
  assert.equal(restore(request, action).prompt, '  authored lyrics  \n')
  assert.equal(restore(request, action).altPrompt, '  caption\r\nwith lines  ')
  assert.deepEqual(restore('alt_prompt:\nambiguous prose with no end marker', action), action)
  assert.equal(restore('prompt: first\nprompt: second', action), action)
  const speech = { ...action, subMode: 'speech' }
  assert.equal(restore(request, speech), speech)
})
