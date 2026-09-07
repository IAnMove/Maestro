import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'
import type { AssetCatalogItem } from '../src/api/assets.ts'

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

const asset = (overrides: Partial<AssetCatalogItem> = {}): AssetCatalogItem => ({
  id: 'asset-hero', kind: 'image', filename: 'hero.png', size_bytes: 12,
  created_at: 1, completed_at: 2, metadata_status: 'canonical', workspace_ids: ['default'],
  locations: [{ workspace_id: 'default', filename: 'hero.png', url: '/api/v1/file/hero.png?workspace=default' }],
  url: '/api/v1/file/hero.png?workspace=default',
  origin: { tool: 'test' }, execution: {}, model: { provider: 'local', id: 'fixture' },
  prompt_preview: 'hero', ...overrides,
})

async function renderPicker(props: { workspace?: string; kinds?: readonly ('image' | 'model3d')[]; selectedId?: string; onPick: (item: AssetCatalogItem) => void; disabledReason?: (item: AssetCatalogItem) => string | undefined }) {
  const { render, screen, waitFor, fireEvent, cleanup } = await import('@testing-library/react')
  const { TemplateAssetPicker } = await import('../src/features/sceneTemplates/TemplateAssetPicker.tsx')
  const view = render(<TemplateAssetPicker workspace={props.workspace || 'default'} kinds={props.kinds || ['image']} selectedId={props.selectedId} onPick={props.onPick} disabledReason={props.disabledReason} />)
  return { ...view, screen, waitFor, fireEvent, cleanup, TemplateAssetPicker }
}

test('selecciona el asset completo por id durable y sólo consulta el catálogo', { concurrency: false }, async () => {
  const selected: { value?: AssetCatalogItem } = {}
  const originalFetch = globalThis.fetch
  const requests: string[] = []
  const hero = asset()
  globalThis.fetch = (async input => {
    const url = String(input)
    requests.push(url)
    return new Response(JSON.stringify({ assets: [hero], total: 1 }), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    const view = await renderPicker({ onPick: item => { selected.value = item } })
    await view.screen.findByRole('button', { name: 'Select hero.png' })
    const unavailableGlb = view.screen.getByRole('tab', { name: /GLB \/ 3D/ }) as HTMLButtonElement
    assert.equal(unavailableGlb.disabled, true)
    assert.match(unavailableGlb.textContent || '', /unavailable/)
    await view.waitFor(() => assert.equal(requests.length, 1))
    const query = new URL(requests[0], 'http://localhost').searchParams
    assert.equal(query.get('workspace'), 'default')
    assert.equal(query.get('kind'), 'image')
    assert.equal(query.get('limit'), '12')
    assert.equal(query.get('offset'), '0')
    assert.ok(requests.every(url => url.includes('/api/v1/assets?')))
    assert.equal(requests.some(url => url.includes('/generate') || url.includes('/model')), false)
    view.fireEvent.click(view.screen.getByRole('button', { name: 'Select hero.png' }))
    assert.equal(selected.value?.id, hero.id)
    assert.equal(selected.value?.filename, hero.filename)
    assert.deepEqual(selected.value?.locations, hero.locations)
    view.cleanup()
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('cancela y oculta resultados obsoletos al cambiar de workspace', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const pending = new Map<string, { resolve: (response: Response) => void; reject: (reason: unknown) => void }>()
  let aborts = 0
  globalThis.fetch = ((input, init) => {
    const workspace = new URL(String(input), 'http://localhost').searchParams.get('workspace') || ''
    return new Promise<Response>((resolve, reject) => {
      pending.set(workspace, { resolve, reject })
      init?.signal?.addEventListener('abort', () => {
        aborts += 1
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    })
  }) as typeof fetch
  try {
    const { render, screen, waitFor, cleanup } = await import('@testing-library/react')
    const { TemplateAssetPicker } = await import('../src/features/sceneTemplates/TemplateAssetPicker.tsx')
    const view = render(<TemplateAssetPicker workspace="one" kinds={['image']} onPick={() => undefined} />)
    await waitFor(() => assert.ok(pending.has('one')))
    view.rerender(<TemplateAssetPicker workspace="two" kinds={['image']} onPick={() => undefined} />)
    await waitFor(() => assert.ok(pending.has('two')))
    assert.equal(aborts, 1)
    pending.get('one')?.resolve(new Response(JSON.stringify({ assets: [asset({ id: 'stale', filename: 'stale.png' })], total: 1 })))
    pending.get('two')?.resolve(new Response(JSON.stringify({ assets: [asset({ id: 'current', filename: 'current.png', locations: [{ workspace_id: 'two', filename: 'current.png', url: '/api/v1/file/current.png?workspace=two' }] })], total: 1 })))
    await screen.findByRole('button', { name: 'Select current.png' })
    assert.equal(screen.queryByRole('button', { name: 'Select stale.png' }), null)
    cleanup()
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('cambiar el tipo invalida la lista anterior y deja visible el tipo incompatible', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const image = asset()
  const model = asset({ id: 'asset-model', kind: 'model3d', filename: 'ship.glb', locations: [] })
  globalThis.fetch = (async input => {
    const kind = new URL(String(input), 'http://localhost').searchParams.get('kind')
    return new Response(JSON.stringify({ assets: [kind === 'model3d' ? model : image], total: 1 }))
  }) as typeof fetch
  try {
    const { screen, waitFor, fireEvent, cleanup } = await renderPicker({ kinds: ['image', 'model3d'], onPick: () => undefined })
    await screen.findByRole('button', { name: 'Select hero.png' })
    const modelTab = screen.getByRole('tab', { name: /GLB \/ 3D/ })
    fireEvent.click(modelTab)
    assert.equal(screen.queryByRole('button', { name: 'Select hero.png' }), null)
    await screen.findByRole('button', { name: 'Select ship.glb' })
    await waitFor(() => assert.equal(screen.queryByRole('button', { name: 'Select hero.png' }), null))
    const imageTab = screen.getByRole('tab', { name: /Images/ })
    assert.equal((imageTab as HTMLButtonElement).disabled, false)
    cleanup()
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('muestra una razón de bloqueo y conserva la identidad aunque falle el preview', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const hero = asset()
  globalThis.fetch = (async () => new Response(JSON.stringify({ assets: [hero], total: 1 }))) as typeof fetch
  let picked = false
  try {
    const view = await renderPicker({
      selectedId: hero.id,
      onPick: () => { picked = true },
      disabledReason: () => 'Falta metadata canónica',
    })
    const card = await view.screen.findByRole('button', { name: 'Select hero.png' }) as HTMLButtonElement
    assert.equal(card.disabled, true)
    assert.match(card.textContent || '', /Falta metadata canónica/)
    assert.equal(card.getAttribute('aria-pressed'), 'true')
    view.fireEvent.click(card)
    assert.equal(picked, false)

    // Render an enabled copy to exercise the image error path without changing selectedId.
    const Picker = view.TemplateAssetPicker
    view.rerender(<Picker workspace="default" kinds={['image']} selectedId={hero.id} onPick={() => undefined} />)
    const image = await view.screen.findByRole('img', { name: 'Preview of hero.png' })
    view.fireEvent.error(image)
    assert.ok(view.screen.getByText('Preview unavailable'))
    assert.equal((view.screen.getByRole('button', { name: 'Select hero.png' }) as HTMLButtonElement).getAttribute('aria-pressed'), 'true')
    view.cleanup()
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rechaza URLs remotas, blob y ubicaciones de otro workspace para previews', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const unsafe = asset({
    locations: [
      { workspace_id: 'other', filename: 'hero.png', url: 'https://evil.example/hero.png' },
      { workspace_id: 'default', filename: 'hero.png', url: 'blob:http://localhost/unsafe' },
    ],
    url: 'https://evil.example/hero.png',
  })
  globalThis.fetch = (async () => new Response(JSON.stringify({ assets: [unsafe], total: 1 }))) as typeof fetch
  try {
    const { screen, cleanup } = await renderPicker({ onPick: () => undefined })
    await screen.findByRole('button', { name: 'Select hero.png' })
    assert.equal(screen.queryByRole('img'), null)
    assert.ok(screen.getByText('Preview unavailable in this workspace'))
    cleanup()
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('no carga una preview cuyo query apunta a otro workspace aunque la ubicación diga el activo', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const mismatched = asset({ locations: [{ workspace_id: 'default', filename: 'hero.png', url: '/api/v1/file/hero.png?workspace=other' }] })
  globalThis.fetch = (async () => new Response(JSON.stringify({ assets: [mismatched], total: 1 }))) as typeof fetch
  try {
    const view = await renderPicker({ onPick: () => undefined })
    await view.screen.findByRole('button', { name: 'Select hero.png' })
    assert.equal(view.screen.queryByRole('img'), null)
    view.cleanup()
  } finally { globalThis.fetch = originalFetch }
})

test('muestra y selecciona hero(1).png con la codificación del backend', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const source = '/api/v1/file/hero%281%29.png?workspace=film%282%29'
  const item = asset({ filename: 'hero(1).png', locations: [{ workspace_id: 'film(2)', filename: 'hero(1).png', url: source }] })
  globalThis.fetch = (async () => new Response(JSON.stringify({ assets: [item], total: 1 }))) as typeof fetch
  let picked = ''
  try {
    const view = await renderPicker({ workspace: 'film(2)', onPick: value => { picked = value.id } })
    const button = await view.screen.findByRole('button', { name: 'Select hero(1).png' })
    assert.equal(view.screen.getByRole('img').getAttribute('src'), source)
    view.fireEvent.click(button)
    assert.equal(picked, item.id)
    view.cleanup()
  } finally { globalThis.fetch = originalFetch }
})
