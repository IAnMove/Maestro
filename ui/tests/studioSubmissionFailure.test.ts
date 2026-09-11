import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareStudioSubmission } from '../src/features/studio/studioSubmission.ts'
import { prepareStudioSubmission as prepareImage, translateLegacyImageGuides } from '../src/features/studio/imageCommandSubmission.ts'

const originalFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = originalFetch })

function state(mode: string, params: Record<string, unknown>) {
  return { generationMode: mode, params, activeWorkspace: 'command-qa', imageRefs: [] } as Parameters<typeof prepareStudioSubmission>[1]
}

test('a missing image chunk produces a failed submission for the existing job error path', async () => {
  const params = { prompt: 'Keep my request', workspace: 'command-qa' }
  const before = state('image', params)
  const failure = new Error('Failed to fetch dynamically imported module')
  let requests = 0
  globalThis.fetch = async () => { requests += 1; throw new Error('Unexpected POST') }
  const submission = await prepareStudioSubmission(params, before, () => before, undefined, [], async () => { throw failure })
  assert.deepEqual(submission.params, params)
  await assert.rejects(submission.submit, error => error === failure)
  assert.equal(requests, 0)
})

test('video submits through its native API without loading image code', async () => {
  const params = { prompt: 'literal\nsecond line', generation_mode: 'video', workspace: 'command-qa' }
  const before = state('video', params)
  let loads = 0
  let sent: unknown
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(String(options?.body))
    return new Response(JSON.stringify({ job_id: 'native-job', status: 'queued' }), { status: 200 })
  }
  const submission = await prepareStudioSubmission(params, before, () => before, undefined, [], async () => {
    loads += 1
    throw new Error('Image chunk unavailable')
  })
  const result = await submission.submit()
  assert.equal(result.job_id, 'native-job')
  assert.equal(loads, 0)
  assert.deepEqual(sent, params)
})

function audioState(subMode: string, params: Record<string, unknown>) {
  return { ...state('audio', params), audioSubMode: subMode } as Parameters<typeof prepareStudioSubmission>[1]
}

for (const subMode of ['mixer', '', undefined]) {
  test(`audio ${subMode === undefined ? 'without a sub-mode' : `tab ${JSON.stringify(subMode)}`} does not fall back to the legacy GPU endpoint`, async () => {
    const params = {
      prompt: 'leftover speech lyrics',
      model_type: 'kugelaudio_0_open',
      generation_mode: 'audio',
      workspace: 'command-qa',
      _audio_sub_mode: subMode ?? 'mixer',
    }
    const before = subMode === undefined ? state('audio', params) : audioState(subMode, params)
    let requests = 0
    globalThis.fetch = async () => { requests += 1; throw new Error('Unexpected POST') }
    const submission = await prepareStudioSubmission(params, before, () => before)
    await assert.rejects(submission.submit, /does not start a generation|no inicia una generación/)
    assert.equal(requests, 0)
  })
}

test('startGeneration refuses Mixer before creating a job or POSTing', { concurrency: false }, async () => {
  const { useStore } = await import('../src/stores/useStore.ts')
  const before = useStore.getState()
  let requests = 0
  globalThis.fetch = async () => { requests += 1; throw new Error('Unexpected POST') }
  useStore.setState({
    generationMode: 'audio',
    audioSubMode: 'mixer',
    params: { ...before.params, model_type: 'kugelaudio_0_open', prompt: 'leftover speech lyrics' },
    jobs: [],
    llmStatus: { ...before.llmStatus, loaded: false },
  })
  try {
    await assert.rejects(
      () => useStore.getState().startGeneration(),
      /does not start a generation|no inicia una generación/,
    )
    assert.equal(useStore.getState().jobs.length, 0)
    assert.equal(requests, 0)
  } finally {
    useStore.setState(before)
  }
})

test('legacy image control and mask fields are translated in the detached V2 snapshot', async () => {
  const params = { workspace: 'command-qa', prompt: 'Use this control image literally', model_type: 'pi_flux2',
    resolution: '512x512', num_inference_steps: 4, seed: 42, guidance_scale: 1,
    video_guide: '/api/v1/uploads/control.png', video_mask: '/api/v1/uploads/mask.png', video_prompt_type: 'VA' }
  const before = state('image', params)
  let resolutions = 0
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /generation\/commands\/references$/)
    resolutions += 1
    const body = JSON.parse(String(options?.body))
    return new Response(JSON.stringify({ references: body.references }), { status: 200 })
  }
  const submission = await prepareImage(params, before, () => before)
  assert.equal(submission.params.image_guide, params.video_guide)
  assert.equal(submission.params.image_mask, params.video_mask)
  assert.equal(submission.params.video_guide, undefined)
  assert.equal(submission.params.video_mask, undefined)
  assert.equal(params.video_guide, '/api/v1/uploads/control.png')
  assert.equal(resolutions, 1)
})

test('Load Settings leftovers do not block image command preparation', async () => {
  const params = {
    workspace: 'command-qa', prompt: 'Reroll this image literally', model_type: 'pi_flux2',
    resolution: '512x512', num_inference_steps: 4, seed: 42, guidance_scale: 1,
    image_mode: 1, video_length: 1, generation_mode: 'image',
    minimax_h3_planning_style: 'faithful', minimax_h3_audio_policy: 'native',
    duration_seconds: 0, perturbation_switch: 0, perturbation_layers: [9], stg_scale: 1,
    speakers_locations: '0:45 55:100', voice_clone_enabled: true,
  }
  const before = state('image', params)
  const submission = await prepareImage(params, before, () => before)
  assert.equal(submission.params.prompt, params.prompt)
  assert.equal(submission.params.workspace, params.workspace)
  assert.equal(submission.params.minimax_h3_planning_style, undefined)
  assert.equal(submission.params.duration_seconds, undefined)
  assert.equal(submission.params.voice_clone_enabled, undefined)
})

test('an unreviewed native field still fails image preparation instead of being silently omitted', async () => {
  const params = {
    workspace: 'command-qa', prompt: 'Reject a typo literally', model_type: 'pi_flux2',
    resolution: '512x512', num_inference_steps: 4, seed: 42, guidance_scale: 1,
    image_mode: 1, video_length: 1, generation_mode: 'image', guidance_scal: 1,
  }
  const before = state('image', params)
  const submission = await prepareImage(params, before, () => before)
  await assert.rejects(submission.submit, /input\.params\.guidance_scal is not supported/)
})

test('two different legacy and image guides fail instead of silently discarding one', () => {
  const params = { video_guide: '/api/v1/uploads/one.png', image_guide: '/api/v1/uploads/two.png' }
  assert.throws(() => translateLegacyImageGuides(params))
  assert.equal(params.video_guide, '/api/v1/uploads/one.png')
  assert.equal(params.image_guide, '/api/v1/uploads/two.png')
})
