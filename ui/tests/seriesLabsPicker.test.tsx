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
  ResizeObserver: class { observe() {} disconnect() {} },
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

test('Series canon identity can be chosen from HocusPocus without approving the character', { concurrency: false }, async () => {
  const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react')
  const { SeriesCanonPanel } = await import('../src/features/series/SeriesCanonPanel.tsx')
  const { normalizeSeriesProject, createSeriesCharacter } = await import('../src/features/series/model.ts')
  const originalFetch = globalThis.fetch
  const imported: Array<Record<string, unknown>> = []
  const character = createSeriesCharacter()
  character.name = 'Luma'
  const series = normalizeSeriesProject({
    id: 'series-labs',
    title: 'Labs',
    characters: [character],
  })
  if (!series) throw new Error('fixture')
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/v1/outputs')) {
      return new Response(JSON.stringify({
        outputs: [{
          name: 'hero.png', type: 'image', mode: 'image', size: 12, created_at: 1,
          url: '/api/v1/uploads/hero.png', thumbnail_url: '/api/v1/uploads/hero.png',
        }],
        total: 1,
      }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/assets/import') && init?.method === 'POST') {
      imported.push(JSON.parse(String(init.body || '{}')))
      return new Response(JSON.stringify({ asset: { id: 'asset_1' }, series }), { headers: { 'content-type': 'application/json' } })
    }
    return new Response('{}', { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    render(<SeriesCanonPanel
      series={series}
      workspace="default"
      update={() => undefined}
      replaceSeries={() => undefined}
      saveNow={async () => undefined}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Characters' }))
    const library = await screen.findByRole('button', { name: 'From HocusPocus' })
    fireEvent.click(library)
    const cards = await screen.findAllByTitle('hero.png')
    const card = cards.find(node => node.tagName === 'BUTTON') || cards[0]
    fireEvent.click(card)
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }))
    await waitFor(() => assert.equal(imported.length, 1))
    assert.equal(imported[0].uploadPath, 'uploads/hero.png')
    assert.equal(imported[0].ownerType, 'character')
    assert.equal(imported[0].ownerId, character.id)
    assert.equal(imported[0].referenceRole, 'primary_portrait')
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})
