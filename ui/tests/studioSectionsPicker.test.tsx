import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLImageElement: dom.window.HTMLImageElement,
    Event: dom.window.Event,
    MutationObserver: dom.window.MutationObserver,
    ResizeObserver: class { observe() {} disconnect() {} },
  })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
}

installDom()

function mockFetch() {
  return async (input: RequestInfo | URL) => {
    const requestUrl = typeof input === 'string' ? input : (input as Request).url || String(input)
    if (requestUrl.includes('/api/v1/assets')) {
      return new Response(JSON.stringify({ total: 0, assets: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

function countOrigins() {
  const library = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From HocusPocus'))
  const device = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From my computer'))
  return { library: library.length, device: device.length }
}

test('ImageRefSection add slot exposes dual-origin AssetInput without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { ImageRefSection } = await import('../src/components/Sidebar/ImageRefSection.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch()
  useStore.setState({
    activeWorkspace: 'default',
    imageRefs: [],
    imageRefType: '',
    modelOptions: { image_ref_choices: { choices: [['People', 'I']] }, max_image_refs: 4 },
  } as never)
  try {
    render(<ImageRefSection />)
    const origins = countOrigins()
    assert.ok(origins.library >= 1)
    assert.ok(origins.device >= 1)
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})

test('ControlVideoSection exposes dual-origin AssetInput without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { ControlVideoSection } = await import('../src/components/Sidebar/ControlVideoSection.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch()
  useStore.setState({
    activeWorkspace: 'default',
    generationMode: 'video',
    params: { video_prompt_type: 'V' },
    modelOptions: { guide_preprocessing: { choices: [['Raw', 'V']], default: 'V' } },
  } as never)
  try {
    render(<ControlVideoSection />)
    const origins = countOrigins()
    assert.ok(origins.library >= 1)
    assert.ok(origins.device >= 1)
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})

test('VoiceRefSection exposes dual-origin AssetInput without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { VoiceRefSection } = await import('../src/components/Sidebar/VoiceRefSection.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch()
  useStore.setState({
    activeWorkspace: 'default',
    directorVoiceRef: null,
    servicesConfig: { voice_reference_enabled: true },
  } as never)
  try {
    render(<VoiceRefSection />)
    const origins = countOrigins()
    assert.ok(origins.library >= 1)
    assert.ok(origins.device >= 1)
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})

test('AudioModeSection soundtrack slot exposes dual-origin AssetInput without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { AudioModeSection } = await import('../src/components/Sidebar/AudioModeSection.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch()
  useStore.setState({
    activeWorkspace: 'default',
    audioGuideFilename: null,
    ttsVoiceCount: 0,
    ttsVoices: [],
    params: { audio_prompt_type: 'A' },
    modelOptions: { audio_prompt_type_sources: { choices: [['File', 'A']], default: 'A' }, audio_only: false },
  } as never)
  try {
    render(<AudioModeSection />)
    const origins = countOrigins()
    assert.ok(origins.library >= 1)
    assert.ok(origins.device >= 1)
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})
