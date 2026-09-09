import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
  createStudioSpeechGenerationCommand,
  fetchSpeechGenerationCommandReceipt,
  pendingSpeechGenerationCommands,
  submitSpeechGenerationCommand,
  SpeechGenerationCommandError,
} = await import('../src/api/speechGenerationCommands.ts')
const {
  STUDIO_SPEECH_PARAM_KEYS,
  projectStudioSpeechFormParams: projectSpeechFormParams,
} = await import('../src/features/studio/speechGenerationSpec.ts')
const { neutralizeSfxOwnedFormFields } = await import('../src/features/studio/sfxFormResidue.ts')

const originalFetch = globalThis.fetch

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function nativeParams(): Record<string, unknown> {
  return JSON.parse(readFileSync(
    new URL('../../tests/fixtures/studio_speech_native_request.json', import.meta.url),
    'utf8',
  )) as Record<string, unknown>
}

function command(intentId = 'speech-ui-intent'): ReturnType<typeof createStudioSpeechGenerationCommand> {
  const params = nativeParams()
  const workspace = params.workspace
  delete params.workspace
  return createStudioSpeechGenerationCommand({
    ...params,
    workspace,
    provenance: { actor: 'wizard', workspace_id: 'speech-collection' },
  }, intentId)
}

function queuedReceipt(value: { intent_id: string; operation: string; input: { workspace: string } }) {
  return {
    receipt: {
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
        workspace: value.input.workspace,
        status: 'queued',
      },
      commandVersion: 2,
      fingerprintVersion: 2,
      contentFingerprint: 'a'.repeat(64),
    },
    replayed: false,
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

test('speech command is a detached closed catalog snapshot with original TTS text', { concurrency: false }, () => {
  const params = nativeParams()
  const workspace = params.workspace
  delete params.workspace
  const command = createStudioSpeechGenerationCommand({
    ...params,
    workspace,
    provenance: { actor: 'wizard', workspace_id: 'speech-collection' },
  }, ' speech-intent ')

  assert.equal(command.version, 2)
  assert.equal(command.operation, 'generation.speech')
  assert.equal(command.input.workspace, 'speech-test')
  assert.equal(command.input.workspace_collection_id, 'speech-collection')
  assert.equal(command.input.params._audio_sub_mode, 'speech')
  assert.equal(command.input.params._tts_original_prompt, 'The system is watching.\nEvery warning matters.')
  assert.equal(command.input.params.duration_seconds, 20)
  assert.ok(STUDIO_SPEECH_PARAM_KEYS.includes('duration_seconds'))
  assert.equal('workspace' in command.input.params, false)

  params.prompt = 'changed after freeze'
  assert.equal(command.input.params.prompt, 'The system is watching.\nEvery warning matters.')

  assert.throws(
    () => createStudioSpeechGenerationCommand({ ...nativeParams(), workspace: 'speech-test', unknown_native_key: true }, 'bad'),
    /unknown_native_key/,
  )
  assert.throws(
    () => createStudioSpeechGenerationCommand({ ...nativeParams(), workspace: 'speech-test', audio_guide: '/home/ina/private.wav' }, 'path'),
    /audio_guide/,
  )
  assert.throws(
    () => createStudioSpeechGenerationCommand({ ...nativeParams(), workspace: 'speech-test', generation_mode: 'image' }, 'mode'),
    /generation_mode/,
  )
})

test('Load Settings/reroll projects known video and H3 form residue without weakening the closed builder', { concurrency: false }, () => {
  const source = {
    ...nativeParams(),
    workspace: 'speech-test',
    provenance: { actor: 'wizard', workspace_id: 'speech-collection' },
    // Native inactive values are retained in the command snapshot.
    h3_ref_videos: [],
    h3_ref_audios: [],
    minimax_h3_references: [],
    minimax_h3_turbo_mode: false,
    // These are restored by Load Settings from a video/H3 sidecar, but are
    // UI controls outside the published speech parameter catalog.
    video_prompt_type: '',
    image_prompt_type: '',
    minimax_h3_planning_style: 'faithful',
    minimax_h3_audio_policy: 'native',
    minimax_h3_reference_sequence: false,
    minimax_h3_turbo_preset: 'standard',
    h3_reference_mode: 'first_frame',
    perturbation_switch: 0,
    perturbation_layers: [9],
    stg_scale: 1,
    voice_clone_enabled: true,
    voice_clone_refs: ['/tmp/private-voice.wav'],
  } as Record<string, unknown>

  const projection = projectSpeechFormParams(source)
  assert.deepEqual(projection.params.h3_ref_videos, [])
  assert.deepEqual(projection.params.h3_ref_audios, [])
  assert.deepEqual(projection.params.minimax_h3_references, [])
  assert.equal(projection.params.minimax_h3_turbo_mode, false)
  assert.equal(projection.params.duration_seconds, 20)
  assert.ok(projection.droppedFields.includes('minimax_h3_planning_style'))
  assert.ok(projection.droppedFields.includes('perturbation_layers'))
  assert.ok(projection.droppedFields.includes('voice_clone_refs'))
  assert.equal('minimax_h3_planning_style' in projection.params, false)
  assert.equal('perturbation_layers' in projection.params, false)
  assert.equal('voice_clone_refs' in projection.params, false)

  const projectedCommand = createStudioSpeechGenerationCommand(projection.params, 'speech-reroll')
  assert.equal(projectedCommand.input.params._tts_original_prompt, source._tts_original_prompt)

  // A direct command/MCP caller still cannot use the form projection as an
  // escape hatch: the closed builder rejects the same unknown field.
  assert.throws(
    () => createStudioSpeechGenerationCommand(
      { ...projection.params, minimax_h3_planning_style: 'faithful' },
      'speech-direct-unknown',
    ),
    /minimax_h3_planning_style/,
  )
})

test('Speech form adapter drops leftover SFX prompt and weight without opening the closed builder', { concurrency: false }, () => {
  const leftover = {
    ...nativeParams(),
    workspace: 'speech-test',
    MMAudio_prompt: 'thunder crash on tin roof',
    MMAudio_neg_prompt: 'music',
    MMAudio_setting: 1,
    sfx_text_weight: 2.5,
    sfx_mode: true,
    _mmaudio_variant: 'v2',
    _sfx_virtual_model: 'mmaudio_v2',
  }
  assert.throws(
    () => createStudioSpeechGenerationCommand(leftover, 'speech-sfx-direct'),
    /MMAudio_prompt|sfx_text_weight|sfx_mode/,
  )
  const command = createStudioSpeechGenerationCommand(
    projectSpeechFormParams(neutralizeSfxOwnedFormFields(leftover)).params,
    'speech-sfx-form',
  )
  assert.equal(command.input.params.prompt, leftover.prompt)
  assert.equal('MMAudio_prompt' in command.input.params, false)
  assert.equal('sfx_text_weight' in command.input.params, false)
  assert.equal('sfx_mode' in command.input.params, false)
})

test('speech admission persists exact envelope before POST and validates typed v2 receipt', { concurrency: false }, async () => {
  const value = command('speech-submit')
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return response(queuedReceipt(value))
  }
  let sawPending = false
  const receipt = await submitSpeechGenerationCommand(value, {
    submissionContext: { actor: 'wizard', workflowId: 'speech-workflow' },
    onSnapshotReady: snapshot => {
      sawPending = pendingSpeechGenerationCommands('speech-test').length === 1
      assert.deepEqual(snapshot, value)
    },
  })
  assert.equal(sawPending, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.url.endsWith('/api/v1/generation/commands'), true)
  assert.deepEqual(bodyOf(calls[0]?.init), value)
  assert.equal((calls[0]?.init?.headers as Record<string, string>)['X-Hocus-UI-Surface'], 'wizard')
  assert.equal(receipt.operation, 'generation.speech')
  assert.equal(receipt.result.job_id, 'job-speech-submit')
  assert.deepEqual(pendingSpeechGenerationCommands(), [])
})

test('an uncertain speech response retries the same intent and command', { concurrency: false }, async () => {
  const value = command('speech-retry')
  const bodies: Record<string, unknown>[] = []
  let attempt = 0
  globalThis.fetch = async (_url, init) => {
    bodies.push(bodyOf(init))
    attempt += 1
    if (attempt === 1) throw new Error('connection lost after admission')
    return response(queuedReceipt(value))
  }
  await assert.rejects(
    submitSpeechGenerationCommand(value),
    error => error instanceof SpeechGenerationCommandError && error.uncertain,
  )
  assert.deepEqual(pendingSpeechGenerationCommands(), [value])
  const recovered = await submitSpeechGenerationCommand(value)
  assert.equal(recovered.result.task_id, 'task-speech-retry')
  assert.deepEqual(bodies, [value, value])
  assert.deepEqual(pendingSpeechGenerationCommands(), [])
})

test('receipt recovery retains speech v2 fingerprint requirements', { concurrency: false }, async () => {
  const value = command('speech-receipt')
  globalThis.fetch = async () => { throw new Error('connection lost') }
  await assert.rejects(submitSpeechGenerationCommand(value), /connection lost/)
  globalThis.fetch = async (url) => {
    assert.match(String(url), /receipt\?workspace=speech-test&intent_id=speech-receipt/)
    return response(queuedReceipt(value))
  }
  const recovered = await fetchSpeechGenerationCommandReceipt('speech-test', value.intent_id)
  assert.equal(recovered.operation, 'generation.speech')
  assert.deepEqual(pendingSpeechGenerationCommands(), [])
})
