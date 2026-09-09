import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage,
  MutationObserver: dom.window.MutationObserver })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

const { render, fireEvent, cleanup } = await import('@testing-library/react')
const { useStore } = await import('../src/stores/useStore.ts')
const { MiniMaxH3TurboToggle } = await import('../src/components/Sidebar/MiniMaxH3TurboToggle.tsx')
const { H3PromptControls } = await import('../src/components/Sidebar/H3PromptControls.tsx')

test('disabling a selected non-default H3 preset removes it once', () => {
  const before = useStore.getState()
  try {
    useStore.setState({ modelOptions: {
      ...before.modelOptions,
      minimax_h3_turbo: { filename:'pdd.safetensors', label:'Turbo mode', preset_id:'pdd', experimental:true, steps:8, weight:1, guide:'Preset',
        presets:[{ id:'v4', filename:'v4.safetensors', label:'v4', steps:6, weight:1, description:'v4', runtime:'standard_lora', workflow:'all' }] },
    } as typeof before.modelOptions,
    params: { ...before.params, model_type:'minimax_h3', minimax_h3_turbo_mode:true, minimax_h3_turbo_preset:'v4',
      activated_loras:['v4.safetensors'], loras_multipliers:'1', num_inference_steps:6 } })
    const view = render(<MiniMaxH3TurboToggle />)
    fireEvent.click(view.getByRole('checkbox'))
    assert.deepEqual(useStore.getState().params.activated_loras, [])
    assert.equal(useStore.getState().params.minimax_h3_turbo_mode, false)
  } finally { cleanup(); useStore.setState(before) }
})

test('H3 writing and audio modes persist in the generation snapshot', () => {
  const before = useStore.getState()
  try {
    useStore.setState({ params:{...before.params, model_type:'minimax_h3'}, isEnhancing:false })
    const view = render(<H3PromptControls />)
    const selects = view.getAllByRole('combobox')
    fireEvent.change(selects[0], { target:{value:'creative'} })
    fireEvent.change(selects[1], { target:{value:'legacy'} })
    assert.equal(useStore.getState().params.minimax_h3_planning_style,'creative')
    assert.equal(useStore.getState().params.minimax_h3_audio_policy,'legacy')
    assert.equal(useStore.getState().h3WindowPlan,null)
  } finally { cleanup(); useStore.setState(before) }
})


test('Fused is presented as fast mode with qualified memory observations', async () => {
  const { H3ModelInfo, H3ModelName } = await import('../src/components/Sidebar/H3ModelInfo.tsx')
  try {
    const view = render(<><H3ModelName modelType="minimax_h3_fused_turbo" fallback="old" />
      <H3ModelInfo modelType="minimax_h3_fused_turbo" /></>)
    assert.match(view.container.textContent ?? '', /Fast mode|Modo rápido/)
    assert.match(view.container.textContent ?? '', /4 steps|4 pasos/)
    assert.match(view.container.textContent ?? '', /40.6 GiB/)
    assert.match(view.container.textContent ?? '', /not minimum|no requisitos mínimos/)
    assert.match(view.container.textContent ?? '', /anomalous|anómala/)
  } finally { cleanup() }
})

test('catalog labels preserve unrelated models and do not infer measurements for Legacy', async () => {
  const { H3ModelInfo, H3ModelName } = await import('../src/components/Sidebar/H3ModelInfo.tsx')
  try {
    const view = render(<><H3ModelName modelType="wan" fallback="Wan" />
      <H3ModelInfo modelType="wan" /><H3ModelInfo modelType="minimax_h3_legacy" /></>)
    assert.match(view.container.textContent ?? '', /^Wan/)
    assert.match(view.container.textContent ?? '', /not measured|No se midió/)
    assert.doesNotMatch(view.container.textContent ?? '', /GiB/)
  } finally { cleanup() }
})
