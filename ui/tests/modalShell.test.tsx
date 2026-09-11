import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  })
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    KeyboardEvent: dom.window.KeyboardEvent,
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  })
}

installDom()

test('ModalShell names the dialog, focuses it, traps Tab, and restores focus', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { ModalShell } = await import('../src/components/common/ModalShell.tsx')
  const opener = document.createElement('button')
  opener.type = 'button'
  opener.textContent = 'Open'
  document.body.append(opener)
  opener.focus()
  let closed = 0

  try {
    const view = render(
      <ModalShell open title="Example dialog" onClose={() => { closed += 1 }}>
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </ModalShell>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Example dialog' })
    const [first, last] = [
      screen.getByRole('button', { name: 'First action' }),
      screen.getByRole('button', { name: 'Last action' }),
    ]
    assert.equal(dialog.getAttribute('aria-modal'), 'true')
    assert.equal(document.activeElement, first)

    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    assert.equal(document.activeElement, first)
    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    assert.equal(document.activeElement, last)

    fireEvent.keyDown(document, { key: 'Escape' })
    assert.equal(closed, 1)
    view.unmount()
    assert.equal(document.activeElement, opener)
  } finally {
    cleanup()
    opener.remove()
  }
})

test('ModalShell restores focus when its open state closes', { concurrency: false }, async () => {
  const { render, screen, cleanup } = await import('@testing-library/react')
  const { ModalShell } = await import('../src/components/common/ModalShell.tsx')
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()

  try {
    const view = render(<ModalShell open title="Closable" onClose={() => undefined}><button>Done</button></ModalShell>)
    assert.equal(document.activeElement, screen.getByRole('button', { name: 'Done' }))
    view.rerender(<ModalShell open={false} title="Closable" onClose={() => undefined}><button>Done</button></ModalShell>)
    assert.equal(document.activeElement, opener)
  } finally {
    cleanup()
    opener.remove()
  }
})

test('a nested modal escapes its clipped parent and Escape closes only the child', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { ModalShell } = await import('../src/components/common/ModalShell.tsx')
  let parentCloses = 0
  let windowEscapes = 0
  const onWindow = () => { windowEscapes += 1 }
  window.addEventListener('keydown', onWindow)
  function Example() {
    const [open, setOpen] = React.useState(false)
    return <div style={{ transform: 'translateX(0)', overflow: 'hidden', width: 300 }}>
      <ModalShell open title="Parent" onClose={() => { parentCloses += 1 }}>
        <button onClick={() => setOpen(true)}>Open child</button>
        <ModalShell open={open} title="Child" onClose={() => setOpen(false)}><button>Choose</button></ModalShell>
      </ModalShell>
    </div>
  }
  try {
    render(<Example />)
    fireEvent.click(screen.getByText('Open child'))
    const child = screen.getByRole('dialog', { name: 'Child' })
    assert.equal(child.parentElement === document.body, true)
    fireEvent.keyDown(document, { key: 'Escape', bubbles: true })
    assert.equal(screen.queryByRole('dialog', { name: 'Child' }), null)
    assert.equal(parentCloses, 0)
    assert.equal(windowEscapes, 0)
    assert.equal(document.activeElement === screen.getByText('Open child'), true)
  } finally {
    cleanup()
    window.removeEventListener('keydown', onWindow)
  }
})
