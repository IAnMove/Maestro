import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'
import { createDefaultScene3DDocument } from '../src/features/scene3d/document'
const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event, MutationObserver: dom.window.MutationObserver, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const { useStore } = await import('../src/stores/useStore')
const { openSceneOutput } = await import('../src/lib/sceneOutput')
const { useSceneDocumentHandoff } = await import('../src/features/sceneFx/handoff')
const { render, waitFor, cleanup, act } = await import('@testing-library/react')
const file = { name: 'a.world3d.scene.json', url: '/a.json?workspace=one', type: 'scene' as const, mode: null, favorite: false, size: 1, created_at: 1 }
const originalFetch = globalThis.fetch
test.afterEach(() => { cleanup(); globalThis.fetch = originalFetch })

for (const phase of ['fetch', 'mount', 'return']) test(`saved scene cannot cross a workspace change during ${phase}`, async () => {
  useStore.setState({ activeWorkspace: 'one', browsingUploads: false, mediaFilter: 'video' })
  let release!: (value: Response) => void, commits = 0
  globalThis.fetch = async () => new Promise<Response>(resolve => { release = resolve })
  const opening = openSceneOutput(file)
  const rejected = assert.rejects(opening, /Workspace changed|cancelled/)
  await waitFor(() => assert.ok(release))
  if (phase === 'mount') {
    await act(async () => { release(Response.json(createDefaultScene3DDocument())) })
    await waitFor(() => assert.equal(useStore.getState().mediaFilter, 'world3d'))
  }
  await act(async () => { useStore.setState({ activeWorkspace: 'two', mediaFilter: 'video' }) })
  // Even a transport ignoring AbortSignal must not publish a late response.
  if (phase === 'return') await act(async () => { useStore.setState({ activeWorkspace: 'one' }) })
  if (phase !== 'mount') release(Response.json(createDefaultScene3DDocument()))
  await rejected
  function Editor() { useSceneDocumentHandoff('3d', () => { commits++ }); return null }
  render(<Editor />)
  assert.equal(commits, 0)
  assert.equal(useStore.getState().mediaFilter, 'video')
})

test('a current saved 3D scene reaches its editor exactly once', async () => {
  useStore.setState({ activeWorkspace: 'one', browsingUploads: false })
  globalThis.fetch = async () => Response.json(createDefaultScene3DDocument())
  let commits = 0
  function Editor() { useSceneDocumentHandoff('3d', () => { commits++ }); return null }
  render(<Editor />)
  await act(async () => { await openSceneOutput(file) })
  assert.equal(commits, 1)
  assert.equal(useStore.getState().mediaFilter, 'world3d')
})

test('legacy 2D scene outputs still reach the 2D editor', async () => {
  useStore.setState({ activeWorkspace: 'one', browsingUploads: false })
  globalThis.fetch = async () => Response.json({ version: 1, name: 'Legacy', width: 640, height: 360, duration: 3, layers: [] })
  let commits = 0
  function Editor() { useSceneDocumentHandoff('2d', () => { commits++ }); return null }
  render(<Editor />)
  await act(async () => { await openSceneOutput({ ...file, name: 'legacy.scene.json' }) })
  assert.equal(commits, 1)
  assert.equal(useStore.getState().mediaFilter, 'scene3d')
})
