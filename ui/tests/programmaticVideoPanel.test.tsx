import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html lang="en"><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  Event: dom.window.Event,
  MutationObserver: dom.window.MutationObserver,
  ResizeObserver: class { observe() {} disconnect() {} },
  localStorage: dom.window.localStorage,
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

const outputs = [
  { name: 'hero.glb', type: 'model3d' as const, mode: null, size: 1, created_at: 1, url: '/hero.glb' },
  { name: 'plate.png', type: 'image' as const, mode: null, size: 1, created_at: 2, url: '/plate.png' },
]

const suppliedRecipe = {
  version: 1,
  name: 'handoff-busy-test',
  generationPolicy: 'provided_only',
  record: false,
  save: false,
  assets: [{ id: 'hero', kind: 'model3d', source: 'hero.glb' }],
  shots: [{ name: 'hero-shot', duration: 2, layers: [
    { id: 'camera', type: 'camera', cameraPreset: 'camera-locked' },
    { id: 'hero-layer', type: 'model3d', asset: 'hero' },
  ] }],
  scene: {
    width: 1280,
    height: 720,
    fps: 30,
    duration: 2,
    layers: [
      { id: 'camera', type: 'camera', cameraPreset: 'camera-locked' },
      { id: 'hero-layer', type: 'model3d', asset: 'hero' },
    ],
  },
}

async function modules() {
  const [{ render, screen, fireEvent, waitFor, cleanup }, { ensureUiI18n, setUiLanguage }, { SceneRecipePanel }, handoff] = await Promise.all([
    import('@testing-library/react'),
    import('../src/i18n/index.ts'),
    import('../src/components/Sidebar/SceneRecipePanel.tsx'),
    import('../src/features/agent/programmaticVideoHandoff.ts'),
  ])
  ensureUiI18n()
  await setUiLanguage('en')
  return { render, screen, fireEvent, waitFor, cleanup, setUiLanguage, SceneRecipePanel, handoff }
}

test('preparation reflects exact visual outputs and locks the trusted policy without generation', async () => {
  const { render, screen, waitFor, cleanup, SceneRecipePanel, handoff } = await modules()
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('preparation must not fetch or generate')
  }
  try {
    render(<SceneRecipePanel outputs={outputs} onApply={async () => undefined} />)
    const pending = handoff.requestProgrammaticVideoPreparation({
      intent: 'Monta la nave y la placa existentes.',
      generationPolicy: 'provided_only',
      workspace: 'default',
      outputNames: ['hero.glb', 'plate.png'],
    })
    assert.deepEqual(await pending, { message: 'Video3D form ready with provided_only.', policy: 'provided_only' })
    await waitFor(() => assert.equal((screen.getByRole('textbox', { name: 'Describe the scene' }) as HTMLTextAreaElement).value, 'Monta la nave y la placa existentes.'))
    assert.match(screen.getByRole('status').textContent || '', /provided_only/)
    assert.ok(screen.getByText('hero.glb'))
    assert.ok(screen.getByText('plate.png'))
    assert.equal((screen.getByRole('button', { name: /Manual/ }) as HTMLButtonElement).disabled, true)
    assert.equal((screen.getByRole('button', { name: /Auto/ }) as HTMLButtonElement).disabled, true)
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})

test('preparation rejects missing or non-visual outputs before reflecting state', async () => {
  const { render, screen, cleanup, SceneRecipePanel, handoff } = await modules()
  try {
    render(<SceneRecipePanel outputs={outputs} onApply={async () => undefined} />)
    await assert.rejects(
      handoff.requestProgrammaticVideoPreparation({
        intent: 'Usa un audio también.',
        generationPolicy: 'no_video_generation',
        workspace: 'default',
        outputNames: ['missing.wav'],
      }),
      /not available/i,
    )
    assert.equal(screen.queryByRole('status'), null)
  } finally {
    cleanup()
  }
})

test('preparation rejects a busy form before overwriting state or starting work', async () => {
  const { render, screen, fireEvent, waitFor, cleanup, SceneRecipePanel, handoff } = await modules()
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  let applyCalls = 0
  let releaseApply!: () => void
  const applyBlocked = new Promise<void>(resolve => { releaseApply = resolve })
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('preparation must not fetch while busy')
  }
  try {
    render(<SceneRecipePanel
      outputs={outputs}
      onApply={async () => {
        applyCalls += 1
        await applyBlocked
      }}
    />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipe JSON' }), {
      target: { value: JSON.stringify(suppliedRecipe) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate + compose' }))
    await waitFor(() => assert.equal(applyCalls, 1))
    const intent = screen.getByRole('textbox', { name: 'Describe the scene' }) as HTMLTextAreaElement
    const before = intent.value
    await assert.rejects(
      handoff.requestProgrammaticVideoPreparation({
        intent: 'No debe reemplazar la composición ocupada.',
        generationPolicy: 'provided_only',
        workspace: 'default',
        outputNames: ['hero.glb'],
      }),
      /busy/i,
    )
    assert.equal(intent.value, before)
    assert.equal(screen.queryByText('hero.glb'), null)
    assert.equal(fetchCalls, 0)
  } finally {
    releaseApply()
    globalThis.fetch = originalFetch
    await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Generate + compose' }).disabled, false))
    cleanup()
  }
})

test('disabled preparation errors use the active Spanish translation without mutating the form', async () => {
  const { render, screen, cleanup, setUiLanguage, SceneRecipePanel, handoff } = await modules()
  await setUiLanguage('es')
  try {
    render(<SceneRecipePanel disabled outputs={outputs} onApply={async () => undefined} />)
    const intent = screen.getByRole('textbox', { name: 'Describe la escena' }) as HTMLTextAreaElement
    const before = intent.value
    await assert.rejects(
      handoff.requestProgrammaticVideoPreparation({
        intent: 'No debe mutar un formulario deshabilitado.',
        generationPolicy: 'no_video_generation',
        workspace: 'default',
        outputNames: ['hero.glb'],
      }),
      /deshabilitado/i,
    )
    assert.equal(intent.value, before)
    assert.equal(screen.queryByText(/Preparación del Wizard cargada/i), null)
  } finally {
    cleanup()
  }
})
