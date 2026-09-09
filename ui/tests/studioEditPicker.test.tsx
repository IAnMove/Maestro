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
      return new Response(JSON.stringify({
        total: 1,
        assets: [{
          id: 'asset-clip', kind: 'video', filename: 'clip.mp4', size_bytes: 12,
          created_at: 1, completed_at: 2, metadata_status: 'canonical', workspace_ids: ['default'],
          locations: [{ workspace_id: 'default', filename: 'clip.mp4', url: '/api/v1/file/clip.mp4?workspace=default' }],
          url: '/api/v1/file/clip.mp4?workspace=default',
          origin: { tool: 'studio' }, execution: {}, model: { provider: 'local', id: 'ltx' },
          prompt_preview: 'clip',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (requestUrl.includes('/api/v1/sam/status')) {
      return new Response(JSON.stringify({ status: 'available', model_loaded: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    if (requestUrl.includes('/loras')) {
      return new Response(JSON.stringify({ loras: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

test('Inpaint source slot exposes dual-origin AssetInput without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { InpaintControls } = await import('../src/components/Sidebar/InpaintControls.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch()
  useStore.setState({
    activeWorkspace: 'default',
    editVideoFile: null,
    editVideoPath: '',
    editVideoUrl: '',
    editVideoDuration: 0,
    editStartTime: 0,
    editEndTime: 0,
    editMasksPath: '',
    editMaskPreview: '',
    editDetectedTarget: '',
  } as never)
  try {
    render(<InpaintControls />)
    const library = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From HocusPocus'))
    const device = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From my computer'))
    assert.ok(library.length >= 1, 'library origin')
    assert.ok(device.length >= 1, 'device origin')
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})

test('Blend clip slots expose dual-origin AssetInput without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { BlendControls } = await import('../src/components/Sidebar/BlendControls.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch()
  useStore.setState({
    activeWorkspace: 'default',
    blendClipA: null,
    blendClipAUrl: '',
    blendClipADuration: 0,
    blendClipB: null,
    blendClipBUrl: '',
    blendClipBDuration: 0,
    models: [],
    params: { model_type: 'flux' },
  } as never)
  try {
    render(<BlendControls />)
    const library = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From HocusPocus'))
    const device = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From my computer'))
    assert.ok(library.length >= 2, 'two clip library origins')
    assert.ok(device.length >= 2, 'two clip device origins')
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})
