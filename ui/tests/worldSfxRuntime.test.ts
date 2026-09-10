import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Object3D, Scene } from 'three'
import { parseWorldSfx, worldAnchorOffsetFromWorldPoint } from '../src/features/sceneFx/world'
import { syncWorldSfx } from '../src/features/sceneFx/worldRuntime'
import { transformPatch } from '../src/features/scene3d/transformGizmo.ts'

test('world SFX occupy the scene graph and hide outside their window', () => {
  const scene = new Scene()
  const nodes = new Map()
  const cues = parseWorldSfx([
    { id: 'gate', kind: 'portal', start: 1, end: 4, position: { x: 0, y: 1, z: -2 } },
    { id: 'ring', kind: 'magic_circle', start: 0, end: 8, position: { x: 0, y: 0.02, z: 0 } },
  ])
  syncWorldSfx(scene, nodes, cues, 0, [])
  assert.equal(nodes.get('gate')?.root.visible, false)
  assert.equal(nodes.get('ring')?.root.visible, true)
  assert.equal(nodes.get('gate')?.root.position.z, -2)
  syncWorldSfx(scene, nodes, cues, 2, [{ id: 'subject_1', position: [1, 0, 0], rotationY: 0 }])
  assert.equal(nodes.get('gate')?.root.visible, true)
  const same = nodes.get('gate')?.root
  syncWorldSfx(scene, nodes, cues, 2.5, [])
  assert.equal(nodes.get('gate')?.root, same)
  syncWorldSfx(scene, nodes, cues.filter(cue => cue.id === 'ring'), 3, [])
  assert.equal(nodes.has('gate'), false)
  assert.equal(nodes.has('ring'), true)
})

test('a beam follows two moving slot roots and a missing anchor stays put', () => {
  const scene = new Scene()
  const nodes = new Map()
  const a = new Object3D(); a.position.set(-2, 1, 0)
  const b = new Object3D(); b.position.set(2, 1, 0)
  const cues = parseWorldSfx([{
    id: 'beam', kind: 'energy_beam', start: 0, end: 4,
    anchor: { slotId: 'subject_1' }, target: { slotId: 'subject_2' },
  }])
  syncWorldSfx(scene, nodes, cues, 1, [
    { id: 'subject_1', position: [-2, 0, 0], rotationY: 0, root: a },
    { id: 'subject_2', position: [2, 0, 0], rotationY: 0, root: b },
  ])
  const shaft = nodes.get('beam')?.root.children.find(child => child.userData.kind === 'beam')
  assert.ok(shaft)
  assert.ok(Math.abs(shaft.position.x) < 0.05)
  a.position.x = -3
  b.position.x = 3
  a.updateMatrixWorld(true); b.updateMatrixWorld(true)
  syncWorldSfx(scene, nodes, cues, 1.2, [
    { id: 'subject_1', position: [-3, 0, 0], rotationY: 0, root: a },
    { id: 'subject_2', position: [3, 0, 0], rotationY: 0, root: b },
  ])
  assert.ok(Math.abs(shaft.position.x) < 0.05)
  syncWorldSfx(scene, nodes, cues, 1.4, [])
  const marker = nodes.get('beam')?.root.children.find(child => child.userData.kind === 'missing')
  assert.equal(marker?.visible, true)
})

test('all 64 world cues stay in the scene graph and hidden ones stay unselectable', () => {
  const scene = new Scene()
  const nodes = new Map()
  const cues = parseWorldSfx(Array.from({ length: 40 }, (_, i) => ({
    id: `fx-${i}`, kind: i % 2 ? 'portal' : 'magic_circle', start: i < 5 ? 0 : 8, end: i < 5 ? 4 : 12,
    position: { x: i, y: 1, z: 0 },
  })))
  syncWorldSfx(scene, nodes, cues, 1, [])
  assert.equal(nodes.size, 40)
  assert.equal([...nodes.values()].filter(item => item.root.visible).length, 5)
  const late = nodes.get('fx-30')
  assert.equal(late?.root.visible, false)
  assert.ok(late?.root.userData.gizmoAt)
})

test('gizmo offset for an anchored cue is the slot-local displacement', () => {
  const slot = { position: [1, 0, 2] as const, rotationY: Math.PI / 2 }
  const offset = worldAnchorOffsetFromWorldPoint(slot, [1, 0.4, 3])
  assert.ok(Math.abs(offset.x + 1) < 1e-6)
  assert.equal(Number(offset.y.toFixed(4)), 0.4)
  assert.ok(Math.abs(offset.z) < 1e-6)
})

test('world gizmo exposes XYZ rotation instead of yaw-only', () => {
  const proxy = new Object3D()
  proxy.rotation.set(0.2, 0.4, -0.1)
  proxy.position.set(1, 2, 3)
  proxy.scale.setScalar(1.4)
  assert.deepEqual(transformPatch(proxy, 'translate', 'X', true).position, [1, 2, 3])
  const rotation = transformPatch(proxy, 'rotate', 'X', true).worldRotation
  assert.ok(rotation)
  assert.equal(Number(rotation[0].toFixed(4)), 0.2)
  assert.equal(transformPatch(proxy, 'rotate', 'Y', false).rotationY, 0.4)
})
