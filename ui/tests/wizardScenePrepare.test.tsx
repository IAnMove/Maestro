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
const { prepareWizardScene } = await import('../src/features/sceneFx/wizard')
const { useSceneDocumentHandoff } = await import('../src/features/sceneFx/handoff')
const { render, waitFor, cleanup, act } = await import('@testing-library/react')
const command = { version: 1 as const, operation: 'scenes.effects.showcase', input: { dimension: '3d', sound: true } }
const document = createDefaultScene3DDocument()
const originalFetch = globalThis.fetch
test.afterEach(() => { cleanup(); globalThis.fetch = originalFetch; sessionStorage.clear() })

function prepared(sha256 = 'digest-one') {
  return Response.json({ status: 'completed', result: { state: 'prepared', document, sha256 } })
}

test('a late Wizard scene must not open after the footer workspace changes', async () => {
  useStore.setState({ activeWorkspace: 'one', browsingUploads: false, mediaFilter: 'video' })
  let release!: (value: Response) => void, commits = 0
  globalThis.fetch = async () => new Promise<Response>(resolve => { release = resolve })
  const opening = prepareWizardScene(command)
  const rejected = assert.rejects(opening, /Workspace changed/)
  await waitFor(() => assert.ok(release))
  await act(async () => { useStore.setState({ activeWorkspace: 'two', mediaFilter: 'video' }) })
  await act(async () => { release(prepared()) })
  await rejected
  function Editor() { useSceneDocumentHandoff('3d', () => { commits++ }); return null }
  render(<Editor />)
  assert.equal(commits, 0)
  assert.equal(useStore.getState().mediaFilter, 'video')
  assert.equal(useStore.getState().activeWorkspace, 'two')
  assert.ok(sessionStorage.getItem('hocuspocus:prepared-scene:digest-one'))
})

test('a current Wizard scene still reaches its editor exactly once', async () => {
  useStore.setState({ activeWorkspace: 'one', browsingUploads: false, mediaFilter: 'video' })
  globalThis.fetch = async () => prepared('digest-ok')
  let commits = 0
  function Editor() { useSceneDocumentHandoff('3d', () => { commits++ }); return null }
  render(<Editor />)
  await act(async () => { await prepareWizardScene(command) })
  assert.equal(commits, 1)
  assert.equal(useStore.getState().mediaFilter, 'world3d')
  assert.ok(sessionStorage.getItem('hocuspocus:prepared-scene:digest-ok'))
})
