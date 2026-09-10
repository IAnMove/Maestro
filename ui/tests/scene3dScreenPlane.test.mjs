import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Group, Object3D, Vector3 } from 'three'
import { defaultMediaScreen, defaultModelScreen, parseMediaScreen, pickScreenAnchor } from '../src/features/scene3d/mediaScreen.ts'
import { SCREEN_PLANE_NAME, attachScreenPlane, detachScreenPlane } from '../src/features/scene3d/screenPlane.ts'

test('Meshy-style TV heads default to a plane on headfront, not the body mesh', () => {
  const names = ['Mesh_0', 'Armature', 'Hips', 'Head', 'headfront', 'head_end']
  assert.equal(pickScreenAnchor(names), 'headfront')
  const screen = defaultModelScreen(names)
  assert.equal(screen.mode, 'plane')
  assert.equal(screen.anchor, 'headfront')
  assert.ok(screen.width < 1)
  assert.ok(screen.height < 1)
})

test('a screen plane is parented to headfront and follows the bone', () => {
  const root = new Group()
  const head = new Object3D(); head.name = 'Head'; root.add(head)
  const headfront = new Object3D(); headfront.name = 'headfront'; head.add(headfront)
  const screen = { ...defaultModelScreen(['headfront']), width: 0.3, height: 0.2 }
  const plane = attachScreenPlane(root, screen)
  assert.equal(plane.name, SCREEN_PLANE_NAME)
  assert.equal(plane.parent, headfront)
  headfront.position.set(0.4, 1.2, 0.1)
  headfront.updateMatrixWorld(true)
  const world = new Vector3()
  plane.getWorldPosition(world)
  assert.ok(Math.abs(world.x - 0.4) < 1e-6)
  assert.ok(Math.abs(world.y - 1.2) < 1e-6)
  detachScreenPlane(root)
  assert.equal(headfront.children.length, 0)
})

test('plane attachment and offset survive JSON reopen', () => {
  const parsed = parseMediaScreen({
    ...defaultMediaScreen(), mode: 'plane', anchor: 'headfront', offset: [0, 0.02, 0.01],
    yaw: 0.5, width: 0.28, height: 0.18, sourceUrl: '/api/v1/uploads/face.png',
  })
  assert.equal(parsed.mode, 'plane')
  assert.equal(parsed.anchor, 'headfront')
  assert.deepEqual(parsed.offset, [0, 0.02, 0.01])
  assert.equal(parsed.yaw, 0.5)
  assert.equal(parsed.width, 0.28)
  assert.equal(parsed.sourceUrl, '/api/v1/uploads/face.png')
})

test('bundled TV-head example is a small GLB with headfront and Walking', () => {
  const glb = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/examples/tv-head-humanoid.glb'))
  assert.ok(glb.length > 1000)
  assert.ok(glb.length < 20000)
  const jsonLength = glb.readUInt32LE(12)
  // Three.js GLTFLoader JSON.parse()s the chunk as-is. Null padding makes the asset unloadable.
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'))
  assert.equal(json.asset?.version, '2.0')
  assert.ok(json.nodes?.some(node => node.name === 'headfront'))
  assert.ok(json.animations?.some(clip => clip.name === 'Walking'))
  assert.ok(json.nodes?.some(node => node.name === 'LeftUpLeg'))
})
