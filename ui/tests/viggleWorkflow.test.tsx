import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'
import { viggleEditingParameters } from '../src/lib/viggleWorkflow'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event, MutationObserver: dom.window.MutationObserver,
  IS_REACT_ACT_ENVIRONMENT: true,
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

async function generationFixture(frameWidth = 1280, frameHeight = 720) {
  const { render, fireEvent, act, waitFor, cleanup } = await import('@testing-library/react')
  const { useStore } = await import('../src/stores/useStore')
  const { GenerateButton } = await import('../src/components/Sidebar/GenerateButton')
  const { setUiLanguage } = await import('../src/i18n')
  await setUiLanguage('en')
  const initial = useStore.getState()
  const submissions: unknown[][] = []
  const sidebarChanges: boolean[] = []
  const media: Array<HTMLVideoElement | HTMLImageElement> = []
  const originalCreate = document.createElement.bind(document)
  document.createElement = ((tag: string, options?: ElementCreationOptions) => {
    const element = originalCreate(tag, options)
    if (tag === 'video') {
      Object.defineProperties(element, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 } })
      ;(element as HTMLVideoElement).load = () => {}
      media.push(element as HTMLVideoElement)
    } else if (tag === 'img') {
      Object.defineProperties(element, { naturalWidth: { value: frameWidth }, naturalHeight: { value: frameHeight } })
      media.push(element as HTMLImageElement)
    }
    return element
  }) as typeof document.createElement
  useStore.setState({
    generationMode: 'avatar', editSubMode: 'recast', activeWorkspace: 'viggle-test',
    editVideoPath: 'source.mp4', editVideoUrl: '/api/v1/uploads/source.mp4',
    editRecastMappings: [{
      id: 'reference', target: '', refFile: null, refPath: 'edited.png',
      refUrl: '/api/v1/uploads/edited.png', additionalRefs: [], referenceAlignedToSource: true,
    }],
    params: { ...initial.params, model_type: 'viggle_animate' },
    models: [{ model_type: 'viggle_animate', name: 'Viggle', is_downloaded: false }] as never,
    jobs: [], modelOptions: null, promptSchedulerEnabled: false,
    startGeneration: async (...args) => { submissions.push(args) },
    setSidebarOpen: open => { sidebarChanges.push(open) },
  })
  const view = render(<GenerateButton />)
  return {
    view, media, submissions, sidebarChanges, useStore, fireEvent, act,
    async waitForInspection() {
      await waitFor(() => assert.equal(media.length, 2))
    },
    async finish() {
      await act(async () => {
        for (const element of media) {
          element.dispatchEvent(new dom.window.Event(element.tagName === 'VIDEO' ? 'loadedmetadata' : 'load'))
        }
      })
    },
    close() {
      cleanup()
      useStore.setState(initial)
      document.createElement = originalCreate
    },
  }
}

test('Viggle image step explains in English and Spanish that references still need generation', async () => {
  const { render, act, cleanup } = await import('@testing-library/react')
  const { useStore } = await import('../src/stores/useStore')
  const { AnchorReturnBanner } = await import('../src/components/Sidebar/AnchorReturnBanner')
  const { setUiLanguage } = await import('../src/i18n')
  const initial = useStore.getState()
  useStore.setState({
    outputs: [], imageRefs: [new dom.window.File([], 'frame.png'), new dom.window.File([], 'character.png')],
    editReturnTarget: {
      anchor: 'recast', modelType: 'viggle_animate', framePath: 'frame.png', clipPath: 'source.mp4',
      startTime: 0, endTime: 3, savedImageRefs: [], savedImageRefType: '', sourceResolution: '1920x1080',
    },
  })
  try {
    await setUiLanguage('en')
    const view = render(<AnchorReturnBanner />)
    assert.ok(view.getByText('Step 2 of 3 · Generate the replacement frame'))
    assert.equal(view.getAllByRole('listitem').length, 4)
    assert.ok(view.getByText(/Adding references does not perform the replacement yet/))
    assert.ok(view.getByText(/reference 1.*reference 2/))
    assert.ok(view.getByText(/Leave resolution and aspect ratio on Auto/))
    assert.equal(view.getByRole('button', { name: 'Apply & return' }).hasAttribute('disabled'), true)
    await act(async () => { await setUiLanguage('es') })
    assert.ok(view.getByText('Paso 2 de 3 · Genera el fotograma sustituto'))
    assert.ok(view.getByText(/Añadir referencias todavía no realiza la sustitución/))
    assert.ok(view.getByText(/referencia 1.*referencia 2/))
    assert.ok(view.getByText(/Deja la resolución y la proporción en Auto/))
    assert.equal(view.getByRole('button', { name: 'Aplicar y volver' }).hasAttribute('disabled'), true)
  } finally {
    cleanup()
    useStore.setState(initial)
    await setUiLanguage('en')
  }
})

test('Viggle rejects a differently framed image inline without submitting or closing the sidebar', async () => {
  const fixture = await generationFixture(1024, 1024)
  try {
    fixture.fireEvent.click(fixture.view.getByRole('button', { name: 'Generate' }))
    await fixture.waitForInspection()
    assert.equal(fixture.media[0].getAttribute('src'), '/api/v1/uploads/source.mp4')
    assert.equal(fixture.media[1].getAttribute('src'), '/api/v1/uploads/edited.png')
    await fixture.finish()
    const message = fixture.view.getByRole('alert').textContent || ''
    assert.match(message, /1920 × 1080.*1024 × 1024/)
    assert.match(message, /a separate character portrait is not an edited frame/)
    assert.equal(fixture.submissions.length, 0)
    assert.deepEqual(fixture.sidebarChanges, [])
    assert.equal(fixture.view.getByRole('button', { name: 'Generate' }).hasAttribute('disabled'), false)
  } finally { fixture.close() }
})

test('Viggle checks once before submitting a valid frame through generation even without downloaded weights', async () => {
  const fixture = await generationFixture()
  try {
    const button = fixture.view.getByRole('button', { name: 'Generate' })
    fixture.fireEvent.click(button)
    fixture.fireEvent.click(button)
    await fixture.waitForInspection()
    assert.equal(button.hasAttribute('disabled'), true)
    assert.equal(fixture.submissions.length, 0)
    assert.deepEqual(fixture.sidebarChanges, [])
    await fixture.finish()
    assert.equal(fixture.submissions.length, 1)
    assert.equal(fixture.submissions[0][0], undefined)
    assert.deepEqual(fixture.sidebarChanges, [false])
    assert.equal(fixture.view.queryByRole('alert'), null)
    assert.equal(fixture.useStore.getState().models[0].is_downloaded, false)
  } finally { fixture.close() }
})

test('Changing media, model or workspace while Viggle inspects does not submit stale inputs', async () => {
  for (const change of ['video', 'frame', 'model', 'workspace']) {
    const fixture = await generationFixture()
    try {
      fixture.fireEvent.click(fixture.view.getByRole('button', { name: 'Generate' }))
      await fixture.waitForInspection()
      await fixture.act(async () => {
        const state = fixture.useStore.getState()
        if (change === 'video') fixture.useStore.setState({ editVideoPath: 'another.mp4', editVideoUrl: '/api/v1/uploads/another.mp4' })
        if (change === 'frame') fixture.useStore.setState({ editRecastMappings: [{ ...state.editRecastMappings[0], refPath: 'another.png', refUrl: '/api/v1/uploads/another.png' }] })
        if (change === 'model') fixture.useStore.setState({ params: { ...state.params, model_type: 'scail2_14B' } })
        if (change === 'workspace') fixture.useStore.setState({ activeWorkspace: 'another-workspace' })
      })
      await fixture.finish()
      assert.equal(fixture.submissions.length, 0, change)
      assert.deepEqual(fixture.sidebarChanges, [], change)
      assert.equal(fixture.view.queryByRole('alert'), null, change)
      assert.ok(fixture.media.every(element => !element.hasAttribute('src')), change)
    } finally { fixture.close() }
  }
})

test('Only Auto image editing for Viggle inherits the source canvas', () => {
  const state = {
    generationMode: 'image', resolutionPreset: 'auto', aspectRatio: 'auto',
    editReturnTarget: { modelType: 'viggle_animate', sourceResolution: '832x480' },
  }
  assert.deepEqual(viggleEditingParameters(state), { resolution: '832x480' })
  for (const change of [
    { generationMode: 'avatar' },
    { resolutionPreset: '720p' },
    { aspectRatio: '1:1' },
    { editReturnTarget: null },
    { editReturnTarget: { modelType: 'scail2_14B', sourceResolution: '832x480' } },
    { editReturnTarget: { modelType: 'viggle_animate', sourceResolution: 'invalid' } },
  ]) assert.deepEqual(viggleEditingParameters({ ...state, ...change }), {})
})
