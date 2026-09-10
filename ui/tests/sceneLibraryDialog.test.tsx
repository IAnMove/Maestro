import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

// tsx's Node test transform uses the classic JSX factory for nested UI files.
// Vite uses the automatic runtime in production, so expose the factory only here.
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

test('the 3D Video library dialog paginates saved scenes and opens a previewed project', { concurrency: false }, async () => {
  const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react')
  const { SceneLibraryDialog } = await import('../src/components/Sidebar/SceneLibraryDialog.tsx')
  const originalFetch = globalThis.fetch
  const scenes = Array.from({ length: 9 }, (_, index) => ({
    name: `2026-08-25-22h21m0${index}s_Station-loop-${index}_aaaaaa.scene.json`,
    type: 'scene',
    mode: null,
    size: 12,
    created_at: 1000 + index,
    url: `/api/v1/file/scene-${index}.scene.json`,
    thumbnail_url: `/api/v1/file/scene-${index}.scene.preview.png`,
  }))
  const sampleScene = {
    version: 1,
    name: 'Station loop 0',
    width: 1280,
    height: 720,
    duration: 10,
    layers: [{
      id: 'plate', name: 'Plate', type: 'image', source: '/api/v1/file/plate.jpg', visible: true, z: 0,
      transform: { x: 50, y: 50, scale: 1, opacity: 1 },
      animation: { start: { x: 50, y: 50, scale: 1 }, end: { x: 50, y: 50, scale: 1 }, duration: 10, curve: 'linear' },
    }],
  }
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/api/v1/outputs') && url.includes('media_type=scene')) {
      const parsed = new URL(url, 'http://localhost')
      const offset = Number(parsed.searchParams.get('offset') || 0)
      return new Response(JSON.stringify({ outputs: scenes.slice(offset, offset + 8), total: scenes.length }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/v1/file/scene-0.scene.json')) {
      return new Response(JSON.stringify(sampleScene), { headers: { 'content-type': 'application/json' } })
    }
    throw new Error(`Unexpected request: ${url}`)
  }) as typeof fetch
  const opened: string[] = []
  try {
    render(<SceneLibraryDialog open workspace="default" onClose={() => undefined} onPickFile={() => undefined} onOpenScene={scene => opened.push(scene.name)} />)
    await waitFor(() => assert.ok(screen.getAllByText('Station loop 0').length >= 1))
    assert.match(screen.getByText(/saved · page/).textContent || '', /9 saved · page 1 \/ 2/)
    assert.equal(screen.queryByRole('button', { name: 'Open scene' }), null)
    fireEvent.click(screen.getByLabelText('Next page'))
    await waitFor(() => assert.ok(screen.getAllByText('Station loop 8').length >= 1))
    fireEvent.click(screen.getByLabelText('Previous page'))
    await waitFor(() => assert.ok(screen.getAllByText('Station loop 0').length >= 1))
    fireEvent.doubleClick(screen.getAllByText('Station loop 0')[0])
    assert.deepEqual(opened, [])
    fireEvent.click(screen.getAllByText('Station loop 0')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Open scene' }))
    await waitFor(() => assert.deepEqual(opened, ['Station loop 0']))
  } finally {
    cleanup()
    globalThis.fetch = originalFetch
  }
})

test('closing the library before a scene fetch settles does not replace the current project', { concurrency: false }, async () => {
  const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react')
  const { SceneLibraryDialog } = await import('../src/components/Sidebar/SceneLibraryDialog.tsx')
  const originalFetch = globalThis.fetch
  const sceneFile = {
    name: '2026-08-25-22h21m00s_Station-loop-0_aaaaaa.scene.json',
    type: 'scene',
    mode: null,
    size: 12,
    created_at: 1000,
    url: '/api/v1/file/scene-0.scene.json',
    thumbnail_url: '/api/v1/file/scene-0.scene.preview.png',
  }
  const sampleScene = {
    version: 1,
    name: 'Station loop 0',
    width: 1280,
    height: 720,
    duration: 10,
    layers: [{
      id: 'plate', name: 'Plate', type: 'image', source: '/api/v1/file/plate.jpg', visible: true, z: 0,
      transform: { x: 50, y: 50, scale: 1, opacity: 1 },
      animation: { start: { x: 50, y: 50, scale: 1 }, end: { x: 50, y: 50, scale: 1 }, duration: 10, curve: 'linear' },
    }],
  }
  let releaseScene: ((value: Response) => void) | undefined
  const sceneGate = new Promise<Response>(resolve => { releaseScene = resolve })
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/api/v1/outputs') && url.includes('media_type=scene')) {
      return new Response(JSON.stringify({ outputs: [sceneFile], total: 1 }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/v1/file/scene-0.scene.json')) return sceneGate
    throw new Error(`Unexpected request: ${url}`)
  }) as typeof fetch
  const opened: string[] = []
  try {
    const view = render(<SceneLibraryDialog open workspace="default" onClose={() => undefined} onPickFile={() => undefined} onOpenScene={scene => opened.push(scene.name)} />)
    await waitFor(() => assert.ok(screen.getAllByText('Station loop 0').length >= 1))
    fireEvent.click(screen.getAllByText('Station loop 0')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Open scene' }))
    view.rerender(<SceneLibraryDialog open={false} workspace="default" onClose={() => undefined} onPickFile={() => undefined} onOpenScene={scene => opened.push(scene.name)} />)
    view.rerender(<SceneLibraryDialog open workspace="default" onClose={() => undefined} onPickFile={() => undefined} onOpenScene={scene => opened.push(scene.name)} />)
    releaseScene?.(new Response(JSON.stringify(sampleScene), { headers: { 'content-type': 'application/json' } }))
    await Promise.resolve()
    await Promise.resolve()
    assert.deepEqual(opened, [])
  } finally {
    cleanup()
    globalThis.fetch = originalFetch
  }
})

test('a later library confirm wins over a slower first scene fetch', { concurrency: false }, async () => {
  const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react')
  const { SceneLibraryDialog } = await import('../src/components/Sidebar/SceneLibraryDialog.tsx')
  const originalFetch = globalThis.fetch
  const scenes = Array.from({ length: 9 }, (_, index) => ({
    name: `2026-08-25-22h21m0${index}s_Station-loop-${index}_aaaaaa.scene.json`,
    type: 'scene',
    mode: null,
    size: 12,
    created_at: 1000 + index,
    url: `/api/v1/file/scene-${index}.scene.json`,
    thumbnail_url: `/api/v1/file/scene-${index}.scene.preview.png`,
  }))
  const sceneFor = (index: number) => ({
    version: 1,
    name: `Station loop ${index}`,
    width: 1280,
    height: 720,
    duration: 10,
    layers: [{
      id: 'plate', name: 'Plate', type: 'image', source: '/api/v1/file/plate.jpg', visible: true, z: 0,
      transform: { x: 50, y: 50, scale: 1, opacity: 1 },
      animation: { start: { x: 50, y: 50, scale: 1 }, end: { x: 50, y: 50, scale: 1 }, duration: 10, curve: 'linear' },
    }],
  })
  let releaseFirst: ((value: Response) => void) | undefined
  let releaseSecond: ((value: Response) => void) | undefined
  const firstGate = new Promise<Response>(resolve => { releaseFirst = resolve })
  const secondGate = new Promise<Response>(resolve => { releaseSecond = resolve })
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/api/v1/outputs') && url.includes('media_type=scene')) {
      const parsed = new URL(url, 'http://localhost')
      const offset = Number(parsed.searchParams.get('offset') || 0)
      return new Response(JSON.stringify({ outputs: scenes.slice(offset, offset + 8), total: scenes.length }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/v1/file/scene-0.scene.json')) return firstGate
    if (url.includes('/api/v1/file/scene-8.scene.json')) return secondGate
    throw new Error(`Unexpected request: ${url}`)
  }) as typeof fetch
  const opened: string[] = []
  try {
    render(<SceneLibraryDialog open workspace="default" onClose={() => undefined} onPickFile={() => undefined} onOpenScene={scene => opened.push(scene.name)} />)
    await waitFor(() => assert.ok(screen.getAllByText('Station loop 0').length >= 1))
    fireEvent.click(screen.getAllByText('Station loop 0')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Open scene' }))
    fireEvent.click(screen.getByLabelText('Next page'))
    await waitFor(() => assert.ok(screen.getAllByText('Station loop 8').length >= 1))
    fireEvent.click(screen.getAllByText('Station loop 8')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Open scene' }))
    releaseFirst?.(new Response(JSON.stringify(sceneFor(0)), { headers: { 'content-type': 'application/json' } }))
    await Promise.resolve()
    await Promise.resolve()
    assert.deepEqual(opened, [])
    releaseSecond?.(new Response(JSON.stringify(sceneFor(8)), { headers: { 'content-type': 'application/json' } }))
    await waitFor(() => assert.deepEqual(opened, ['Station loop 8']))
  } finally {
    cleanup()
    globalThis.fetch = originalFetch
  }
})

test('recovering a Video3D MP4 opens the 3D document instead of the empty 2D stub', { concurrency: false }, async () => {
  const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react')
  const { createDefaultScene3DDocument } = await import('../src/features/scene3d/document.ts')
  const { world3dRecordingStub } = await import('../src/features/scene3d/publish.ts')
  const { SceneLibraryDialog } = await import('../src/components/Sidebar/SceneLibraryDialog.tsx')
  const originalFetch = globalThis.fetch
  const document = createDefaultScene3DDocument()
  document.slots[0].sourceUrl = '/api/v1/file/hero.glb'
  const clip = {
    name: '2026-09-10-12h00m00s_world3d-two-shot_3d_aabbcc.mp4',
    type: 'video',
    mode: 'video',
    size: 12,
    created_at: 1000,
    completed_at: 1000,
    url: '/api/v1/file/world3d-two-shot_3d_aabbcc.mp4',
    thumbnail_url: '/api/v1/file/world3d-two-shot_3d_aabbcc.mp4',
  }
  const compositor = {
    name: '2026-09-10-12h00m01s_station-runner_3d_112233.mp4',
    type: 'video',
    mode: 'video',
    size: 12,
    created_at: 1001,
    completed_at: 1001,
    url: '/api/v1/file/station-runner_3d_112233.mp4',
    thumbnail_url: '/api/v1/file/station-runner_3d_112233.mp4',
  }
  const compositorScene = {
    version: 1,
    name: 'Station loop runner',
    width: 1280,
    height: 720,
    duration: 10,
    layers: [{
      id: 'plate', name: 'Plate', type: 'image', source: '/api/v1/file/plate.jpg', visible: true, z: 0,
      transform: { x: 50, y: 50, scale: 1, opacity: 1 },
      animation: { start: { x: 50, y: 50, scale: 1 }, end: { x: 50, y: 50, scale: 1 }, duration: 10, curve: 'linear' },
    }],
  }
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/api/v1/outputs') && url.includes('media_type=video')) {
      return new Response(JSON.stringify({ outputs: [clip, compositor], total: 2 }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/v1/outputs') && url.includes('media_type=scene')) {
      return new Response(JSON.stringify({ outputs: [], total: 0 }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes(`/api/v1/outputs/${encodeURIComponent(clip.name)}/metadata`)) {
      return new Response(JSON.stringify({
        source: 'sidecar',
        params: {
          generation_mode: '3d-scene-compositor',
          scene: world3dRecordingStub(document),
          scene_recipe: { engine: 'world3d', document, templateId: document.templateId, slots: document.slots },
        },
      }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes(`/api/v1/outputs/${encodeURIComponent(compositor.name)}/metadata`)) {
      return new Response(JSON.stringify({ source: 'sidecar', params: { scene: compositorScene } }), { headers: { 'content-type': 'application/json' } })
    }
    throw new Error(`Unexpected request: ${url}`)
  }) as typeof fetch
  const opened2d: string[] = []
  const opened3d: string[] = []
  try {
    render(<SceneLibraryDialog
      open
      workspace="default"
      onClose={() => undefined}
      onPickFile={() => undefined}
      onOpenScene={scene => opened2d.push(scene.name)}
      onOpenWorld3D={next => opened3d.push(next.slots[0]?.sourceUrl || '')}
    />)
    fireEvent.click(screen.getByRole('button', { name: '3D videos' }))
    await waitFor(() => assert.ok(screen.getAllByText('world3d two shot').length >= 1))
    fireEvent.click(screen.getAllByText('world3d two shot')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Recover recipe' }))
    await waitFor(() => assert.deepEqual(opened3d, ['/api/v1/file/hero.glb']))
    assert.deepEqual(opened2d, [])
    fireEvent.click(screen.getAllByText('station runner')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Recover recipe' }))
    await waitFor(() => assert.deepEqual(opened2d, ['Station loop runner']))
    assert.deepEqual(opened3d, ['/api/v1/file/hero.glb'])
  } finally {
    cleanup()
    globalThis.fetch = originalFetch
  }
})
