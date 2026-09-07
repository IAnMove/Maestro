import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent })
dom.window.setTimeout = ((callback: () => void) => { queueMicrotask(callback); return 0 }) as typeof dom.window.setTimeout

const { useStore } = await import('../src/stores/useStore')
const { generateReplacementFrame, replacementImageModels, submitReplacementVideo, waitForReplacementVideo } = await import('../src/features/characterReplacement/generation')
const { generateImageAsset } = await import('../src/lib/imageGeneration')

const models = [{ model_type: 'flux2_klein_9b', architecture: 'flux2_klein_9b', family: 'flux', supports_ref_images: true, is_downloaded: false },
  { model_type: 'unsupported', architecture: 'other', family: 'flux', supports_ref_images: true },
  { model_type: 'viggle_animate', architecture: 'viggle_animate', family: 'h3_advanced', supports_ref_images: true }]
const frameOptions = { sourceFrameURL: '/api/v1/uploads/frame.png', characterURL: '/api/v1/file/person.png?workspace=demo',
  prompt: 'Replace only the character.\nKeep “¡Hola!” exactly.', workspace: 'demo', resolution: '1080x1920' }
const completed = { job_id: 'frame-job', task_id: 'task-frame', root_task_id: 'root-frame', status: 'completed',
  progress: 100, output_files: ['exact-result.png'], error: null }

function fixture(fetcher: typeof fetch) {
  const initial = useStore.getState()
  const previousFetch = globalThis.fetch
  useStore.setState({ models: models as never, activeWorkspace: 'different-active-workspace',
    params: { ...initial.params, model_type: 'viggle_animate', video_guide: 'stale-video', spatial_upsampling: 'stale-upscaler' },
    savedParamsPerMode: { image: { num_inference_steps: 99, prompt: 'stale' } },
    loadOutputs: async () => {} })
  globalThis.fetch = fetcher
  return () => { globalThis.fetch = previousFetch; useStore.setState(initial) }
}

test('Replacement frame submits ordered canonical references once with clean defaults, literal prompt and task identity', async () => {
  const requests: Array<{ url: string; body?: Record<string, unknown> }> = []
  const jobs: string[] = [], statuses: string[] = []
  const close = fixture(async (input, init) => {
    const url = String(input)
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url.includes('/defaults/')) return Response.json({ num_inference_steps: 4, resolution: '1024x1024' })
    if (url === '/api/v1/generate') return Response.json({ job_id: 'frame-job', task_id: 'task-frame', root_task_id: 'root-frame' })
    if (url === '/api/v1/status/frame-job') return Response.json(completed)
    throw new Error(`Unexpected request: ${url}`)
  })
  try {
    const asset = await generateReplacementFrame({ ...frameOptions, onJobSubmitted: id => jobs.push(id), onStatus: status => statuses.push(status.status) })
    const posts = requests.filter(item => item.url === '/api/v1/generate')
    assert.equal(posts.length, 1)
    const body = posts[0].body!
    assert.deepEqual(body.image_refs, [frameOptions.sourceFrameURL, frameOptions.characterURL])
    assert.equal(body.canonical_image_refs, true)
    assert.equal(body.prompt, frameOptions.prompt)
    assert.equal(body.num_inference_steps, 4)
    assert.equal(body.resolution, '1080x1920')
    assert.equal(body.video_prompt_type, 'KI')
    assert.equal(body.multi_prompts_gen_type, 2)
    assert.equal(body.comic_panel, false)
    assert.equal(body.workspace, 'demo')
    assert.equal(body.video_guide, undefined)
    assert.equal(body.spatial_upsampling, undefined)
    assert.equal((body.provenance as { actor: string }).actor, 'user')
    assert.deepEqual(jobs, ['frame-job']); assert.deepEqual(statuses, ['completed'])
    assert.equal(asset.source, '/api/v1/file/exact-result.png?workspace=demo')
    assert.deepEqual(asset.metadata, { jobId: 'frame-job', taskId: 'task-frame', rootTaskId: 'root-frame' })
    assert.equal(requests.some(item => item.url.includes('/upload') || item.url.includes('/outputs')), false)
  } finally { close() }
})

test('Replacement frame recovery observes its saved job without defaults, uploads or another admission', async () => {
  const requests: string[] = []
  const close = fixture(async input => { requests.push(String(input)); return Response.json(completed) })
  try {
    const asset = await generateReplacementFrame({ ...frameOptions, existingJobId: 'frame-job' })
    assert.deepEqual(requests, ['/api/v1/status/frame-job'])
    assert.equal(asset.metadata?.jobId, 'frame-job')
  } finally { close() }
})

test('Cancellation stops observing an admitted image without silently cancelling or resubmitting it', async () => {
  const controller = new AbortController()
  const requests: string[] = [], jobs: string[] = []
  const close = fixture(async input => {
    requests.push(String(input))
    if (String(input).includes('/defaults/')) return Response.json({})
    controller.abort()
    return Response.json({ job_id: 'admitted' })
  })
  try {
    await assert.rejects(generateReplacementFrame({ ...frameOptions, signal: controller.signal, onJobSubmitted: id => jobs.push(id) }), { name: 'AbortError' })
    assert.deepEqual(jobs, ['admitted'])
    assert.equal(requests.filter(url => url === '/api/v1/generate').length, 1)
    assert.equal(requests.some(url => url.includes('/cancel') || url.includes('/status')), false)
  } finally { close() }
})

test('Unverified models and foreign canonical references fail before any network request', async () => {
  let calls = 0
  const close = fixture(async () => { calls++; throw new Error('No request expected') })
  try {
    assert.deepEqual(replacementImageModels(useStore.getState().models).map(model => model.model_type), ['flux2_klein_9b'])
    assert.throws(() => generateReplacementFrame({ ...frameOptions, modelType: 'unsupported' }), /verified/)
    assert.throws(() => generateReplacementFrame({ ...frameOptions, characterURL: '/api/v1/file/person.png?workspace=other' }), /another workspace/)
    assert.throws(() => generateReplacementFrame({ ...frameOptions, sourceFrameURL: '/api/v1/uploads/%2e%2e/outside.png' }), /canonical/)
    assert.equal(calls, 0)
  } finally { close() }
})

test('A failed submission is never retried automatically', async () => {
  let posts = 0
  const close = fixture(async input => {
    if (String(input).includes('/defaults/')) return Response.json({})
    posts++; throw new Error('Connection lost after admission may have happened')
  })
  try {
    await assert.rejects(generateReplacementFrame(frameOptions), /Connection lost/)
    assert.equal(posts, 1)
  } finally { close() }
})

test('An aborted observer ignores a late image completion and can resume the same job', async () => {
  const controller = new AbortController()
  let finish!: (response: Response) => void
  let polling!: () => void
  const polled = new Promise<void>(resolve => { polling = resolve })
  const statuses: string[] = []
  const close = fixture(async () => { polling(); return new Promise(resolve => { finish = resolve }) })
  try {
    const pending = generateReplacementFrame({ ...frameOptions, existingJobId: 'frame-job', signal: controller.signal,
      onStatus: status => statuses.push(status.status) })
    await polled
    controller.abort()
    await assert.rejects(pending, { name: 'AbortError' })
    finish(Response.json(completed))
    await new Promise(resolve => queueMicrotask(resolve))
    assert.deepEqual(statuses, [])
    globalThis.fetch = async () => Response.json(completed)
    const resumed = await generateReplacementFrame({ ...frameOptions, existingJobId: 'frame-job' })
    assert.equal(resumed.source, '/api/v1/file/exact-result.png?workspace=demo')
  } finally { close() }
})

test('Legacy single-reference image callers retain upload, saved settings and comic defaults', async () => {
  let submitted: Record<string, unknown> | undefined
  const close = fixture(async (input, init) => {
    const url = String(input)
    if (url === '/api/v1/uploads/identity.png') return new Response('REFERENCE', { headers: { 'content-type': 'image/png' } })
    if (url === '/api/v1/upload') return Response.json({ path: '/private/uploads/copied.png' })
    if (url === '/api/v1/generate') { submitted = JSON.parse(String(init?.body)); return Response.json({ job_id: 'frame-job' }) }
    if (url === '/api/v1/status/frame-job') return Response.json(completed)
    throw new Error(`Unexpected legacy request: ${url}`)
  })
  try {
    await generateImageAsset('maestro', frameOptions.prompt, 'flux2_klein_9b', '/api/v1/uploads/identity.png')
    assert.deepEqual(submitted!.image_refs, ['/private/uploads/copied.png'])
    assert.equal(submitted!.canonical_image_refs, undefined)
    assert.equal(submitted!.comic_panel, true)
    assert.equal(submitted!.num_inference_steps, 99)
    assert.equal(submitted!.workspace, 'different-active-workspace')
    assert.equal(submitted!.prompt, frameOptions.prompt)
  } finally { close() }
})

test('Video uses canonical Recast admission, keeps full source by default and resolves only its job result', async () => {
  const requests: Array<{ url: string; body?: Record<string, unknown> }> = []
  const close = fixture(async (input, init) => {
    const url = String(input)
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url === '/api/v1/recast') return Response.json({ job_id: 'video-job', status: 'queued' })
    return Response.json({ ...completed, job_id: 'video-job', output_files: ['exact-video.mp4'] })
  })
  try {
    const submitted = await submitReplacementVideo({ videoURL: '/api/v1/uploads/source.mp4', editedFrameURL: '/api/v1/file/exact-result.png?workspace=demo', workspace: 'demo', resolutionProfile: '704p', audioMode: 'source' })
    const result = await waitForReplacementVideo(submitted.job_id, 'demo')
    assert.equal(requests[0].body!.start_time, 0)
    assert.equal(requests[0].body!.end_time, undefined)
    assert.equal(requests[0].body!.model_type, 'viggle_animate')
    assert.equal(requests[0].body!.viggle_audio_mode, 'source')
    assert.equal((requests[0].body!.provenance as { actor: string }).actor, 'user')
    assert.equal(result.source, '/api/v1/file/exact-video.mp4?workspace=demo')
    assert.deepEqual(requests.map(item => item.url), ['/api/v1/recast', '/api/v1/status/video-job'])
  } finally { close() }
})
