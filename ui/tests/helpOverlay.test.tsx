import assert from 'node:assert/strict'
import test from 'node:test'
import React, { useEffect, useState } from 'react'
import { JSDOM } from 'jsdom'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    Event: dom.window.Event,
    MutationObserver: dom.window.MutationObserver,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    React,
  })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  })
}

installDom()

test('Help opens the tutorial overlay in English and Spanish', async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { useStore } = await import('../src/stores/useStore.ts')
  const { TabFilter } = await import('../src/components/MainContent/TabFilter.tsx')
  const { HelpOverlay } = await import('../src/components/Help/HelpOverlay.tsx')
  const { setUiLanguage } = await import('../src/i18n/index.ts')
  await setUiLanguage('en')
  useStore.setState({ mediaFilter: 'all', outputSearchQuery: '' })

  function OpenableHelp() {
    const [open, setOpen] = useState(false)
    useEffect(() => {
      const onOpen = () => setOpen(true)
      window.addEventListener('hocuspocus:help-open', onOpen)
      return () => window.removeEventListener('hocuspocus:help-open', onOpen)
    }, [])
    return (
      <>
        <TabFilter />
        <HelpOverlay open={open} onClose={() => setOpen(false)} />
      </>
    )
  }

  try {
    render(<OpenableHelp />)
    fireEvent.click(screen.getByRole('button', { name: 'Open the HocusPocus tutorial' }))
    assert.ok(screen.getByRole('dialog', { name: 'How to use HocusPocus' }))
    assert.ok(screen.getByText('Talking faces (9×6 pack)'))
    assert.ok(screen.getByText('Cut-paper example (Tijeral)'))
    fireEvent.change(screen.getByLabelText('Tutorial language'), { target: { value: 'es' } })
    assert.ok(screen.getByRole('dialog', { name: 'Cómo usar HocusPocus' }))
    assert.ok(screen.getByText('Caras que hablan (pack 9×6)'))
    assert.ok(screen.getByRole('button', { name: 'Abrir el tutorial de HocusPocus' }))
    assert.ok(screen.getByText('Ayuda'))
  } finally {
    cleanup()
    await setUiLanguage('en')
  }
})
