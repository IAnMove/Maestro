import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLMediaElement: dom.window.HTMLMediaElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    MutationObserver: dom.window.MutationObserver,
    ResizeObserver: ResizeObserverStub,
  })
  Object.defineProperty(dom.window, 'ResizeObserver', { configurable: true, value: ResizeObserverStub })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  return dom
}

const dom = installDom()

test('editorSourcePath strips workspace query from gallery file URLs', async () => {
  const { editorSourcePath } = await import('../src/features/video-editor/editorHandoff.ts')
  assert.equal(
    editorSourcePath('/api/v1/file/minimax_h3_713afac9.mp4?workspace=default'),
    'minimax_h3_713afac9.mp4',
  )
  assert.equal(editorSourcePath('minimax_h3_713afac9.mp4?workspace=default'), 'minimax_h3_713afac9.mp4')
  assert.equal(editorSourcePath('opening.mp4'), 'opening.mp4')
})

test('catalog clip binding keeps workspace URL and does not invent a re-upload', async () => {
  const { videoEditorClipFromOutput } = await import('../src/features/video-editor/videoEditorCatalogPick.ts')
  const item = {
    name: 'opening.mp4',
    type: 'video' as const,
    mode: 'video',
    size: 12,
    created_at: 1,
    url: '/api/v1/file/opening.mp4?workspace=film',
    thumbnail_url: '/api/v1/outputs/thumbnail/opening.mp4?workspace=film',
    workspace_id: 'film',
    path: 'opening.mp4',
    asset_id: 'asset-opening',
  }
  const next = videoEditorClipFromOutput(item, 'film')
  assert.equal(next.source, item.url)
  assert.equal(next.previewUrl, item.url)
  assert.equal(next.name, 'opening.mp4')
  assert.equal(next.thumbnailUrl, item.thumbnail_url)
})

test('Video Editor keeps device import and library origin without opening the explorer', { concurrency: false }, async () => {
  const { render, screen, cleanup } = await import('@testing-library/react')
  const { VideoEditorPanel } = await import('../src/features/video-editor/VideoEditorPanel.tsx')
  dom.window.localStorage.clear()
  globalThis.fetch = (async () => {
    return { ok: true, json: async () => ({}) } as Response
  }) as typeof fetch
  const view = render(<VideoEditorPanel />)
  assert.ok(screen.getByRole('button', { name: 'From HocusPocus' }))
  assert.ok(screen.getByRole('button', { name: 'Import' }))
  assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
  view.unmount()
  cleanup()
})
