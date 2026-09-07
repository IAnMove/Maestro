import assert from 'node:assert/strict'
import test from 'node:test'
import { adoptCafeMaps, disposeCafeMaps } from '../src/features/scene3d/cafeSet.ts'

test('cafe maps are disposed when the load is no longer live', () => {
  let disposed = 0
  const texture = () => ({ dispose() { disposed += 1 } })
  const maps = { facade: texture(), floor: texture(), back: texture() }
  assert.equal(adoptCafeMaps(maps, () => false), false)
  assert.equal(disposed, 3)
  disposed = 0
  const kept = { facade: texture(), floor: texture(), back: texture() }
  assert.equal(adoptCafeMaps(kept, () => true), true)
  assert.equal(disposed, 0)
  disposeCafeMaps(kept)
  assert.equal(disposed, 3)
})
