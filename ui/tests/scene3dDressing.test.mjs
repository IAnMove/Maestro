import assert from 'node:assert/strict'
import test from 'node:test'
import { adoptCafeMaps, disposeCafeMaps } from '../src/features/scene3d/cafeSet.ts'
import { adoptDriveMaps, disposeDriveMaps } from '../src/features/scene3d/driveSet.ts'

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

test('drive maps are disposed when the load is no longer live', () => {
  let disposed = 0
  const texture = () => ({ dispose() { disposed += 1 } })
  const maps = { paint: texture(), glass: texture(), front: texture(), rear: texture(), road: texture(), building: texture() }
  assert.equal(adoptDriveMaps(maps, () => false), false)
  assert.equal(disposed, 6)
  disposed = 0
  const kept = { paint: texture(), glass: texture(), front: texture(), rear: texture(), road: texture(), building: texture() }
  assert.equal(adoptDriveMaps(kept, () => true), true)
  assert.equal(disposed, 0)
  disposeDriveMaps(kept)
  assert.equal(disposed, 6)
})
