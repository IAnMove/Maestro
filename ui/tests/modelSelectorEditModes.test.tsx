import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event, MutationObserver: dom.window.MutationObserver,
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

const models = [
  { model_type: 'scail2_14B', name: 'SCAIL HQ', family: 'wan' },
  { model_type: 'scail2_14B_fast', name: 'SCAIL Animate Fast', family: 'wan' },
  { model_type: 'scail2_14B_recast_fast', name: 'SCAIL Recast Fast', family: 'wan' },
  { model_type: 'viggle_animate', name: 'Viggle-Animate Pruned 20B', family: 'h3_advanced' },
  { model_type: 'h3_advanced_fl2va_pruned', name: 'H3 FL2VA', family: 'h3_advanced' },
  { model_type: 'h3_advanced_ref2va_pruned', name: 'H3 Ref2VA', family: 'h3_advanced' },
]

async function setup(mode: 'avatar' | 'video', subMode: 'recast' | 'restyle', disabled: string[] = []) {
  const { render, fireEvent, cleanup } = await import('@testing-library/react')
  const { useStore } = await import('../src/stores/useStore')
  const { ModelSelector } = await import('../src/components/Sidebar/ModelSelector')
  const initial = useStore.getState()
  const selections: string[] = []
  useStore.setState({
    generationMode: mode, editSubMode: subMode,
    models: models as never,
    families: [{ id: 'wan', label: 'Wan', order: 1 }, { id: 'h3_advanced', label: 'H3 / Viggle', order: 2 }],
    enabledModels: new Set(models.map(model => model.model_type).filter(id => !disabled.includes(id))),
    params: { ...initial.params, model_type: 'scail2_14B' },
    selectModel: async id => { selections.push(id); useStore.setState(s => ({ params: { ...s.params, model_type: id } })) },
  })
  const view = render(<ModelSelector />)
  fireEvent.click(view.getByRole('button', { name: 'SCAIL HQ' }))
  return {
    view, fireEvent, selections,
    close() { cleanup(); useStore.setState(initial) },
  }
}

test('Recast dropdown exposes its SCAIL recipes; Viggle has a separate workflow', async () => {
  const fixture = await setup('avatar', 'recast')
  try {
    const { view, fireEvent, selections } = fixture
    assert.equal(view.queryAllByRole('button', { name: 'SCAIL HQ', exact: true }).length, 2)
    assert.ok(view.queryByRole('button', { name: 'SCAIL Recast Fast' }))
    assert.equal(view.queryByRole('button', { name: 'SCAIL Animate Fast' }), null)
    assert.equal(view.queryByRole('button', { name: 'H3 FL2VA' }), null)
    assert.equal(view.queryByRole('button', { name: 'H3 Ref2VA' }), null)
    assert.equal(view.queryByRole('button', { name: 'Viggle-Animate Pruned 20B' }), null)
    fireEvent.click(view.getByRole('button', { name: 'SCAIL Recast Fast' }))
    assert.deepEqual(selections, ['scail2_14B_recast_fast'])
  } finally { fixture.close() }
})

test('Recast enable-more count includes disabled compatible models only', async () => {
  const fixture = await setup('avatar', 'recast', ['viggle_animate', 'scail2_14B_recast_fast', 'h3_advanced_fl2va_pruned', 'h3_advanced_ref2va_pruned'])
  try {
    assert.ok(fixture.view.queryByRole('button', { name: /Enable more models.*1 available/ }))
    assert.equal(fixture.view.queryByRole('button', { name: 'Viggle-Animate Pruned 20B' }), null)
  } finally { fixture.close() }
})

test('Repaint dropdown offers animation recipes and excludes the Recast-only recipe', async () => {
  const fixture = await setup('avatar', 'restyle')
  try {
    assert.ok(fixture.view.queryByRole('button', { name: 'SCAIL Animate Fast' }))
    assert.equal(fixture.view.queryByRole('button', { name: 'SCAIL Recast Fast' }), null)
    assert.equal(fixture.view.queryByRole('button', { name: 'Viggle-Animate Pruned 20B' }), null)
  } finally { fixture.close() }
})

test('Video dropdown retains H3 generators and excludes Viggle even after visiting Recast', async () => {
  const fixture = await setup('video', 'recast')
  try {
    assert.ok(fixture.view.queryByRole('button', { name: 'H3 FL2VA' }))
    assert.ok(fixture.view.queryByRole('button', { name: 'H3 Ref2VA' }))
    assert.equal(fixture.view.queryByRole('button', { name: 'Viggle-Animate Pruned 20B' }), null)
  } finally { fixture.close() }
})


test('Viggle tab selects its exact model and displays a fixed model label; Recast restores SCAIL', async () => {
  const fixture = await setup('avatar', 'recast')
  const { render, fireEvent } = await import('@testing-library/react')
  const { EditSubModeToggle } = await import('../src/components/Sidebar/EditSubModeToggle')
  try {
    const tabs = render(<EditSubModeToggle />)
    fireEvent.click(tabs.getByRole('button', { name: 'Viggle', exact: true }))
    assert.deepEqual(fixture.selections, ['viggle_animate'])
    assert.equal(fixture.view.container.querySelectorAll('button').length, 0)
    assert.match(fixture.view.container.textContent || '', /Viggle-Animate Pruned 20B/)
    assert.equal(tabs.getByRole('button', { name: 'Viggle', exact: true }).getAttribute('aria-pressed'), 'true')
    fireEvent.click(tabs.getByRole('button', { name: 'Recast', exact: true }))
    assert.deepEqual(fixture.selections, ['viggle_animate', 'scail2_14B_recast_fast'])
  } finally { fixture.close() }
})
