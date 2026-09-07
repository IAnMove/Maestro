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
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

function countOrigins() {
  const library = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From HocusPocus'))
  const device = [...document.querySelectorAll('button')].filter(button => button.textContent?.includes('From my computer'))
  return { library: library.length, device: device.length }
}

function emptyClip(partial: Record<string, unknown> = {}) {
  return {
    prompt: '',
    startImage: null,
    startImagePath: null,
    endImage: null,
    endImagePath: null,
    durationFrames: 16,
    keyframes: [],
    ...partial,
  }
}

test('VideoEditControls exposes dual-origin slots without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { VideoEditControls } = await import('../src/components/Sidebar/VideoEditControls.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch()
  useStore.setState({ activeWorkspace: 'default', params: {} } as never)
  try {
    render(<VideoEditControls />)
    const origins = countOrigins()
    assert.ok(origins.library >= 2, 'source video and optional ref image library origins')
    assert.ok(origins.device >= 2, 'source video and optional ref image device origins')
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})

test('MultiClipEditor start and keyframe slots stay dual-origin without opening the explorer', { concurrency: false }, async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { MultiClipEditor } = await import('../src/components/Sidebar/MultiClipEditor.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch()
  useStore.setState({
    activeWorkspace: 'default',
    singlePromptMode: false,
    studioFocusedClipIndex: 0,
    slidingWindowSeconds: 5,
    clips: [emptyClip({ prompt: 'shot one' }), emptyClip({ prompt: 'shot two', durationFrames: 24 })],
  } as never)
  try {
    render(<MultiClipEditor />)
    const origins = countOrigins()
    assert.ok(origins.library >= 2, 'start image and keyframe add library origins')
    assert.ok(origins.device >= 2, 'start image and keyframe add device origins')
    assert.equal(document.querySelector('[data-testid="asset-explorer"]'), null)
    assert.match(document.body.textContent || '', /24f/)
  } finally {
    cleanup()
    document.body.innerHTML = ''
    globalThis.fetch = previousFetch
  }
})

test('catalog start and keyframes bind per clip without clearing range or sibling shots', { concurrency: false }, async () => {
  const { useStore } = await import('../src/stores/useStore.ts')
  useStore.setState({
    clips: [
      emptyClip({ prompt: 'keep me', durationFrames: 12 }),
      emptyClip({ prompt: 'other', durationFrames: 20 }),
    ],
  } as never)
  useStore.getState().setClipStartImage(0, null, 'workspace/clip-a.png')
  useStore.getState().setClipStartImage(1, null, 'workspace/clip-b.png')
  useStore.getState().addClipKeyframe(0, null, 'workspace/kf-1.png')
  useStore.getState().addClipKeyframe(0, null, 'workspace/kf-2.png')
  const clips = useStore.getState().clips
  assert.equal(clips[0].startImagePath, 'workspace/clip-a.png')
  assert.equal(clips[1].startImagePath, 'workspace/clip-b.png')
  assert.equal(clips[0].prompt, 'keep me')
  assert.equal(clips[1].prompt, 'other')
  assert.equal(clips[0].durationFrames, 12)
  assert.equal(clips[1].durationFrames, 20)
  assert.deepEqual(clips[0].keyframes.map(item => item.path), ['workspace/kf-1.png', 'workspace/kf-2.png'])
  assert.equal(clips[1].keyframes.length, 0)
  useStore.getState().setClipStartImage(0, null)
  assert.equal(useStore.getState().clips[0].startImagePath, null)
  assert.equal(useStore.getState().clips[1].startImagePath, 'workspace/clip-b.png')
})
