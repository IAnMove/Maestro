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
  ImageGenerationCommandError,
  createStudioImageGenerationCommand,
  fetchImageGenerationCommandReceipt,
  pendingImageGenerationCommands,
  submitImageGenerationCommand,
} = await import('../src/api/imageGenerationCommands.ts')
const { STUDIO_IMAGE_PARAM_KEYS } = await import('../src/features/studio/generationSpec.ts')

const originalFetch = globalThis.fetch

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function baseParams(intent = 'studio-v2-intent'): Record<string, unknown> {
  return {
    workspace: 'workspace_v2',
    prompt: 'literal line one\nliteral line two',
    model_type: 'pi_flux2',
    resolution: '512x512',
    num_inference_steps: 4,
    guidance_scale: 1,
    seed: -1,
    image_mode: 1,
    video_length: 1,
    generation_mode: 'image',
    negative_prompt: '',
    repeat_generation: 1,
    batch_size: 1,
    activated_loras: [],
    loras_multipliers: '',
    minimax_h3_turbo_mode: false,
    image_refs: ['asset_subject_' + intent],
    image_start: ['/api/v1/uploads/start.png'],
    image_end: '/api/v1/file/end.png?workspace=workspace_v2',
    image_guide: 'asset_guide_' + intent,
    image_mask: null,
    canonical_image_refs: false,
    audio_prompt_type: '',
    temporal_upsampling: '',
    video_guide: null,
    video_mask: null,
    force_fps: '',
    custom_settings: {
      noise_scale_start: 0.1,
      noise_scale_end: 0.2,
      noise_clip_std: null,
    },
    wangp_processor_settings: {
      spatial_upsampler_strength: 0.5,
      spatial_upsampler_reference_images: ['asset_processor_' + intent],
    },
  }
}

function queuedReceipt(command: { intent_id: string; operation: string; input: { workspace: string } }) {
  return {
    receipt: {
      version: 1,
      commandId: command.intent_id,
      operation: command.operation,
      status: 'queued',
      entities: [],
      artifacts: [],
      taskIds: ['task-' + command.intent_id],
      pipelineIds: [],
      result: {
        job_id: 'job-' + command.intent_id,
        task_id: 'task-' + command.intent_id,
        workspace: command.input.workspace,
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

test('v2 builder preserves the complete typed native map and detaches metadata', { concurrency: false }, () => {
  const source = baseParams()
  source.provenance = {
    actor: 'wizard',
    workspace_id: 'collection_v2',
    command: { command_id: 'spoofed' },
  }
  source.runtime = { workspace: 'other-workspace', params: { prompt: 'spoofed' } }
  source.client = { actor: 'external_agent' }
  const command = createStudioImageGenerationCommand(source, 'studio-v2-intent')

  assert.equal(command.version, 2)
  assert.equal(command.operation, 'generation.image')
  assert.equal(command.intent_id, 'studio-v2-intent')
  assert.equal(command.input.workspace, 'workspace_v2')
  assert.equal(command.input.workspace_collection_id, 'collection_v2')
  assert.equal('workspace' in command.input.params, false)
  assert.equal('provenance' in command.input.params, false)
  assert.equal('runtime' in command.input.params, false)
  assert.equal('client' in command.input.params, false)
  assert.equal(command.input.params.prompt, 'literal line one\nliteral line two')
  assert.equal(command.input.params.image_end, '/api/v1/file/end.png?workspace=workspace_v2')
  assert.equal(command.input.params.minimax_h3_turbo_mode, false)
  assert.deepEqual(command.input.params.custom_settings, source.custom_settings)
  assert.deepEqual(command.input.params.wangp_processor_settings, source.wangp_processor_settings)

  source.prompt = 'mutated after build'
  ;(source.custom_settings as Record<string, unknown>).noise_scale_start = 0.9
  assert.equal(command.input.params.prompt, 'literal line one\nliteral line two')
  assert.equal(
    (command.input.params.custom_settings as Record<string, unknown>).noise_scale_start,
    0.1,
  )
  assert.equal(STUDIO_IMAGE_PARAM_KEYS.includes('custom_settings'), true)
  assert.equal(STUDIO_IMAGE_PARAM_KEYS.includes('wangp_processor_settings'), true)
  assert.equal(STUDIO_IMAGE_PARAM_KEYS.includes('minimax_h3_turbo_mode'), true)
})

test('the captured native Studio request fixture remains a valid v2 snapshot', { concurrency: false }, () => {
  const fixture = JSON.parse(readFileSync(
    new URL('../../tests/fixtures/studio_image_native_request.json', import.meta.url),
    'utf8',
  )) as Record<string, unknown>
  const command = createStudioImageGenerationCommand(fixture, 'fixture-v2-intent')

  assert.equal(command.input.workspace, 'studio-fixture-workspace')
  assert.equal(command.input.params.minimax_h3_turbo_mode, false)
  assert.equal(command.input.params.prompt, fixture.prompt)
  assert.equal('provenance' in command.input.params, false)
})

test('v2 builder omits Load Settings and primary-settings leftovers instead of blocking Generate', { concurrency: false }, () => {
  const source = baseParams('reroll-leftovers')
  source.minimax_h3_planning_style = 'faithful'
  source.minimax_h3_audio_policy = 'native'
  source.minimax_h3_reference_sequence = false
  source.minimax_h3_turbo_preset = 'standard'
  source.duration_seconds = 0
  source.pause_seconds = 0
  source.perturbation_switch = 0
  source.perturbation_layers = [9]
  source.stg_scale = 1
  source.keyframe_conditioning_mode = 'replace'
  source.keyframe_inject_mode = 'additive'
  source.speakers_locations = '0:45 55:100'
  source.viggle_audio_mode = ''
  source.attention_sparsity = 0
  source.video_guide2 = ''
  source.voice_clone_enabled = true
  source.voice_clone_mode = 'in_place'
  source.voice_clone_refs = ['/tmp/voice.wav']
  const command = createStudioImageGenerationCommand(source, 'reroll-leftovers')

  assert.equal(command.input.params.prompt, source.prompt)
  assert.equal(command.input.params.model_type, source.model_type)
  assert.equal(command.input.workspace, source.workspace)
  assert.equal('minimax_h3_planning_style' in command.input.params, false)
  assert.equal('duration_seconds' in command.input.params, false)
  assert.equal('perturbation_layers' in command.input.params, false)
  assert.equal('voice_clone_enabled' in command.input.params, false)
  assert.equal('speakers_locations' in command.input.params, false)
  assert.equal('viggle_audio_mode' in command.input.params, false)
})

test('v2 builder requires canonical references and rejects envelope injection', { concurrency: false }, () => {
  const legacyPath = baseParams('legacy')
  legacyPath.image_refs = ['/tmp/legacy.png']
  assert.throws(() => createStudioImageGenerationCommand(legacyPath, 'legacy-ref'), /canonical media URL/)

  const traversalPath = baseParams('traversal')
  traversalPath.image_refs = ['/api/v1/file/a/../secret.png?workspace=workspace_v2']
  assert.throws(() => createStudioImageGenerationCommand(traversalPath, 'traversal-ref'), /canonical media URL/)

  const duplicateWorkspace = baseParams('duplicate-workspace')
  duplicateWorkspace.image_refs = ['/api/v1/file/ref.png?workspace=workspace_v2&workspace=workspace_v2']
  assert.throws(() => createStudioImageGenerationCommand(duplicateWorkspace, 'duplicate-workspace-ref'), /canonical media URL/)

  const injected = baseParams('injected')
  injected.params = { prompt: 'nested envelope' }
  assert.throws(() => createStudioImageGenerationCommand(injected, 'injected'), /envelope field params/)

  const wrongMode = baseParams('wrong-mode')
  wrongMode.generation_mode = 'video'
  assert.throws(() => createStudioImageGenerationCommand(wrongMode, 'wrong-mode'), /generation_mode/)

  const activeTurbo = baseParams('active-turbo')
  activeTurbo.minimax_h3_turbo_mode = true
  assert.throws(() => createStudioImageGenerationCommand(activeTurbo, 'active-turbo'), /minimax_h3_turbo_mode/)

  const activeAudio = baseParams('active-audio')
  activeAudio.MMAudio_setting = 1
  assert.throws(() => createStudioImageGenerationCommand(activeAudio, 'active-audio'), /MMAudio_setting/)
})

test('v2 submit posts the exact detached envelope, declares the UI surface, and keeps v1 receipt shape', { concurrency: false }, async () => {
  const command = createStudioImageGenerationCommand(baseParams('submit'), 'submit-v2')
  let requestHeaders: Headers | Record<string, string> | undefined
  let requestBody: Record<string, unknown> | undefined
  globalThis.fetch = (async (_input, init) => {
    requestHeaders = init?.headers as Record<string, string>
    requestBody = bodyOf(init)
    assert.deepEqual(pendingImageGenerationCommands(), [command])
    return response(queuedReceipt(command))
  }) as typeof fetch

  const receipt = await submitImageGenerationCommand(command, {
    submissionContext: {
      actor: 'wizard',
      commandId: command.intent_id,
      workflowId: 'workflow-42',
      runId: 'run-7',
    },
  })

  assert.deepEqual(requestBody, command)
  assert.equal((requestHeaders as Record<string, string>)['X-Hocus-UI-Surface'], 'wizard')
  assert.equal(
    (requestHeaders as Record<string, string>)['X-Hocus-UI-Context'],
    JSON.stringify({ workflowId: 'workflow-42', runId: 'run-7' }),
  )
  assert.equal(receipt.version, 1)
  assert.equal(receipt.commandVersion, 2)
  assert.equal(receipt.fingerprintVersion, 2)
  assert.equal(receipt.contentFingerprint, 'a'.repeat(64))
  assert.deepEqual(pendingImageGenerationCommands(), [])
})

test('a v2 command cannot accept a legacy or partial fingerprint receipt', { concurrency: false }, async () => {
  const command = createStudioImageGenerationCommand(baseParams('v2-receipt'), 'v2-receipt')
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    const legacy = queuedReceipt(command)
    delete (legacy.receipt as Record<string, unknown>).commandVersion
    return response(legacy)
  }) as typeof fetch

  await assert.rejects(
    submitImageGenerationCommand(command),
    error => error instanceof ImageGenerationCommandError
      && error.code === 'invalid_receipt'
      && error.uncertain,
  )
  assert.equal(calls, 1)
  assert.deepEqual(pendingImageGenerationCommands(), [command])

  const partial = createStudioImageGenerationCommand(baseParams('v2-partial'), 'v2-partial')
  globalThis.fetch = (async () => {
    const receipt = queuedReceipt(partial)
    delete (receipt.receipt as Record<string, unknown>).fingerprintVersion
    return response(receipt)
  }) as typeof fetch
  await assert.rejects(submitImageGenerationCommand(partial), error =>
    error instanceof ImageGenerationCommandError && error.code === 'invalid_receipt')
  assert.deepEqual(pendingImageGenerationCommands(), [partial, command])
})

test('invalid UI context fails before the pending hint or POST and never truncates IDs', { concurrency: false }, async () => {
  const command = createStudioImageGenerationCommand(baseParams('context-invalid'), 'context-invalid')
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return response(queuedReceipt(command))
  }) as typeof fetch

  await assert.rejects(
    submitImageGenerationCommand(command, {
      submissionContext: { actor: 'wizard', workflowId: 'x'.repeat(201) },
    }),
    error => error instanceof ImageGenerationCommandError
      && error.code === 'invalid_submission_context'
      && !error.uncertain,
  )
  assert.equal(calls, 0)
  assert.deepEqual(pendingImageGenerationCommands(), [])
})

test('a context snapshot write failure leaves no admission hint or POST', { concurrency: false }, async () => {
  const command = createStudioImageGenerationCommand(baseParams('context-storage-failure'), 'context-storage-failure')
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return response(queuedReceipt(command))
  }) as typeof fetch
  const storagePrototype = Object.getPrototypeOf(dom.window.localStorage) as Storage
  const originalSetItem = storagePrototype.setItem
  Object.defineProperty(storagePrototype, 'setItem', {
    configurable: true,
    value: (key: string, value: string) => {
      if (key.includes('image-command-context')) throw new Error('context quota exhausted')
      return originalSetItem.call(dom.window.localStorage, key, value)
    },
  })
  try {
    await assert.rejects(
      submitImageGenerationCommand(command, { submissionContext: { actor: 'wizard' } }),
      error => error instanceof ImageGenerationCommandError
        && error.code === 'pending_storage_failed'
        && !error.uncertain,
    )
    assert.equal(calls, 0)
    assert.deepEqual(pendingImageGenerationCommands(), [])
    assert.equal(localStorage.length, 0)
  } finally {
    Object.defineProperty(storagePrototype, 'setItem', {
      configurable: true,
      value: originalSetItem,
    })
  }
})

test('an uncertain retry reuses the persisted UI context after the caller reloads', { concurrency: false }, async () => {
  const command = createStudioImageGenerationCommand(baseParams('context-recovery'), 'context-recovery')
  let calls = 0
  let retryHeaders: Record<string, string> | undefined
  globalThis.fetch = (async (_input, init) => {
    calls += 1
    if (calls === 2) retryHeaders = init?.headers as Record<string, string>
    if (calls === 1) throw new Error('response lost after admission')
    return response(queuedReceipt(command))
  }) as typeof fetch

  await assert.rejects(submitImageGenerationCommand(command, {
    submissionContext: {
      actor: 'wizard', workflowId: 'workflow-reload', runId: 'run-reload',
    },
  }))
  // A real reload reconstructs the command from storage and has no in-memory
  // context object. The stored attribution must still be sent on the retry.
  await submitImageGenerationCommand(command)
  assert.equal(retryHeaders?.['X-Hocus-UI-Surface'], 'wizard')
  assert.equal(
    retryHeaders?.['X-Hocus-UI-Context'],
    JSON.stringify({ workflowId: 'workflow-reload', runId: 'run-reload' }),
  )
  assert.equal(localStorage.length, 0)
})

test('a recovery cannot overwrite its original UI attribution', { concurrency: false }, async () => {
  const command = createStudioImageGenerationCommand(baseParams('context-conflict'), 'context-conflict')
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    throw new Error('response lost after admission')
  }) as typeof fetch
  await assert.rejects(submitImageGenerationCommand(command, {
    submissionContext: { actor: 'wizard', workflowId: 'workflow-original' },
  }))

  await assert.rejects(
    submitImageGenerationCommand(command, {
      submissionContext: { actor: 'user', workflowId: 'workflow-replacement' },
    }),
    error => error instanceof ImageGenerationCommandError
      && error.code === 'submission_context_conflict'
      && error.uncertain,
  )
  assert.equal(calls, 1)
  assert.deepEqual(pendingImageGenerationCommands(), [command])
  assert.equal(localStorage.length, 2)
})

test('receipt recovery uses the stored v2 version when validating a GET', { concurrency: false }, async () => {
  const command = createStudioImageGenerationCommand(baseParams('v2-get'), 'v2-get')
  globalThis.fetch = (async () => { throw new Error('response lost') }) as typeof fetch
  await assert.rejects(submitImageGenerationCommand(command))
  assert.deepEqual(pendingImageGenerationCommands(), [command])

  globalThis.fetch = (async input => {
    assert.match(String(input), /\/receipt\?workspace=workspace_v2&intent_id=v2-get$/)
    const legacy = queuedReceipt(command)
    delete (legacy.receipt as Record<string, unknown>).commandVersion
    return response(legacy)
  }) as typeof fetch
  await assert.rejects(
    fetchImageGenerationCommandReceipt('workspace_v2', 'v2-get'),
    error => error instanceof ImageGenerationCommandError
      && error.code === 'invalid_receipt'
      && error.uncertain,
  )
  assert.deepEqual(pendingImageGenerationCommands(), [command])
})

test('snapshot hook sees durable pending state but cannot mutate the posted copy', { concurrency: false }, async () => {
  const command = createStudioImageGenerationCommand(baseParams('hook'), 'hook-v2')
  let requestBody: Record<string, unknown> | undefined
  let hookSawPending = false
  globalThis.fetch = (async (_input, init) => {
    requestBody = bodyOf(init)
    return response(queuedReceipt(command))
  }) as typeof fetch

  await submitImageGenerationCommand(command, {
    onSnapshotReady: async snapshot => {
      hookSawPending = pendingImageGenerationCommands().length === 1
      snapshot.input.params.prompt = 'hook mutation must not escape'
      await Promise.resolve()
    },
  })

  assert.equal(hookSawPending, true)
  assert.equal((requestBody?.input as Record<string, unknown>).params
    && ((requestBody?.input as Record<string, unknown>).params as Record<string, unknown>).prompt,
  'literal line one\nliteral line two')
  assert.deepEqual(pendingImageGenerationCommands(), [])
})

test('a new snapshot hook failure is certain, makes no POST, and removes its new hint', { concurrency: false }, async () => {
  const command = createStudioImageGenerationCommand(baseParams('hook-failure'), 'hook-failure-v2')
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return response(queuedReceipt(command))
  }) as typeof fetch

  await assert.rejects(
    submitImageGenerationCommand(command, {
      onSnapshotReady: () => { throw new Error('panel closed') },
    }),
    error => error instanceof ImageGenerationCommandError
      && error.code === 'snapshot_hook_failed'
      && !error.uncertain,
  )
  assert.equal(calls, 0)
  assert.deepEqual(pendingImageGenerationCommands(), [])
})

test('a recovery hook failure preserves the uncertain hint until the same intention succeeds', { concurrency: false }, async () => {
  const command = createStudioImageGenerationCommand(baseParams('recovery-hook'), 'recovery-hook-v2')
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    if (calls === 1) throw new Error('response lost after admission')
    return response(queuedReceipt(command))
  }) as typeof fetch

  await assert.rejects(submitImageGenerationCommand(command), error => error instanceof ImageGenerationCommandError && error.uncertain)
  await assert.rejects(
    submitImageGenerationCommand(command, { onSnapshotReady: () => { throw new Error('panel unavailable') } }),
    error => error instanceof ImageGenerationCommandError
      && error.code === 'snapshot_hook_failed'
      && !error.uncertain,
  )
  assert.equal(calls, 1)
  assert.deepEqual(pendingImageGenerationCommands(), [command])

  const receipt = await submitImageGenerationCommand(command)
  assert.equal(receipt.replayed, false)
  assert.equal(calls, 2)
  assert.deepEqual(pendingImageGenerationCommands(), [])
})

test('a changed v2 command cannot reuse an uncertain intention', { concurrency: false }, async () => {
  const original = createStudioImageGenerationCommand(baseParams('conflict'), 'same-v2-intent')
  const changedParams = baseParams('conflict')
  changedParams.prompt = 'changed literal'
  const changed = createStudioImageGenerationCommand(changedParams, 'same-v2-intent')
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    throw new Error('transport lost')
  }) as typeof fetch

  await assert.rejects(submitImageGenerationCommand(original))
  await assert.rejects(
    submitImageGenerationCommand(changed),
    error => error instanceof ImageGenerationCommandError && error.code === 'intent_conflict',
  )
  assert.equal(calls, 1)
  assert.deepEqual(pendingImageGenerationCommands(), [original])
})

test('unsafe JSON and unsafe nested settings never cross the v2 boundary', { concurrency: false }, () => {
  const nonFinite = baseParams('unsafe-number')
  nonFinite.top_p = Number.NaN
  assert.throws(() => createStudioImageGenerationCommand(nonFinite, 'unsafe-number'), /finito|finite|JSON|number/i)

  const cyclicSettings = baseParams('unsafe-cycle')
  const settings = cyclicSettings.custom_settings as Record<string, unknown>
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  settings.noise_scale_start = cycle
  assert.throws(() => createStudioImageGenerationCommand(cyclicSettings, 'unsafe-cycle'), /circular|cycle|JSON|nested/i)

  const unknownSettings = baseParams('unsafe-settings')
  unknownSettings.custom_settings = { provider_payload: 'must reject' }
  assert.throws(() => createStudioImageGenerationCommand(unknownSettings, 'unsafe-settings'), /not supported/)
})
