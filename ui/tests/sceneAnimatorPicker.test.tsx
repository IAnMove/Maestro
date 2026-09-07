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

test('narrative setup offers From my computer and From HocusPocus', { concurrency: false }, async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { NARRATIVE_SCENE_TEMPLATES } = await import('../src/lib/sceneNarrative.ts')
  const { SceneAnimatorNarrativeSetup } = await import('../src/components/Sidebar/SceneAnimatorExplorer.tsx')
  const template = NARRATIVE_SCENE_TEMPLATES[0]
  const noop = () => undefined
  try {
    render(
      <SceneAnimatorNarrativeSetup
        busy={false}
        templateId={template.id}
        template={template}
        visuals={[]}
        media={[]}
        hero=""
        plate=""
        plateLoopReady={false}
        prop=""
        foreground=""
        mood="calm"
        intensity={2}
        direction="right"
        camera="restrained"
        palette="natural"
        voiceSpace="center"
        suitability={() => ({ level: 'ok', message: 'ok' })}
        onTemplateId={noop}
        onHero={noop}
        onPlate={noop}
        onProp={noop}
        onForeground={noop}
        onPlateLoopReady={noop}
        onMood={noop}
        onIntensity={noop}
        onDirection={noop}
        onCamera={noop}
        onPalette={noop}
        onVoiceSpace={noop}
        onMount={noop}
      />,
    )
    assert.ok(screen.getAllByRole('button', { name: /From my computer/ }).length >= 2)
    fireEvent.click(screen.getAllByRole('button', { name: /From HocusPocus/ })[0])
    assert.ok(screen.getByTestId('asset-explorer'))
  } finally {
    cleanup()
  }
})
