import test from 'node:test'
import assert from 'node:assert/strict'
import { Bone, BufferGeometry, Float32BufferAttribute, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3, type Intersection } from 'three'
import { restFaceHit } from '../src/features/scene3d/speech/faceCoordinates'
import { placementAtHit } from '../src/features/scene3d/speech/pickFace'

test('clicking an animated, transformed mesh stores its original skin coordinates', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3))
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(Array(12).fill(0), 4))
  geometry.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4))
  const root = new Group(), bone = new Bone(), mesh = new SkinnedMesh(geometry, new MeshStandardMaterial())
  mesh.add(bone); root.add(mesh); mesh.bind(new Skeleton([bone]))
  bone.rotation.z = .7; bone.position.set(3, 4, 0)
  root.scale.setScalar(.01); root.rotation.y = .5; root.position.set(10, 2, -3)
  root.updateMatrixWorld(true); mesh.skeleton.update()
  const point = new Vector3()
  for (let i = 0; i < 3; i++) point.addScaledVector(mesh.getVertexPosition(i, new Vector3()), 1 / 3)
  mesh.localToWorld(point)
  const hit = { object: mesh, point, face: { a: 0, b: 1, c: 2 } } as unknown as Intersection
  const converted = restFaceHit(hit)!
  assert.ok(Math.abs(converted.scale - 100) < 1e-8)
  const placement = placementAtHit(root, hit)!
  assert.ok(placement)
  assert.ok(Math.abs(placement.center[0] - 2 / 3) < 1e-10)
  assert.ok(Math.abs(placement.center[1] - 2 / 3) < 1e-10)
  assert.ok(Math.abs(placement.center[2]) < 1e-10)
  assert.equal(placement.meshIndex, 0)
})
