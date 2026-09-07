import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

Object.assign(globalThis, { React })

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLImageElement: dom.window.HTMLImageElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  MutationObserver: dom.window.MutationObserver,
  ResizeObserver: class { observe() {} disconnect() {} },
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

test('asset explorer shows preview, name and creation date then confirms a choice', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { AssetExplorerDialog } = await import('../src/components/common/AssetExplorerDialog.tsx')
  const chosen: string[] = []
  const items = [
    {
      name: 'hero-running-aaaaaa.glb',
      type: 'model3d' as const,
      mode: null,
      size: 12,
      created_at: 1_725_000_000,
      url: '/api/v1/file/hero-running-aaaaaa.glb',
      thumbnail_url: '/api/v1/file/hero-running-aaaaaa.png',
    },
    {
      name: 'hero-walking-bbbbbb.glb',
      type: 'model3d' as const,
      mode: null,
      size: 14,
      created_at: 1_725_086_400,
      url: '/api/v1/file/hero-walking-bbbbbb.glb',
      thumbnail_url: '/api/v1/file/hero-walking-bbbbbb.png',
    },
  ]
  try {
    render(
      <AssetExplorerDialog
        open
        title="Choose a GLB"
        items={items}
        onClose={() => undefined}
        onChoose={item => { if (item) chosen.push(item.name) }}
      />,
    )
    assert.ok(screen.getByTestId('asset-explorer'))
    assert.match(screen.getByText(/Created /).textContent || '', /Created /)
    fireEvent.click(screen.getByTitle('hero-walking-bbbbbb.glb'))
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }))
    assert.deepEqual(chosen, ['hero-walking-bbbbbb.glb'])
  } finally {
    cleanup()
  }
})

test('asset explorer can cancel without choosing', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { AssetExplorerDialog } = await import('../src/components/common/AssetExplorerDialog.tsx')
  let closed = false
  const chosen: string[] = []
  try {
    render(
      <AssetExplorerDialog
        open
        title="Choose media"
        items={[{
          name: 'plate.png', type: 'image', mode: null, size: 2, created_at: 1_700_000_000,
          url: '/api/v1/file/plate.png', thumbnail_url: '/api/v1/file/plate.png',
        }]}
        onClose={() => { closed = true }}
        onChoose={item => { if (item) chosen.push(item.name) }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    assert.equal(closed, true)
    assert.deepEqual(chosen, [])
  } finally {
    cleanup()
  }
})
