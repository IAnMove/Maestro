import test from 'node:test'
import assert from 'node:assert/strict'
import React, { useState } from 'react'
import { JSDOM } from 'jsdom'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { estimateFace, manualFace } from '../src/features/scene3d/speech/calibration'
import { defaultSpeech } from '../src/features/scene3d/speech/types'

const dom = new JSDOM('<html><body /></html>', { url: 'http://localhost' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver })
test('headless/UV-less models receive editable rest coordinates independent of scene transforms', () => {
  const root = new Group(), mesh = new Mesh(new BoxGeometry(1, 2, .5), new MeshStandardMaterial())
  mesh.geometry.deleteAttribute('uv'); root.add(mesh)
  assert.equal(estimateFace(root, 'generic'), undefined)
  const face = manualFace(root)!
  assert.ok(face); assert.equal(face.meshIndex, 0)
  assert.ok(face.center[1] > 0 && face.center[1] < 1)
  root.scale.setScalar(5); root.position.set(2, 3, 4); root.rotation.y = Math.PI
  assert.deepEqual(manualFace(root), face)
  mesh.material = new MeshBasicMaterial() as unknown as MeshStandardMaterial
  assert.equal(manualFace(root), undefined)
})
test('a mesh named Head is not mistaken for a head bone at the origin', () => {
  const root = new Group(), head = new Mesh(new BoxGeometry(.5, .5, .4).translate(0, 1.5, 0), new MeshStandardMaterial())
  head.name = 'Head'; root.add(head)
  assert.equal(estimateFace(root, 'generic'), undefined)
  assert.ok(manualFace(root)!.center[1] > 1.25)
})
test('Add lips recovers from missing landmarks and exposes editing without replacing the subject', async () => {
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
  const { LipsPlacementControls } = await import('../src/features/scene3d/speech/LipsPlacementControls')
  const root = new Group(); root.add(new Mesh(new BoxGeometry(1, 2, .5), new MeshStandardMaterial()))
  function Subject() {
    const [speech, setSpeech] = useState(defaultSpeech())
    return <LipsPlacementControls speech={speech} hasModel calibrate={mode => mode === 'bounds' ? manualFace(root) : undefined} onChange={setSpeech} />
  }
  try {
    const view = render(<Subject />)
    assert.equal(view.container.querySelector('select')!.closest('details')!.open, false)
    fireEvent.click(screen.getByRole('button', { name: 'Add lips' }))
    assert.match(screen.getByRole('status').textContent!, /No head landmark/)
    const y = screen.getByRole('spinbutton', { name: 'Mouth Y' }) as HTMLInputElement
    fireEvent.change(y, { target: { value: '0.6' } }); assert.equal(y.value, '0.6')
    assert.equal((screen.getByRole('checkbox', { name: 'Animate eyes' }) as HTMLInputElement).checked, false)
    assert.ok(screen.getByRole('button', { name: 'Edit lips' }))
  } finally { cleanup() }
})
