import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLFieldSetElement: dom.window.HTMLFieldSetElement,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
  localStorage: dom.window.localStorage,
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => undefined,
})
dom.window.requestAnimationFrame = callback => { callback(0); return 1 }
dom.window.cancelAnimationFrame = () => undefined

const { act, cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react')
const { WorkspaceCollectionsPanel } = await import('../src/features/workspaceCollections/WorkspaceCollectionsPanel.tsx')
const { createWorkspaceCollectionAdapter } = await import('../src/features/agent/workspaceCollectionAdapter.ts')
const { cancelCollectionPresentation } = await import('../src/features/workspaceCollections/collectionPresentation.ts')
const { pendingCollectionCommands } = await import('../src/api/workspaceCommands.ts')

interface Collection {
  schema: 'hocuspocus.workspace-record'
  schema_version: 1
  id: string
  revision: number
  name: string
  description: string
  project_ids: string[]
  asset_ids: string[]
  production_ids: string[]
  created_at: string | null
  updated_at: string | null
}

interface FetchOptions {
  initial?: Collection[]
  workspaceResponse?: () => Promise<Response> | Response
  onCommand?: (body: Record<string, unknown>) => Promise<Response> | Response | undefined
}

interface FetchState {
  commandBodies: Array<Record<string, unknown>>
}

const originalFetch = globalThis.fetch

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function collection(overrides: Partial<Collection> = {}): Collection {
  return {
    schema: 'hocuspocus.workspace-record',
    schema_version: 1,
    id: 'collection-old',
    revision: 2,
    name: 'Old collection',
    description: 'Loaded before the command',
    project_ids: [],
    asset_ids: [],
    production_ids: [],
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

function commandReceipt(body: Record<string, unknown>, resultOverrides: Partial<Collection> = {}) {
  const input = body.input as Record<string, unknown>
  return jsonResponse({
    version: 1,
    commandId: body.intent_id,
    operation: body.operation,
    replayed: false,
    status: 'completed',
    entities: [],
    artifacts: [],
    taskIds: [],
    pipelineIds: [],
    result: collection({
      id: 'collection-from-command',
      revision: 4,
      name: String(input.name || 'Command collection'),
      description: String(input.description || ''),
      asset_ids: Array.isArray(input.asset_ids) ? input.asset_ids as string[] : [],
      ...resultOverrides,
    }),
  })
}

function installFetch(options: FetchOptions = {}): FetchState {
  const state: FetchState = { commandBodies: [] }
  const initial = options.initial || []
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input), 'http://localhost/')
    const method = String(init?.method || 'GET').toUpperCase()
    if (url.pathname === '/api/v1/workspace-collections' && method === 'GET') {
      if (options.workspaceResponse) return options.workspaceResponse()
      return jsonResponse({ workspaces: initial, total: initial.length })
    }
    if (url.pathname === '/api/v1/projects' && method === 'GET') {
      return jsonResponse({ projects: [], total: 0, warnings: [] })
    }
    if (url.pathname === '/api/v1/assets' && method === 'GET') {
      return jsonResponse({ assets: [], total: 0 })
    }
    if (url.pathname === '/api/v1/productions' && method === 'GET') {
      return jsonResponse({ productions: [], total: 0 })
    }
    if (url.pathname === '/api/v1/commands' && method === 'POST') {
      assert.ok(init?.body)
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      state.commandBodies.push(body)
      const result = options.onCommand?.(body)
      return result || commandReceipt(body)
    }
    throw new Error(`Unexpected test fetch: ${method} ${url.pathname}`)
  }) as typeof fetch
  return state
}

function adapterFor(navigateCalls: string[]) {
  return createWorkspaceCollectionAdapter(async tab => {
    navigateCalls.push(tab)
    return {
      message: 'Workspaces opened',
      target: { kind: 'application_section', id: tab, title: 'Workspaces' },
    }
  })
}

function createAction(name: string) {
  return {
    type: 'create_workspace_collection' as const,
    name,
    description: 'Description from the Wizard',
    projectIds: ['project-1'],
    assetIds: ['asset-1'],
    productionIds: ['production-1'],
  }
}

async function waitForPanel() {
  await waitFor(() => {
    const root = document.querySelector<HTMLElement>('[data-collection-ready]')
    assert.equal(root?.dataset.collectionReady, 'true')
  })
}

test.afterEach(() => {
  cleanup()
  dom.window.localStorage.clear()
  globalThis.fetch = originalFetch
})

test('adapter presents values before POST, waits for command ACK, and opens the committed ID/revision in an editable panel', { concurrency: false }, async () => {
  let valuesWereVisibleBeforePost = false
  const state = installFetch({
    onCommand(body) {
      if (body.operation === 'collections.create') {
        const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[]
        valuesWereVisibleBeforePost = document.querySelector('h2')?.textContent === 'Wizard collection'
          && inputs.some(input => input.value === 'Wizard collection')
      }
      return commandReceipt(body, { id: 'collection-42', revision: 7 })
    },
  })
  render(<WorkspaceCollectionsPanel />)
  await waitForPanel()

  const navigateCalls: string[] = []
  const adapter = adapterFor(navigateCalls)
  const outcome = await adapter.createCollection(createAction('Wizard collection'), {
    actor: 'wizard', commandId: 'intent-panel-create',
  })

  assert.equal(valuesWereVisibleBeforePost, true)
  assert.deepEqual(navigateCalls, ['workspaces'])
  assert.equal(state.commandBodies.length, 1)
  assert.equal(state.commandBodies[0].intent_id, 'intent-panel-create')
  const root = document.querySelector<HTMLElement>('[data-collection-ready="true"]')
  assert.equal(root?.dataset.collectionCommand, 'intent-panel-create')
  assert.equal(outcome.target.id, 'collection-42')
  assert.equal((outcome.metadata?.receipt as { result: Collection }).result.revision, 7)
  assert.ok(screen.getByRole('button', { name: /Wizard collection/ }))

  const nameInput = screen.getByLabelText('Name') as HTMLInputElement
  assert.equal(nameInput.value, 'Wizard collection')
  assert.equal(nameInput.disabled, false)
  fireEvent.change(nameInput, { target: { value: 'Edited after commit' } })
  assert.equal(nameInput.value, 'Edited after commit')
  assert.equal((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled, false)
})

test('unsaved editor changes reject a second adapter command before its POST', { concurrency: false }, async () => {
  const state = installFetch()
  render(<WorkspaceCollectionsPanel />)
  await waitForPanel()
  const navigateCalls: string[] = []
  const adapter = adapterFor(navigateCalls)
  await adapter.createCollection(createAction('First command'), { actor: 'wizard', commandId: 'intent-first' })

  const nameInput = screen.getByLabelText('Name') as HTMLInputElement
  fireEvent.change(nameInput, { target: { value: 'Manual draft still open' } })
  await assert.rejects(
    adapter.createCollection(createAction('Second command'), { actor: 'wizard', commandId: 'intent-second' }),
    /unsaved changes/i,
  )

  assert.equal(state.commandBodies.length, 1)
  assert.equal(nameInput.value, 'Manual draft still open')
})

test('a presentation failure after commit returns the receipt and keeps recovery identity', { concurrency: false }, async () => {
  const state = installFetch({
    onCommand(body) {
      if (body.operation === 'collections.create') {
        queueMicrotask(() => cancelCollectionPresentation(body as never))
      }
      return commandReceipt(body, { id: 'collection-committed', revision: 5 })
    },
  })
  render(<WorkspaceCollectionsPanel />)
  await waitForPanel()

  const adapter = adapterFor([])
  const outcome = await adapter.createCollection(createAction('Saved despite panel error'), {
    actor: 'wizard', commandId: 'intent-panel-failure',
  })

  assert.equal(state.commandBodies.length, 1)
  assert.equal(outcome.target.id, 'collection-committed')
  assert.equal((outcome.metadata?.receipt as { commandId: string }).commandId, 'intent-panel-failure')
  assert.match(String(outcome.metadata?.presentationWarning), /saved/i)
  assert.deepEqual(pendingCollectionCommands(), [])
})

test('a stale collection load cannot erase a newer externally opened draft', { concurrency: false }, async () => {
  let resolveOld!: (value: Response) => void
  const oldLoad = new Promise<Response>(resolve => { resolveOld = resolve })
  installFetch({
    workspaceResponse: () => oldLoad,
  })
  render(<WorkspaceCollectionsPanel />)
  await waitFor(() => assert.ok(document.querySelector('[data-collection-ready]')))

  const fresh = collection({ id: 'collection-fresh', revision: 9, name: 'Fresh command draft', description: 'Newer state' })
  await act(async () => {
    window.dispatchEvent(new CustomEvent('hocuspocus:workspace-collection-open', { detail: { collection: fresh } }))
  })
  await waitFor(() => assert.equal(screen.getByRole('heading').textContent, 'Fresh command draft'))

  await act(async () => {
    resolveOld(jsonResponse({ workspaces: [collection({ id: 'collection-old', name: 'Stale response' })], total: 1 }))
    await Promise.resolve()
  })
  await waitFor(() => assert.equal(screen.getByRole('heading').textContent, 'Fresh command draft'))
  assert.equal(screen.queryByRole('heading', { name: 'Stale response' }), null)
})
