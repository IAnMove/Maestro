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

test('Omni add slot exposes dual-origin AssetInput without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { OmniReferenceSection } = await import('../src/components/Sidebar/OmniReferenceSection.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({ total: 0, assets: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch
  useStore.setState({
    activeWorkspace: 'default',
    params: { minimax_h3_references: [] },
    modelOptions: { omni_reference_limits: { image: 9, video: 3, audio: 3, total: 12 } },
  } as never)
  try {
    render(<OmniReferenceSection />)
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
