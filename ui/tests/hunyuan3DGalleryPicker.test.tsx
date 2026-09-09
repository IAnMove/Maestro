import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  MutationObserver: dom.window.MutationObserver,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

async function chooseFromLibrary(
  screen: Awaited<typeof import('@testing-library/react')>['screen'],
  fireEvent: Awaited<typeof import('@testing-library/react')>['fireEvent'],
  filename: string,
  index = 0,
) {
  const buttons = screen.getAllByRole('button', { name: 'From HocusPocus' })
    .filter((button: HTMLButtonElement) => !button.disabled)
  fireEvent.click(buttons[index] || buttons[0])
  const cards = await screen.findAllByTitle(filename)
  const card = cards.find((node: HTMLElement) => node.tagName === 'BUTTON') || cards[0]
  fireEvent.click(card)
  fireEvent.click(screen.getByRole('button', { name: 'Choose' }))
}

const capabilities = {
  runtime: { installed: true, isolated_runtime: true, releases_vram_after_job: true, install_hint: null },
  models: [{
    id: 'hunyuan3d-2-turbo', label: 'Hunyuan3D 2 Turbo', engine: 'v2', repo: 'Tencent/Hunyuan3D-2',
    subfolder: 'turbo', parameters: '1.1B', multiview: false, turbo: true, supports_text: true,
    recommended_vram_gb: 6, description: 'Fast single-view reconstruction',
  }],
  presets: [{
    id: 'balanced', label: 'Balanced', description: 'Balanced quality', model_id: 'hunyuan3d-2-turbo',
    num_inference_steps: 5, guidance_scale: 5, octree_resolution: 256, num_chunks: 12000,
    texture_mode: 'v2-turbo', cpu_offload: true, flashvdm: true,
  }],
  texture_modes: [{ id: 'v2-turbo', label: 'Turbo texture', recommended_vram_gb: 6 }],
  input_views: ['front', 'left', 'right', 'back'],
  output_formats: ['glb'],
  active_jobs: 0,
}

test('3D model switching retains but disables unsupported views and never sends stale Hunyuan controls', { concurrency: false }, async () => {
  const { render, screen, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react')
  const { Hunyuan3DPanel } = await import('../src/components/Sidebar/Hunyuan3DPanel.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const originalFetch = globalThis.fetch
  const models = [
    { ...capabilities.models[0], id: 'hunyuan3d-2mv', multiview: true, supports_text: false },
    { ...capabilities.models[0], id: 'trellis2', engine: 'trellis2', supports_text: false,
      resolutions: [512, 1024, 1536], supports_low_vram: false, supports_camera_fov: false,
      runtime: { installed: true, install_hint: null } },
    { ...capabilities.models[0], id: 'pixal3d', engine: 'pixal3d', supports_text: false,
      resolutions: [1024, 1536], supports_low_vram: true, supports_camera_fov: true,
      multiview_reason: 'camera_contract', runtime: { installed: true, install_hint: null } },
  ]
  let submitted: Record<string, unknown> = {}
  useStore.setState(state => ({
    activeWorkspace: 'default',
    productionProfile: { ...state.productionProfile, model3d: { provider: 'local', model: '' } },
    params: { ...state.params, model_type: 'hunyuan3d-2mv', prompt: 'stale prompt' },
    maybeRefreshGallery: async () => undefined,
  }))
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    let result: unknown = {}
    if (url.includes('/model3d/capabilities')) result = { ...capabilities, models }
    else if (url.includes('/outputs')) result = { outputs: [{ name: 'reference.png', type: 'image', url: '/reference.png' }], total: 1 }
    else if (url.includes('/model3d/generate')) {
      submitted = JSON.parse(String(init?.body))
      result = { job_id: 'external-test', status: 'completed', progress: 1, model_id: submitted.model_id }
    }
    return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    render(<Hunyuan3DPanel />)
    await screen.findAllByRole('button', { name: 'From HocusPocus' })
    await chooseFromLibrary(screen, fireEvent, 'reference.png', 0)
    await chooseFromLibrary(screen, fireEvent, 'reference.png', 1)
    act(() => useStore.setState(state => ({ params: { ...state.params, model_type: 'trellis2' } })))
    await screen.findByText(/Multi-view not supported/)
    assert.equal(
      screen.getAllByRole('button', { name: 'From HocusPocus' }).filter(button => !(button as HTMLButtonElement).disabled).length,
      1,
    )
    assert.equal((screen.getByRole('textbox') as HTMLTextAreaElement).disabled, true)
    assert.equal((screen.getByRole('checkbox', { name: 'Low VRAM mode' }) as HTMLInputElement).disabled, true)
    fireEvent.click(screen.getByRole('button', { name: /Advanced/ }))
    assert.ok(screen.getByRole('spinbutton', { name: 'Steps' }).closest('fieldset')?.disabled)
    act(() => useStore.setState(state => ({ params: { ...state.params, model_type: 'pixal3d' } })))
    await screen.findByText(/requires calibrated cameras/)
    assert.equal((screen.getByRole('checkbox', { name: 'Low VRAM mode' }) as HTMLInputElement).disabled, false)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Camera FOV (radians)' }), { target: { value: '0.2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate 3D asset' }))
    await waitFor(() => assert.equal(submitted.model_id, 'pixal3d'))
    assert.deepEqual(submitted.images, { front: 'reference.png' })
    assert.equal(submitted.camera_fov, 0.2)
    assert.equal(submitted.texture_mode, 'native-pbr')
    for (const key of ['prompt', 'preset', 'octree_resolution', 'flashvdm', 'num_inference_steps']) {
      assert.equal(key in submitted, false, `${key} must not be sent`)
    }
    act(() => useStore.setState(state => ({ params: { ...state.params, model_type: 'hunyuan3d-2mv' } })))
    await waitFor(() => assert.equal(screen.getAllByText('reference.png').length, 2))
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})

test('Hunyuan3D keeps disk upload and can use a HocusPocus image in the active workspace', { concurrency: false }, async () => {
  const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react')
  const { Hunyuan3DPanel } = await import('../src/components/Sidebar/Hunyuan3DPanel.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const originalFetch = globalThis.fetch
  let submitted: Record<string, unknown> | null = null
  useStore.setState(state => ({
    activeWorkspace: 'gallery-workspace',
    params: { ...state.params, model_type: 'hunyuan3d-2-turbo', prompt: '' },
    enabledModels: new Set<string>(),
    maybeRefreshGallery: async () => undefined,
  }))
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/v1/model3d/capabilities')) {
      return new Response(JSON.stringify(capabilities), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/v1/outputs')) {
      return new Response(JSON.stringify({
        outputs: [{
          name: 'bronze_robot_reference.png', type: 'image', mode: 'image', size: 42, created_at: 1,
          url: '/api/v1/file/bronze_robot_reference.png?workspace=gallery-workspace',
          thumbnail_url: '/api/v1/outputs/thumbnail/bronze_robot_reference.png?workspace=gallery-workspace',
        }],
        total: 1,
      }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/v1/model3d/generate') && init?.method === 'POST') {
      submitted = JSON.parse(String(init.body || '{}'))
      return new Response(JSON.stringify({
        job_id: 'model3d-gallery-test', status: 'completed', progress: 1, phase: 'completed',
        message: 'Ready', error: null, filename: 'robot.glb', url: '/api/v1/file/robot.glb',
        model_id: 'hunyuan3d-2-turbo',
      }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/v1/model-visibility')) {
      return new Response('{}', { headers: { 'content-type': 'application/json' } })
    }
    throw new Error(`Unexpected request: ${url}`)
  }) as typeof fetch

  try {
    render(<Hunyuan3DPanel />)
    await screen.findByRole('button', { name: 'From HocusPocus' })
    assert.ok(screen.getByRole('button', { name: 'From my computer' }))

    await chooseFromLibrary(screen, fireEvent, 'bronze_robot_reference.png')
    assert.ok(screen.getByText('bronze_robot_reference.png'))

    const generate = screen.getByRole('button', { name: 'Generate 3D asset' }) as HTMLButtonElement
    assert.equal(generate.disabled, false)
    assert.ok(generate.className.includes('bg-cta'))
    fireEvent.click(generate)
    await waitFor(() => assert.ok(submitted))
    assert.deepEqual(submitted?.images, { front: 'bronze_robot_reference.png' })
    assert.equal(submitted?.workspace, 'gallery-workspace')
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})

test('a missing Hunyuan runtime keeps generate disabled after a reference image is loaded', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { Hunyuan3DPanel } = await import('../src/components/Sidebar/Hunyuan3DPanel.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const originalFetch = globalThis.fetch
  let generatePosted = false
  useStore.setState(state => ({
    activeWorkspace: 'gallery-workspace',
    params: { ...state.params, model_type: 'hunyuan3d-2-turbo', prompt: '' },
    enabledModels: new Set<string>(),
    maybeRefreshGallery: async () => undefined,
  }))
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/v1/model3d/capabilities')) {
      return new Response(JSON.stringify({
        ...capabilities,
        runtime: { ...capabilities.runtime, installed: false, install_hint: 'Install the Hunyuan3D runtime' },
      }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/v1/outputs')) {
      return new Response(JSON.stringify({
        outputs: [{
          name: 'bronze_robot_reference.png', type: 'image', mode: 'image', size: 42, created_at: 1,
          url: '/api/v1/file/bronze_robot_reference.png?workspace=gallery-workspace',
          thumbnail_url: '/api/v1/outputs/thumbnail/bronze_robot_reference.png?workspace=gallery-workspace',
        }],
        total: 1,
      }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/v1/model3d/generate') && init?.method === 'POST') {
      generatePosted = true
      return new Response(JSON.stringify({ job_id: 'should-not-run' }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/v1/model-visibility')) {
      return new Response('{}', { headers: { 'content-type': 'application/json' } })
    }
    throw new Error(`Unexpected request: ${url}`)
  }) as typeof fetch

  try {
    render(<Hunyuan3DPanel />)
    await screen.findByRole('status')
    await screen.findByRole('button', { name: 'From HocusPocus' })
    await chooseFromLibrary(screen, fireEvent, 'bronze_robot_reference.png')
    assert.ok(screen.getByText('bronze_robot_reference.png'))
    const generate = screen.getByRole('button', { name: 'Generate 3D asset' }) as HTMLButtonElement
    assert.equal(generate.disabled, true)
    assert.equal(generate.className.includes('bg-cta'), false)
    assert.ok(generate.className.includes('cursor-not-allowed'))
    fireEvent.click(generate)
    assert.equal(generatePosted, false)
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})
