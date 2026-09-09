import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
  HTMLElement: dom.window.HTMLElement, HTMLButtonElement: dom.window.HTMLButtonElement,
  HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, MessageEvent: dom.window.MessageEvent,
  MutationObserver: dom.window.MutationObserver, React,
  ResizeObserver: class { observe() {} disconnect() {} },
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: () => undefined })
window.matchMedia = () => ({ matches: false }) as MediaQueryList
window.requestAnimationFrame = callback => { callback(0); return 1 }
window.cancelAnimationFrame = () => undefined

test('Wizard chat displays a rejected create_story and persists no invented success', { concurrency: false }, async () => {
  const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react')
  const { AgentAssistantPanel } = await import('../src/features/agent/AgentAssistantPanel.tsx')
  const { useStore } = await import('../src/stores/useStore.ts')
  const originalFetch = globalThis.fetch
  const originalEventSource = globalThis.EventSource
  let writes: unknown[] = []
  let revision = 0
  const effects: string[] = []
  const question = 'Create a Story Lab project named Nightwatch using my settings.'
  Object.defineProperty(globalThis, 'EventSource', { configurable: true, value: class { addEventListener() {} close() {} } })
  const respond = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const method = init?.method || 'GET'
    if (url.includes('/api/v1/wizard/workflows')) return respond({ version: 1, revision: 0, workflows: [] })
    if (url.includes('/api/v1/wizard/conversations')) {
      if (method === 'PUT') { writes = JSON.parse(String(init?.body)).conversation.messages; revision += 1 }
      return respond({ version: 1, revision, messages: writes, executions: [] })
    }
    if (url.includes('/api/v1/outputs')) return respond({ outputs: [], total: 0 })
    if (url.includes('/api/v1/assets')) return respond({ assets: [], total: 0 })
    if (url.includes('/api/v1/llm/generate')) return respond({ text: JSON.stringify({
      reply: 'I created story-invented-999 successfully.', conversation_language: 'en',
      actions: [{ type: 'create_story', title: 'Nightwatch' }],
    }) })
    effects.push(`${method} ${url}`)
    throw new Error(`Unexpected effect: ${method} ${url}`)
  }
  useStore.setState({ activeWorkspace: 'truthfulness-dom', mediaFilter: 'all' })
  try {
    render(<AgentAssistantPanel workspace="truthfulness-dom" tasks={[]} onClose={() => undefined} />)
    const textarea = screen.getByPlaceholderText('Ask HocusPocus for a spell…')
    fireEvent.change(textarea, { target: { value: question } })
    fireEvent.submit(textarea.closest('form')!)
    await waitFor(() => assert.ok(window.__HOCUSPOCUS_WIZARD_TRACE__?.some(item => item.question === question && item.results)))
    await waitFor(() => assert.match(document.body.textContent || '', /No action was executed in this turn/))
    assert.match(document.body.textContent || '', /Actions not executed/)
    assert.doesNotMatch(document.body.textContent || '', /story-invented-999|successfully/)
    const trace = window.__HOCUSPOCUS_WIZARD_TRACE__!.find(item => item.question === question)!
    assert.deepEqual(trace.results, [])
    assert.equal((trace.turn as { rejections: { code: string }[] }).rejections[0].code, 'invalid_action')
    assert.deepEqual(effects, [])
    await waitFor(() => assert.ok(JSON.stringify(writes).includes('No action was executed')))
    assert.doesNotMatch(JSON.stringify(writes), /story-invented-999/)
  } finally {
    cleanup()
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'EventSource', { configurable: true, value: originalEventSource })
  }
})
