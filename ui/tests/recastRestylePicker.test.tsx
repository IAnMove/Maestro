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
    if (requestUrl.includes('/loras')) {
      return new Response(JSON.stringify({ loras: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

test('Recast source and character slots expose dual-origin AssetInput without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { RecastControls } = await import('../src/components/Sidebar/RecastControls.tsx')
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
    editRecastMappings: [{
      id: 'recast-a', target: 'person', refFile: null, refPath: '', refUrl: '', additionalRefs: [], referenceAlignedToSource: false,
    }],
  } as never)
  try {
    render(<RecastControls />)
    const library = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From HocusPocus'))
    const device = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From my computer'))
    assert.ok(library.length >= 2, 'video and character library origins')
    assert.ok(device.length >= 2, 'video and character device origins')
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})

test('Repaint source and edited-frame slots expose dual-origin AssetInput without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { RestyleControls } = await import('../src/components/Sidebar/RestyleControls.tsx')
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
    editRepaintFramePath: '',
    editRepaintFrameUrl: '',
  } as never)
  try {
    render(<RestyleControls />)
    const library = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From HocusPocus'))
    const device = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From my computer'))
    assert.ok(library.length >= 2, 'video and frame library origins')
    assert.ok(device.length >= 2, 'video and frame device origins')
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})

test('Panorama source uses dual-origin AssetInput without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { PanoramaLoopPanel } = await import('../src/components/Sidebar/PanoramaLoopPanel.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch()
  useStore.setState({ activeWorkspace: 'default' } as never)
  try {
    render(<PanoramaLoopPanel />)
    const library = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From HocusPocus'))
    const device = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From my computer'))
    assert.ok(library.length >= 1, 'panorama library origin')
    assert.ok(device.length >= 1, 'panorama device origin')
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})
