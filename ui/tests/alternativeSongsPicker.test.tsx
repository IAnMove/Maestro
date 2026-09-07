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
    HTMLSelectElement: dom.window.HTMLSelectElement,
    Event: dom.window.Event,
    MutationObserver: dom.window.MutationObserver,
    ResizeObserver: class { observe() {} disconnect() {} },
  })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
}

installDom()

test('AlternativeSongsDialog uses dual-origin picker and does not auto-select the first catalog row', { concurrency: false }, async () => {
  const { render, screen, cleanup } = await import('@testing-library/react')
  const { AlternativeSongsDialog } = await import('../src/components/MainContent/AlternativeSongsDialog.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  useStore.setState({ activeWorkspace: 'film', loadOutputs: async () => {}, setMediaFilter: () => {} })
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/alternative-songs')) {
      return new Response(JSON.stringify({
        parent: 'clip.mp4',
        duration_seconds: 10,
        source_clip_count: 1,
        adaptation: 'repeat',
        songs: [],
      }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/v1/assets')) {
      return new Response(JSON.stringify({
        total: 2,
        assets: [
          { id: 'a', filename: 'theme.mp3', kind: 'audio', workspace: 'film' },
          { id: 'b', filename: 'theme.mp3', kind: 'audio', workspace: 'other' },
        ],
      }), { headers: { 'content-type': 'application/json' } })
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    render(<AlternativeSongsDialog name="clip.mp4" onClose={() => {}} />)
    await screen.findByRole('dialog', { name: /alternative songs/i })
    const library = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From HocusPocus'))
    const device = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From my computer'))
    assert.ok(library.length >= 1)
    assert.ok(device.length >= 1)
    assert.equal(document.querySelector('select'), null)
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
    const add = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Add')
    assert.ok(add)
    assert.equal((add as HTMLButtonElement).disabled, true)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})
