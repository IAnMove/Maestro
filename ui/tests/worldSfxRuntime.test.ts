import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Scene } from 'three'
import { parseWorldSfx } from '../src/features/sceneFx/world'
import { syncWorldSfx } from '../src/features/sceneFx/worldRuntime'
import { transformPatch } from '../src/features/scene3d/transformGizmo.ts'
import { Object3D } from 'three'

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
