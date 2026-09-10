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
  HTMLMediaElement: dom.window.HTMLMediaElement,
  HTMLVideoElement: dom.window.HTMLVideoElement,
  HTMLAudioElement: dom.window.HTMLAudioElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  MutationObserver: dom.window.MutationObserver,
  ResizeObserver: class { observe() {} disconnect() {} },
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
if (globalThis.HTMLMediaElement?.prototype) {
  globalThis.HTMLMediaElement.prototype.pause = function pause() {}
  globalThis.HTMLMediaElement.prototype.load = function load() {}
}

function videoItem(name: string) {
  return {
    name, type: 'video' as const, mode: null, size: 12, created_at: 1_700_000_000,
    url: `/api/v1/file/${name}`, thumbnail_url: `/api/v1/file/${name}.png`,
  }
}

test('preview does not mount a video until Play, and switching items pauses it', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { outputToPickerItem } = await import('../src/features/asset-picker/index.ts')
  const { AssetPreviewPlayer } = await import('../src/features/asset-picker/previewPlayer.tsx')
  const paused: string[] = []
  const proto = globalThis.HTMLMediaElement?.prototype
  const originalPause = proto?.pause
  const originalLoad = proto?.load
  if (proto) {
    proto.pause = function pause() { paused.push(this.getAttribute('src') || this.src || '') }
    proto.load = function load() {}
  }
  const first = outputToPickerItem(videoItem('clip-a.mp4'), 'default')
  const second = outputToPickerItem(videoItem('clip-b.mp4'), 'default')
  try {
    const view = render(<AssetPreviewPlayer item={first} />)
    assert.equal(screen.queryByTestId('asset-preview-video'), null)
    fireEvent.click(screen.getByTestId('asset-preview-arm'))
    assert.ok(screen.getByTestId('asset-preview-video'))
    view.rerender(<AssetPreviewPlayer item={second} />)
    assert.ok(paused.length >= 1)
    assert.equal(screen.queryByTestId('asset-preview-video'), null)
  } finally {
    if (proto && originalPause) proto.pause = originalPause
    if (proto && originalLoad) proto.load = originalLoad
    cleanup()
  }
})

test('unmounting the preview pauses media', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { outputToPickerItem } = await import('../src/features/asset-picker/index.ts')
  const { AssetPreviewPlayer } = await import('../src/features/asset-picker/previewPlayer.tsx')
  const paused: string[] = []
  const proto = globalThis.HTMLMediaElement?.prototype
  const originalPause = proto?.pause
  const originalLoad = proto?.load
  if (proto) {
    proto.pause = function pause() { paused.push('paused') }
    proto.load = function load() {}
  }
  try {
    render(<AssetPreviewPlayer item={outputToPickerItem(videoItem('clip.mp4'), 'default')} />)
    fireEvent.click(screen.getByTestId('asset-preview-arm'))
    cleanup()
    assert.ok(paused.includes('paused'))
  } finally {
    if (proto && originalPause) proto.pause = originalPause
    if (proto && originalLoad) proto.load = originalLoad
  }
})

test('Play in the explorer preview does not confirm the choice', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { AssetExplorerDialog } = await import('../src/components/common/AssetExplorerDialog.tsx')
  const chosen: string[] = []
  try {
    render(
      <AssetExplorerDialog
        open
        title="Choose media"
        items={[videoItem('plate.mp4')]}
        selectedName="plate.mp4"
        onClose={() => undefined}
        onChoose={item => { if (item) chosen.push(item.name) }}
      />,
    )
    fireEvent.click(screen.getByTestId('asset-preview-arm'))
    assert.deepEqual(chosen, [])
    assert.ok(screen.getByTestId('asset-preview-video'))
  } finally {
    cleanup()
  }
})
