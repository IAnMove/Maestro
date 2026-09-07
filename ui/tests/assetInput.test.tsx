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
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  MutationObserver: dom.window.MutationObserver,
  ResizeObserver: class { observe() {} disconnect() {} },
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

test('inferUploadKind maps image audio video and glb', async () => {
  const { inferUploadKind } = await import('../src/features/asset-picker/upload.ts')
  assert.equal(inferUploadKind(new File(['x'], 'a.png', { type: 'image/png' })), 'image')
  assert.equal(inferUploadKind(new File(['x'], 'a.mp3', { type: 'audio/mpeg' })), 'audio')
  assert.equal(inferUploadKind(new File(['x'], 'a.mp4', { type: 'video/mp4' })), 'video')
  assert.equal(inferUploadKind(new File(['x'], 'hero.glb', { type: 'model/gltf-binary' })), 'model3d')
})

test('native file cancel does not change the field', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { AssetInput } = await import('../src/features/asset-picker/AssetInput.tsx')
  const chosen: Array<string | null> = []
  try {
    render(
      <AssetInput
        label="Hero"
        placeholder="Choose"
        items={[]}
        onChoose={item => { chosen.push(item ? item.name : null) }}
      />,
    )
    fireEvent.change(screen.getByTestId('asset-input-file'), { target: { files: [] } })
    assert.deepEqual(chosen, [])
    assert.equal(screen.queryByTestId('asset-explorer'), null)
  } finally {
    cleanup()
  }
})

test('From HocusPocus opens the shared explorer and Remove clears', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { AssetInput } = await import('../src/features/asset-picker/AssetInput.tsx')
  const chosen: Array<string | null> = []
  const current = {
    name: 'hero.png', type: 'image' as const, mode: null, size: 2, created_at: 1,
    url: '/api/v1/file/hero.png', thumbnail_url: '/api/v1/file/hero.png',
  }
  try {
    render(
      <AssetInput
        label="Hero"
        placeholder="Choose"
        items={[current]}
        value={current}
        optional
        onChoose={item => { chosen.push(item ? item.name : null) }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /From HocusPocus/ }))
    assert.ok(screen.getByTestId('asset-explorer'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    assert.deepEqual(chosen, [])
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
    assert.deepEqual(chosen, [null])
  } finally {
    cleanup()
  }
})

test('failed upload after the field closed does not apply a value', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { AssetInput } = await import('../src/features/asset-picker/AssetInput.tsx')
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch
  const chosen: Array<string | null> = []
  try {
    const view = render(
      <AssetInput
        label="Hero"
        placeholder="Choose"
        items={[]}
        onChoose={item => { chosen.push(item ? item.name : null) }}
      />,
    )
    const file = new File(['x'], 'late.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('asset-input-file'), { target: { files: [file] } })
    view.unmount()
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.deepEqual(chosen, [])
  } finally {
    globalThis.fetch = originalFetch
    cleanup()
  }
})
