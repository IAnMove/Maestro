import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FX_CATALOG, parseSceneFx } from '../src/features/sceneFx/types'
import { fxSamples } from '../src/features/sceneFx/audio'
import { withFxShowcase } from '../src/features/sceneFx/showcase'
import { createDefaultScene3DDocument, parseScene3DDocument } from '../src/features/scene3d/document'
import { parseSceneFile, serializeSceneFile } from '../src/lib/sceneFile'

test('2D and 3D preserve all effects and audio settings through save/reopen', () => {
  const world = withFxShowcase(createDefaultScene3DDocument())
  assert.deepEqual(parseScene3DDocument(JSON.parse(JSON.stringify(world)))?.sfx, world.sfx)
  const scene = withFxShowcase({ version: 1 as const, name: 'FX', layers: [], width: 640, height: 360, duration: 3 })
  assert.deepEqual(parseSceneFile(serializeSceneFile(scene)).sfx, scene.sfx)
  assert.equal(scene.duration, 90)
  assert.deepEqual(scene.sfx.map(cue => cue.kind), FX_CATALOG.map(cue => cue.id))
})

test('invalid/duplicate effects cannot create unbounded or NaN render state', () => {
  const result = parseSceneFx([{ id: 'a', kind: 'sparks', size: Infinity, seed: -5 }, { id: 'a', kind: 'rain' }, { kind: 'unknown' }, { kind: 'snow', start: 3, end: 2 }, null])
  assert.equal(result.length, 1)
  assert.equal(result[0].size, 65)
  assert.equal(result[0].seed, 1)
  assert.equal(parseSceneFx(Array.from({ length: 100 }, (_, i) => ({ id: String(i), kind: 'rain' }))).length, 64)
})

test('every sound has repeatable finite PCM, a non-silent body and silent edges', () => {
  for (const preset of FX_CATALOG) {
    const cue = parseSceneFx([{ kind: preset.id, start: 0, end: 1, sound: true }])[0]
    const first = fxSamples(cue, 16000)
    assert.deepEqual(first, fxSamples(cue, 16000))
    assert.equal(first.length, 16000)
    assert.ok(first.every(value => Number.isFinite(value) && Math.abs(value) <= 1))
    assert.ok(first.some(value => Math.abs(value) > .005), preset.id)
    assert.equal(Math.abs(first[0]), 0)
    assert.ok(Math.abs(first.at(-1)!) < .001)
  }
})


test('anime showcase preserves the scene and supports oriented energy beams', () => {
  const source = createDefaultScene3DDocument()
  const next = withFxShowcase(source, 'anime')
  assert.equal(next.duration, 36)
  assert.equal(next.sfx.length, 12)
  assert.equal(next.slots, source.slots)
  assert.ok(next.sfx.some(cue => cue.kind === 'energy_beam'))
  const rotated = parseSceneFx([{ ...next.sfx[0], rotation: -45 }])
  assert.equal(rotated[0].rotation, -45)
  assert.equal(parseScene3DDocument({ ...next, sfx: rotated })?.sfx?.[0].rotation, -45)
  assert.equal(source.sfx, undefined)
})
