import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  HTMLCanvasElement: dom.window.HTMLCanvasElement, MutationObserver: dom.window.MutationObserver, localStorage: dom.window.localStorage })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

test('scene shortcuts respect focus, typing, modifiers and editing lock; translated help ends with interaction', async () => {
  const { render, fireEvent, cleanup, act } = await import('@testing-library/react')
  const { Scene3DInteraction } = await import('../src/features/scene3d/Scene3DInteraction')
  const { ensureUiI18n, setUiLanguage } = await import('../src/i18n')
  await ensureUiI18n()
  const changes: string[] = []
  const scene = (enabled: boolean) => <Scene3DInteraction enabled={enabled} width={1280} height={720} onMode={mode => changes.push(mode)}><canvas /><input aria-label="Test input" /></Scene3DInteraction>
  const view = render(scene(true))
  try {
    await act(async () => { await setUiLanguage('en') })
    const viewport = view.getByRole('region', { name: '3D scene' })
    fireEvent.focus(viewport)
    assert.match(view.getByRole('status').textContent!, /R to rotate.*S to scale.*G to move/)
    fireEvent.keyDown(viewport, { key: 'r' })
    fireEvent.keyDown(viewport, { key: 'S' })
    fireEvent.keyDown(viewport, { key: 'g' })
    assert.deepEqual(changes, ['rotate', 'scale', 'translate'])
    for (const extras of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) fireEvent.keyDown(viewport, { key: 'r', ...extras })
    fireEvent.keyDown(view.getByRole('textbox'), { key: 'r' })
    assert.equal(changes.length, 3)
    fireEvent.pointerUp(viewport)
    assert.equal(view.queryByRole('status'), null)
    fireEvent.keyDown(viewport, { key: 's' })
    assert.ok(view.getByRole('status'))
    fireEvent.blur(viewport)
    assert.equal(view.queryByRole('status'), null)
    await act(async () => { await setUiLanguage('es') })
    fireEvent.focus(viewport)
    assert.match(view.getByRole('status').textContent!, /R para girar.*S para escalar.*G para mover/)
    view.rerender(scene(false))
    fireEvent.keyDown(viewport, { key: 'r' })
    assert.equal(changes.length, 4)
    assert.equal(view.queryByRole('status'), null)
    assert.equal(viewport.tabIndex, -1)
  } finally { cleanup(); await setUiLanguage('en') }
})
