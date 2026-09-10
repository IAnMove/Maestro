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

test('template slot picker exposes From my computer and From HocusPocus', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { TemplateAssetPicker } = await import('../src/features/sceneTemplates/TemplateAssetPicker.tsx')
  try {
    render(<TemplateAssetPicker workspace="default" kinds={['image']} onPick={() => undefined} />)
    assert.ok(screen.getByRole('button', { name: /From my computer/ }))
    fireEvent.click(screen.getByRole('button', { name: /From HocusPocus/ }))
    assert.ok(await screen.findByTestId('asset-explorer'))
  } finally {
    cleanup()
  }
})
