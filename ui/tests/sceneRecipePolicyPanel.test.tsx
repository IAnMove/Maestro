import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

function installDom() {
  const dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', { url: 'http://localhost/' })
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
}

installDom()

const policyRecipe = (options: { generationPolicy?: string; includeVideo?: boolean } = {}) => {
  const assets = [
    { id: 'missing-image', kind: 'image', prompt: 'A quiet empty plate.' },
    ...(options.includeVideo === false ? [] : [{ id: 'missing-video', kind: 'video', prompt: 'A moving environmental plate.' }]),
  ]
  const layers = [
    { id: 'camera', type: 'camera', cameraPreset: 'camera-locked' },
    { id: 'image-layer', type: 'image', asset: 'missing-image' },
    ...(options.includeVideo === false ? [] : [{ id: 'video-layer', type: 'video', asset: 'missing-video' }]),
  ]
  return {
    version: 1,
    name: 'policy-panel-test',
    ...(options.generationPolicy ? { generationPolicy: options.generationPolicy } : {}),
    record: false,
    save: false,
    assets,
    shots: [{ name: 'shot', duration: 2, layers }],
    scene: { width: 1280, height: 720, fps: 30, duration: 2, layers },
  }
}

const providedGlbRecipe = () => ({
  version: 1,
  name: 'provided-glb',
  record: false,
  save: false,
  assets: [{ id: 'hero', kind: 'model3d', source: 'hero.glb', rig_profile: 'humanoid', animations: ['walk'] }],
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
})

const autoMultiShotGlbRecipe = () => {
  const layersFor = (id: string) => [
    { id: `${id}-camera`, type: 'camera', cameraPreset: 'camera-locked' },
    { id: `${id}-hero`, type: 'model3d', asset: 'hero' },
  ]
  const firstLayers = layersFor('first')
  const secondLayers = layersFor('second')
  return {
    version: 1,
    name: 'mount-policy',
    generationPolicy: 'auto',
    record: false,
    save: false,
    // No rig_profile: this test is about caller policy persistence, not rigging.
    assets: [{ id: 'hero', kind: 'model3d', source: 'hero.glb' }],
    shots: [
      { name: 'first-shot', duration: 2, layers: firstLayers },
      { name: 'second-shot', duration: 2, layers: secondLayers },
    ],
    scene: { width: 1280, height: 720, fps: 30, duration: 2, layers: firstLayers },
  }
}

const suppliedCacheRecipe = (name: string, source: string) => {
  const layersFor = (id: string) => [
    { id: `${id}-camera`, type: 'camera', cameraPreset: 'camera-locked' },
    { id: `${id}-hero`, type: 'model3d', asset: 'hero' },
  ]
  const firstLayers = layersFor(`${name}-first`)
  const secondLayers = layersFor(`${name}-second`)
  return {
    version: 1,
    name: `${name}-recipe`,
    generationPolicy: 'auto',
    record: false,
    save: false,
    assets: [{ id: 'hero', kind: 'model3d', source }],
    shots: [
      { name: `${name}-first`, duration: 2, layers: firstLayers },
      { name: `${name}-second`, duration: 2, layers: secondLayers },
    ],
    scene: { width: 1280, height: 720, fps: 30, duration: 2, layers: firstLayers },
  }
}

async function panelModules() {
  const [{ render, screen, fireEvent, waitFor, cleanup }, { ensureUiI18n, setUiLanguage }, { SceneRecipePanel }] = await Promise.all([
    import('@testing-library/react'),
    import('../src/i18n/index.ts'),
    import('../src/components/Sidebar/SceneRecipePanel.tsx'),
  ])
  ensureUiI18n()
  return { render, screen, fireEvent, waitFor, cleanup, setUiLanguage, SceneRecipePanel }
}

test('auto no-video checkbox is authoritative and preflight blocks before any request in English', async () => {
  const { render, screen, fireEvent, waitFor, cleanup, setUiLanguage, SceneRecipePanel } = await panelModules()
  await setUiLanguage('en')
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  let applied = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('unexpected network request')
  }
  try {
    render(<SceneRecipePanel outputs={[]} onApply={async () => { applied += 1 }} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Do not generate video clips' }))
    assert.match(screen.getByText(/Images, audio and 3D assets may still be generated/).textContent || '', /Existing video clips are allowed/)
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipe JSON' }), {
      target: { value: JSON.stringify(policyRecipe({ generationPolicy: 'auto' })) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate + compose' }))
    const error = await waitFor(() => screen.getByText(/cannot be generated under no_video_generation/))
    assert.match(error.textContent || '', /moving plate.*missing-video/)
    assert.equal(fetchCalls, 0)
    assert.equal(applied, 0)
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})

test('writeRecipe stamps the caller policy in the LLM result without translating user intent', async () => {
  const { render, screen, fireEvent, waitFor, cleanup, setUiLanguage, SceneRecipePanel } = await panelModules()
  await setUiLanguage('en')
  const originalFetch = globalThis.fetch
  const requests: Array<Record<string, unknown>> = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (!url.includes('/api/v1/llm/generate')) throw new Error(`unexpected request: ${url}`)
    requests.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>)
    return new Response(JSON.stringify({ text: JSON.stringify(policyRecipe({ generationPolicy: 'auto', includeVideo: false })) }), { status: 200 })
  }
  try {
    render(<SceneRecipePanel outputs={[]} onApply={async () => undefined} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Do not generate video clips' }))
    const userIntent = 'Crea una placa de nieve en español, sin texto adicional.'
    fireEvent.change(screen.getByRole('textbox', { name: 'Describe the scene' }), { target: { value: userIntent } })
    fireEvent.click(screen.getByRole('button', { name: 'Plan scene' }))
    await waitFor(() => assert.match((screen.getByRole('textbox', { name: 'Recipe JSON' }) as HTMLTextAreaElement).value, /no_video_generation/))
    assert.equal(requests.length, 1)
    assert.equal(requests[0].prompt, userIntent)
    assert.match(String(requests[0].system_prompt), /TRUSTED CALLER GENERATION POLICY: no_video_generation/)
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})

test('policy errors are localized in Spanish without exposing an unknown policy value', async () => {
  const { render, screen, fireEvent, waitFor, cleanup, setUiLanguage, SceneRecipePanel } = await panelModules()
  await setUiLanguage('es')
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('unexpected network request')
  }
  try {
    render(<SceneRecipePanel outputs={[]} onApply={async () => undefined} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'No generar clips de vídeo' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON de receta' }), {
      target: { value: JSON.stringify(policyRecipe({ generationPolicy: 'auto' })) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generar + componer' }))
    const error = await waitFor(() => screen.getByText(/No se puede generar/))
    assert.match(error.textContent || '', /missing-video.*política no_video_generation/)
    assert.equal(screen.queryByText(/Unknown scene generation policy/), null)
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON de receta' }), {
      target: { value: JSON.stringify(policyRecipe({ generationPolicy: 'future_policy', includeVideo: false })) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generar + componer' }))
    const unknownError = await waitFor(() => screen.getByText(/política de generación desconocida/))
    assert.doesNotMatch(unknownError.textContent || '', /future_policy/)
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})

test('manual mode uses a supplied rigged GLB as-is without a generation or rig request', async () => {
  const { render, screen, fireEvent, waitFor, cleanup, setUiLanguage, SceneRecipePanel } = await panelModules()
  await setUiLanguage('en')
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  let appliedPolicy: unknown
  let appliedSource: unknown
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('unexpected network request')
  }
  try {
    render(<SceneRecipePanel
      outputs={[]}
      onApply={async recipe => {
        appliedPolicy = recipe.generationPolicy
        appliedSource = recipe.assets[0]?.source
      }}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Manual · loaded assets' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipe JSON' }), {
      target: { value: JSON.stringify(providedGlbRecipe()) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Compose' }))
    await waitFor(() => assert.equal(appliedPolicy, 'provided_only'))
    assert.equal(appliedSource, 'hero.glb')
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})

test('provided_only in edited auto JSON cannot be weakened by the auto caller', async () => {
  const { render, screen, fireEvent, waitFor, cleanup, setUiLanguage, SceneRecipePanel } = await panelModules()
  await setUiLanguage('en')
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  let applied = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('unexpected network request')
  }
  try {
    render(<SceneRecipePanel outputs={[]} onApply={async () => { applied += 1 }} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipe JSON' }), {
      target: { value: JSON.stringify(policyRecipe({ generationPolicy: 'provided_only', includeVideo: false })) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate + compose' }))
    await waitFor(() => assert.ok(screen.getByText(/cannot be generated under provided_only/)))
    assert.equal(fetchCalls, 0)
    assert.equal(applied, 0)
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})

test('mountShot persists a stricter caller policy after the checkbox is cleared', async () => {
  const { render, screen, fireEvent, waitFor, cleanup, setUiLanguage, SceneRecipePanel } = await panelModules()
  await setUiLanguage('en')
  const originalFetch = globalThis.fetch
  const appliedPolicies: unknown[] = []
  globalThis.fetch = async () => {
    throw new Error('unexpected network request')
  }
  try {
    render(<SceneRecipePanel
      outputs={[]}
      onApply={async recipe => { appliedPolicies.push(recipe.generationPolicy) }}
    />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipe JSON' }), {
      target: { value: JSON.stringify(autoMultiShotGlbRecipe()) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate + compose' }))
    await waitFor(() => assert.equal(appliedPolicies.length, 1))
    const checkbox = screen.getByRole('checkbox', { name: 'Do not generate video clips' })
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: 'first-shot' }))
    await waitFor(() => assert.equal(appliedPolicies.length, 2))
    assert.equal(appliedPolicies[1], 'no_video_generation')
    const recipeJson = screen.getByRole('textbox', { name: 'Recipe JSON' }) as HTMLTextAreaElement
    assert.equal(JSON.parse(recipeJson.value).generationPolicy, 'no_video_generation')
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: 'second-shot' }))
    await waitFor(() => assert.equal(appliedPolicies.length, 3))
    assert.deepEqual(appliedPolicies, ['auto', 'no_video_generation', 'no_video_generation'])
    assert.equal(JSON.parse(recipeJson.value).generationPolicy, 'no_video_generation')
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})

test('planning a new recipe invalidates the previous mounted recipe cache', async () => {
  const { render, screen, fireEvent, waitFor, cleanup, setUiLanguage, SceneRecipePanel } = await panelModules()
  await setUiLanguage('en')
  const originalFetch = globalThis.fetch
  const applied: Array<{ name: string; source: string | undefined }> = []
  const compiledSources: string[] = []
  let llmCalls = 0
  const recipeB = suppliedCacheRecipe('B', 'b.glb')
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (!url.includes('/api/v1/llm/generate')) throw new Error(`unexpected request: ${url}`)
    llmCalls += 1
    assert.equal(typeof init?.body, 'string')
    return new Response(JSON.stringify({ text: JSON.stringify(recipeB) }), { status: 200 })
  }
  try {
    render(<SceneRecipePanel
      outputs={[]}
      onApply={async (recipe, scene) => {
        applied.push({ name: recipe.name, source: recipe.assets[0]?.source })
        compiledSources.push(scene.layers.find(layer => layer.type === 'model3d')?.source || '')
      }}
    />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipe JSON' }), {
      target: { value: JSON.stringify(suppliedCacheRecipe('A', 'a.glb')) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate + compose' }))
    await waitFor(() => assert.deepEqual(applied, [{ name: 'A-recipe', source: 'a.glb' }]))
    fireEvent.click(screen.getByRole('button', { name: 'Plan scene' }))
    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'B-second' })))
    assert.equal(llmCalls, 1)
    fireEvent.click(screen.getByRole('button', { name: 'B-second' }))
    await waitFor(() => assert.equal(applied.length, 2))
    assert.deepEqual(applied[1], { name: 'B-recipe', source: 'b.glb' })
    assert.match(compiledSources[1], /\/b\.glb(?:\?|$)/)
    const recipeJson = screen.getByRole('textbox', { name: 'Recipe JSON' }) as HTMLTextAreaElement
    assert.equal(JSON.parse(recipeJson.value).name, 'B-recipe')
    assert.equal(JSON.parse(recipeJson.value).assets[0].source, 'b.glb')
    fireEvent.change(recipeJson, { target: { value: '{incomplete editing' } })
    assert.equal(screen.queryByRole('button', { name: 'B-second' }), null)
    assert.equal(screen.queryByRole('button', { name: 'A-second' }), null)
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})

test('Example cannot restore the previous mounted recipe', async () => {
  const { render, screen, fireEvent, waitFor, cleanup, setUiLanguage, SceneRecipePanel } = await panelModules()
  await setUiLanguage('en')
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  const applied: string[] = []
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('unexpected network request')
  }
  try {
    render(<SceneRecipePanel
      outputs={[]}
      onApply={async recipe => { applied.push(recipe.name) }}
    />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipe JSON' }), {
      target: { value: JSON.stringify(suppliedCacheRecipe('A', 'a.glb')) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate + compose' }))
    await waitFor(() => assert.deepEqual(applied, ['A-recipe']))
    fireEvent.click(screen.getByRole('button', { name: 'Example' }))
    assert.equal(JSON.parse((screen.getByRole('textbox', { name: 'Recipe JSON' }) as HTMLTextAreaElement).value).name, 'saucer-cruise')
    fireEvent.click(screen.getByRole('button', { name: 'cruise' }))
    const error = await waitFor(() => screen.getByText(/has no source/))
    assert.match(error.textContent || '', /stars|saucer/)
    assert.deepEqual(applied, ['A-recipe'])
    assert.equal(fetchCalls, 0)
    assert.equal(JSON.parse((screen.getByRole('textbox', { name: 'Recipe JSON' }) as HTMLTextAreaElement).value).name, 'saucer-cruise')
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})
