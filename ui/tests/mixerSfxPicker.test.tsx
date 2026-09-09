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

test('Mixer base track exposes dual-origin AssetInput without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { MixerControls } = await import('../src/components/Sidebar/MixerControls.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch()
  useStore.setState({ activeWorkspace: 'default' } as never)
  try {
    render(<MixerControls />)
    const library = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From HocusPocus'))
    const device = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From my computer'))
    assert.ok(library.length >= 1)
    assert.ok(device.length >= 1)
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})

test('SFX optional video slot exposes dual-origin AssetInput without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { SfxControls } = await import('../src/components/Sidebar/SfxControls.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch()
  useStore.setState({ activeWorkspace: 'default', params: {}, durationSeconds: 8 } as never)
  try {
    render(<SfxControls />)
    const library = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From HocusPocus'))
    const device = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From my computer'))
    assert.ok(library.length >= 1)
    assert.ok(device.length >= 1)
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})


test('SFX restored guide is visible and removable without changing manual duration', { concurrency: false }, async () => {
  const { render, cleanup, fireEvent, act } = await import('@testing-library/react')
  const { SfxControls } = await import('../src/components/Sidebar/SfxControls.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch()
  const guide = '/api/v1/file/clip.mp4?workspace=original'
  useStore.setState({ activeWorkspace: 'destination', params: { video_guide: guide }, durationSeconds: 8 } as never)
  try {
    const view = render(<SfxControls />)
    assert.ok(view.getByText(guide))
    assert.equal(view.container.querySelectorAll('input[type="range"]').length, 1)
    assert.equal(useStore.getState().durationSeconds, 8)
    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Remove' })) })
    assert.equal(useStore.getState().params.video_guide, undefined)
    assert.equal(view.container.querySelectorAll('input[type="range"]').length, 2)
    assert.equal(useStore.getState().durationSeconds, 8)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})
