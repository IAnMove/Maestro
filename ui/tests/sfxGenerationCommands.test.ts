import assert from 'node:assert/strict'
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
  SfxGenerationCommandError,
  createStudioSfxGenerationCommand,
  pendingSfxGenerationCommands,
  submitSfxGenerationCommand,
} = await import('../src/api/sfxGenerationCommands.ts')
const {
  projectStudioSfxFormParams,
} = await import('../src/features/studio/sfxGenerationSpec.ts')

const originalFetch = globalThis.fetch

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function baseParams(intent = 'sfx-command'): Record<string, unknown> {
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

function command(intent = 'sfx-command') {
  return createStudioSfxGenerationCommand({
    ...baseParams(intent),
    provenance: { actor: 'wizard', workspace_id: 'sfx-collection' },
  }, intent)
}

function queuedReceipt(value: { intent_id: string; operation: string; input: { workspace: string } }) {
  const taskId = `task-${value.intent_id}`
  return {
    receipt: {
      version: 1,
      commandId: value.intent_id,
      operation: value.operation,
      status: 'queued',
      entities: [],
      artifacts: [],
      taskIds: [taskId],
      pipelineIds: [],
      result: {
        job_id: `job-${value.intent_id}`,
        task_id: taskId,
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

test('SFX command keeps literal params, collection provenance and canonical source workspace detached', { concurrency: false }, () => {
  const source = baseParams('literal')
  source.video_guide = '/api/v1/file/guide.mp4?workspace=source-video'
  const value = createStudioSfxGenerationCommand({
    ...source,
    provenance: { actor: 'wizard', workspace_id: 'sfx-collection' },
  }, 'sfx-literal')

  assert.equal(value.version, 2)
  assert.equal(value.operation, 'generation.sfx')
  assert.equal(value.input.workspace, 'sfx-output')
  assert.equal(value.input.workspace_collection_id, 'sfx-collection')
  assert.equal(value.input.params.video_guide, '/api/v1/file/guide.mp4?workspace=source-video')
  assert.equal(value.input.params.MMAudio_prompt, source.MMAudio_prompt)
  assert.equal('workspace' in value.input.params, false)
  assert.equal('provenance' in value.input.params, false)

  source.prompt = 'changed after freeze'
  source.MMAudio_neg_prompt = 'changed after freeze'
  assert.equal(value.input.params.prompt, '  rain on a tin roof literal\nkeep this line exact  ')
  assert.equal(value.input.params.MMAudio_neg_prompt, '  music, speech  ')

  const unknown = baseParams('unknown')
  unknown.voice_clone_enabled = true
  assert.throws(
    () => createStudioSfxGenerationCommand(unknown, 'sfx-unknown'),
    /voice_clone_enabled is not supported|voice_clone_enabled/,
  )

  const badReference = baseParams('bad-reference')
  badReference.video_guide = '/tmp/guide.mp4'
  assert.throws(
    () => createStudioSfxGenerationCommand(badReference, 'sfx-bad-reference'),
    /video_guide.*canonical video URL or asset ID/,
  )

  const inactive = baseParams('inactive')
  inactive.sfx_mode = false
  assert.throws(
    () => createStudioSfxGenerationCommand(inactive, 'sfx-inactive'),
    /SFX mode must be active/,
  )
})

test('invalid SFX params are rejected before transport or pending storage', { concurrency: false }, async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return response({})
  }
  const invalid = command('invalid-submit')
  ;(invalid.input.params as Record<string, unknown>).unknown_native_field = true
  await assert.rejects(
    submitSfxGenerationCommand(invalid as ReturnType<typeof command>),
    /unknown_native_field is not supported|unknown_native_field/,
  )
  assert.equal(calls, 0)
  assert.deepEqual(pendingSfxGenerationCommands(), [])
})

test('canonical source workspace remains in the exact posted SFX envelope', { concurrency: false }, async () => {
  const value = command('source-workspace')
  value.input.params.video_guide = '/api/v1/file/guide.mp4?workspace=source-video'
  const bodies: Record<string, unknown>[] = []
  globalThis.fetch = async (_url, init) => {
    bodies.push(bodyOf(init))
    return response(queuedReceipt(value))
  }

  const receipt = await submitSfxGenerationCommand(value)
  assert.equal(receipt.result.workspace, 'sfx-output')
  assert.equal(bodies.length, 1)
  const postedInput = bodies[0]?.input as Record<string, unknown>
  const postedParams = postedInput.params as Record<string, unknown>
  assert.equal(postedInput.workspace, 'sfx-output')
  assert.equal(postedParams.video_guide, '/api/v1/file/guide.mp4?workspace=source-video')
  assert.equal('workspace' in postedParams, false)
})

test('uncertain SFX admission retries the same detached intent and command', { concurrency: false }, async () => {
  const value = command('retry')
  const bodies: Record<string, unknown>[] = []
  let calls = 0
  globalThis.fetch = async (_url, init) => {
    bodies.push(bodyOf(init))
    calls += 1
    if (calls === 1) throw new Error('connection lost after admission')
    return response({ ...queuedReceipt(value), replayed: true })
  }

  await assert.rejects(
    submitSfxGenerationCommand(value),
    error => error instanceof SfxGenerationCommandError && error.uncertain,
  )
  assert.deepEqual(pendingSfxGenerationCommands(), [value])

  const recovered = await submitSfxGenerationCommand(value)
  assert.equal(recovered.result.task_id, 'task-retry')
  assert.equal(recovered.replayed, true)
  assert.deepEqual(bodies, [value, value])
  assert.deepEqual(pendingSfxGenerationCommands(), [])
})

test('an explicitly blank prompt alias cannot override the other literal', () => {
  for (const field of ['prompt', 'MMAudio_prompt']) {
    for (const blank of ['', ' ', '\n']) {
      const params = { ...baseParams(), [field]: blank }
      assert.throws(() => createStudioSfxGenerationCommand(params, 'blank-alias'), /prompt|description/i)
      assert.equal(params[field], blank)
    }
  }
})

test('Studio SFX form residue drops leftover Speech/Music lyrics when the SFX box is empty', () => {
  const leftover = {
    workspace: 'sfx-output',
    prompt: 'Speaker 1: leftover speech lyrics for a song',
    model_type: 'mmaudio_v2',
    duration_seconds: 15,
    generation_mode: 'audio',
    _audio_sub_mode: 'sfx',
    image_mode: 0,
    video_length: 0,
    MMAudio_setting: 1,
    sfx_mode: true,
    num_inference_steps: 25,
  }
  const cleaned = projectStudioSfxFormParams(leftover)
  assert.equal('prompt' in cleaned, false)
  assert.equal('MMAudio_prompt' in cleaned, false)
  assert.throws(
    () => createStudioSfxGenerationCommand(cleaned, 'leftover-speech'),
    /literal sound description is required/,
  )

  const authored = projectStudioSfxFormParams({
    ...leftover,
    MMAudio_prompt: 'rain on tin',
  })
  const command = createStudioSfxGenerationCommand(authored, 'authored-sfx')
  assert.equal(command.input.params.MMAudio_prompt, 'rain on tin')
  assert.equal(command.input.params.prompt, 'rain on tin')
})

test('direct SFX envelopes still admit a prompt-only MCP payload', () => {
  const params = { ...baseParams('mcp-prompt-only') }
  delete params.MMAudio_prompt
  const command = createStudioSfxGenerationCommand(params, 'mcp-prompt-only')
  assert.equal(command.input.params.prompt, params.prompt)
  assert.equal(command.input.params.MMAudio_prompt, undefined)
})
