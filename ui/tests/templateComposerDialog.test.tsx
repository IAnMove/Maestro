import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'
import type { AssetCatalogItem } from '../src/api/assets.ts'
import type { Scene } from '../src/types/index.ts'
import { ALL_SCENE_TEMPLATES, CANDIDATE_SCENE_TEMPLATES } from '../src/features/sceneTemplates/catalog.ts'

const dom = new JSDOM('<!doctype html><html><body /></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  HTMLImageElement: dom.window.HTMLImageElement,
  HTMLVideoElement: dom.window.HTMLVideoElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  MutationObserver: dom.window.MutationObserver,
  ResizeObserver: class { observe() {} disconnect() {} },
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

const makeAsset = (id: string, workspace: string, overrides: Partial<AssetCatalogItem> = {}): AssetCatalogItem => {
  const filename = overrides.filename || `${id}.png`
  return {
    id, kind: 'image', filename, size_bytes: 12, created_at: 1, completed_at: 2,
    metadata_status: 'canonical', workspace_ids: [workspace],
    locations: [{ workspace_id: workspace, filename, url: `/api/v1/file/${encodeURIComponent(filename)}?workspace=${encodeURIComponent(workspace)}` }],
    url: `/api/v1/file/${encodeURIComponent(filename)}?workspace=${encodeURIComponent(workspace)}`,
    origin: { tool: 'composer-test' }, execution: { run_id: 'run-1', task_id: 'task-1' },
    model: { provider: 'local', id: 'fixture-model' }, prompt_preview: filename, ...overrides,
  }
}

const assetsFor = (workspace: string, heroMetadata: AssetCatalogItem['metadata_status'] = 'canonical') => {
  const hero = makeAsset(`asset-hero-${workspace}`, workspace, { filename: `hero-${workspace}.png`, metadata_status: heroMetadata })
  const plate = makeAsset(`asset-plate-${workspace}`, workspace, { filename: `plate-${workspace}.png` })
  return { hero, plate, all: [hero, plate] }
}

function responseFor(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

function installAssetFetch({
  workspace = 'default',
  heroMetadata = 'canonical',
  detailMode = 'normal',
}: {
  workspace?: string
  heroMetadata?: AssetCatalogItem['metadata_status']
  detailMode?: 'normal' | '404' | 'source-change'
} = {}) {
  const fixture = assetsFor(workspace, heroMetadata)
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = (async (input, init) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.includes('/api/v1/assets?')) {
      const query = new URL(url, 'http://localhost').searchParams
      const kind = query.get('kind')
      const assets = fixture.all.filter(item => !kind || item.kind === kind)
      return responseFor({ assets, total: assets.length })
    }
    if (url.includes('/api/v1/assets/')) {
      const id = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1))
      const selected = fixture.all.find(item => item.id === id)
      if (!selected) return responseFor({ detail: 'missing' }, 404)
      if (detailMode === '404' && selected.id === fixture.hero.id) return responseFor({ detail: 'missing' }, 404)
      if (detailMode === 'source-change' && selected.id === fixture.hero.id) {
        const filename = 'hero-replaced.png'
        return responseFor({ ...selected, filename, locations: [{ workspace_id: workspace, filename, url: `/api/v1/file/${filename}?workspace=${workspace}` }], url: `/api/v1/file/${filename}?workspace=${workspace}` })
      }
      return responseFor(selected)
    }
    throw new Error(`Unexpected non-catalog request: ${url}`)
  }) as typeof fetch
  return { fixture, calls }
}

async function renderDialog(props: { workspace?: string; onClose?: () => void; onApply?: (scene: Scene) => boolean } = {}) {
  const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react')
  const { TemplateComposerDialog } = await import('../src/features/sceneTemplates/TemplateComposerDialog.tsx')
  const view = render(<TemplateComposerDialog workspace={props.workspace || 'default'} onClose={props.onClose || (() => undefined)} onApply={props.onApply || (() => true)} />)
  return { ...view, screen, fireEvent, waitFor, cleanup, TemplateComposerDialog }
}

async function selectHeroAndPlate(view: Awaited<ReturnType<typeof renderDialog>>) {
  const hero = await view.screen.findByRole('button', { name: /Select hero-/ })
  view.fireEvent.click(hero)
  view.fireEvent.click(view.screen.getByRole('button', { name: 'Background (required)' }))
  const plate = await view.screen.findByRole('button', { name: /Select plate-/ })
  view.fireEvent.click(plate)
  view.fireEvent.click(view.screen.getByRole('checkbox', { name: /I have saved what I need/ }))
}

test('expone 24 referencias más 24 movimientos y habilita BPM/intensidad sólo en plantillas rítmicas', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  installAssetFetch()
  try {
    const view = await renderDialog()
    const selector = view.screen.getByRole('combobox', { name: 'Action / template' }) as HTMLSelectElement
    assert.equal(selector.options.length, ALL_SCENE_TEMPLATES.length)
    assert.equal(selector.options.length, 48)
    assert.equal(CANDIDATE_SCENE_TEMPLATES.length, 24)
    assert.equal((view.screen.getByRole('spinbutton', { name: 'Visual BPM' }) as HTMLInputElement).disabled, true)
    assert.equal((view.screen.getByRole('spinbutton', { name: 'Pulse intensity' }) as HTMLInputElement).disabled, true)

    view.fireEvent.change(selector, { target: { value: 'music-pulse' } })
    const pulseBpm = await view.screen.findByRole('spinbutton', { name: 'Visual BPM' }) as HTMLInputElement
    assert.equal(pulseBpm.disabled, false)
    assert.equal((view.screen.getByRole('spinbutton', { name: 'Pulse intensity' }) as HTMLInputElement).disabled, false)
    view.cleanup()
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('selecciona hero y fondo canónicos y aplica provided_only con lineage de catálogo', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  const { fixture, calls } = installAssetFetch()
  const applied: Scene[] = []
  let closed = 0
  try {
    const view = await renderDialog({ onClose: () => { closed += 1 }, onApply: scene => { applied.push(scene); return true } })
    await selectHeroAndPlate(view)
    view.fireEvent.click(view.screen.getByRole('button', { name: 'Create and open in editor' }))
    await view.waitFor(() => assert.equal(applied.length, 1))

    const scene = applied[0]
    assert.equal(scene.generationPolicy, 'provided_only')
    assert.equal(closed, 1)
    const assets = Object.fromEntries((scene.narrative?.assets || []).map(item => [item.slot, item]))
    assert.equal(assets.hero?.catalogAtAssignment?.assetId, fixture.hero.id)
    assert.equal(assets.hero?.catalogAtAssignment?.workspaceId, 'default')
    assert.equal(assets.plate?.catalogAtAssignment?.assetId, fixture.plate.id)
    assert.equal(assets.plate?.catalogAtAssignment?.metadataStatus, 'canonical')
    assert.equal(calls.some(call => /generate|model3d\/generate/i.test(call.url)), false)
    assert.ok(calls.some(call => call.url.endsWith(`/assets/${fixture.hero.id}`)))
    assert.ok(calls.some(call => call.url.endsWith(`/assets/${fixture.plate.id}`)))
    view.cleanup()
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('mantiene assets heredados visibles pero no seleccionables ni aplicables', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  installAssetFetch({ heroMetadata: 'legacy' })
  let applied = 0
  try {
    const view = await renderDialog({ onApply: () => { applied += 1; return true } })
    const hero = await view.screen.findByRole('button', { name: /Select hero-default\.png/ }) as HTMLButtonElement
    assert.equal(hero.disabled, true)
    assert.match(hero.textContent || '', /metadatos canónicos/i)
    assert.equal((view.screen.getByRole('button', { name: 'Create and open in editor' }) as HTMLButtonElement).disabled, true)
    assert.equal(applied, 0)
    view.cleanup()
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('cambia de plantilla y workspace reinicia bindings, y cerrar cancela sin aplicar', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  installAssetFetch()
  let closed = 0
  let applied = 0
  try {
    const view = await renderDialog({ onClose: () => { closed += 1 }, onApply: () => { applied += 1; return true } })
    const hero = await view.screen.findByRole('button', { name: /Select hero-default\.png/ })
    view.fireEvent.click(hero)
    assert.equal(hero.getAttribute('aria-pressed'), 'true')

    const selector = view.screen.getByRole('combobox', { name: 'Action / template' })
    view.fireEvent.change(selector, { target: { value: 'music-pulse' } })
    const resetHero = await view.screen.findByRole('button', { name: /Select hero-default\.png/ })
    assert.equal(resetHero.getAttribute('aria-pressed'), 'false')

    const other = assetsFor('other')
    installAssetFetch({ workspace: 'other' })
    view.rerender(<view.TemplateComposerDialog workspace="other" onClose={() => { closed += 1 }} onApply={() => { applied += 1; return true }} />)
    const otherHero = await view.screen.findByRole('button', { name: /Select hero-other\.png/ })
    assert.equal(otherHero.getAttribute('aria-pressed'), 'false')
    assert.equal(view.screen.queryByRole('button', { name: /Select hero-default\.png/ }), null)
    assert.equal(other.hero.id, 'asset-hero-other')

    view.fireEvent.click(view.screen.getByRole('button', { name: 'Close' }))
    assert.equal(closed, 1)
    assert.equal(applied, 0)
    view.cleanup()
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('404 y cambio de fuente al revalidar impiden aplicar y nunca generan assets', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch
  try {
    for (const detailMode of ['404', 'source-change']) {
      const { calls } = installAssetFetch({ detailMode })
      let applied = 0
      const view = await renderDialog({ onApply: () => { applied += 1; return true } })
      await selectHeroAndPlate(view)
      view.fireEvent.click(view.screen.getByRole('button', { name: 'Create and open in editor' }))
      const alert = await view.screen.findByRole('alert')
      if (detailMode === '404') assert.match(alert.textContent || '', /Asset not found/i)
      else assert.match(alert.textContent || '', /ubicación del asset cambió/i)
      assert.equal(applied, 0)
      assert.equal(calls.some(call => /generate|model3d\/generate/i.test(call.url)), false)
      view.cleanup()
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})
