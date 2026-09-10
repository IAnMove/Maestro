import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateSceneLayer } from '../src/lib/sceneTimeline.ts'
import { parseSceneFile, serializeSceneFile } from '../src/lib/sceneFile.ts'
import { compileRecipeShot, listRecipeShots, parseSceneRecipe } from '../src/lib/sceneRecipe.ts'
import { resolveRecipeAssets } from '../src/lib/sceneRecipeAssets.ts'
import { createVideo3dProductionFixture, fixtureFileUrl } from './fixtures/video3dProduction.mjs'

const fixtureFilenameForLayer = layerId => {
  if (layerId.includes('plate')) return 'plate-aurora.svg'
  const kit = /kit-(luma|brin)-/.exec(layerId)?.[1]
  if (!kit) return undefined
  if (layerId.includes('-pose-')) return `${kit}-base.svg`
  if (layerId.includes('-mouth-') || layerId.includes('-eyes-')) return `${kit}-${layerId.split('-').slice(-2).join('-')}.svg`
  return undefined
}

const assertDialogueMouthContract = (scene, beatId) => {
  const beat = scene.dialogueBeats.find(item => item.id === beatId)
  assert.ok(beat, `${beatId}: authored dialogue is required`)
  const mouths = scene.layers.filter(layer => layer.faceBinding?.role === 'mouth')
  const closed = mouths.find(layer => layer.faceBinding.state === 'closed')
  const open = mouths.filter(layer => layer.faceBinding.state !== 'closed')
  assert.ok(closed, `${beatId}: closed mouth layer is required`)
  assert.ok(open.length > 0, `${beatId}: at least one open mouth layer is required`)
  assert.equal(evaluateSceneLayer(closed, 0).opacity, 1)
  assert.ok(open.every(layer => evaluateSceneLayer(layer, 0).opacity === 0))
  assert.ok(open.some(layer => layer.animation.keyframes?.some(frame => (
    frame.opacity === 1 && frame.time >= beat.start && frame.time < beat.end
  ))))
  assert.equal(evaluateSceneLayer(closed, scene.duration).opacity, 1)
  assert.ok(open.every(layer => evaluateSceneLayer(layer, scene.duration).opacity === 0))
}

const minimalResolverRecipe = (name, assets, audio = []) => ({
  version: 1,
  name,
  assets,
  audio,
  scene: {
    width: 320,
    height: 256,
    fps: 30,
    duration: 1,
    layers: [{ id: 'camera', type: 'camera' }, { id: 'fixture-plate', type: 'image', source: 'fixture-plate.svg' }],
  },
})

test('Video 3D baseline declares three ordered shots and two complete character kits', () => {
  const { brin, luma, recipe, sourceByFilename } = createVideo3dProductionFixture()
  const parsed = parseSceneRecipe(recipe)
  const shots = listRecipeShots(parsed)

  assert.equal(shots.length, 3)
  assert.deepEqual(shots.map(shot => shot.name), ['silent-establishing', 'luma-spanish', 'brin-english'])
  assert.deepEqual(shots.map(shot => shot.duration), [1.6, 2.4, 2.8])
  assert.equal(shots.reduce((total, shot) => total + shot.duration, 0), 6.8)
  assert.equal(Object.keys(luma.mouth).length, 4)
  assert.equal(Object.keys(brin.mouth).length, 4)
  assert.equal(luma.createdAt, '2026-01-01T00:00:00.000Z')
  assert.equal(luma.updatedAt, luma.createdAt)
  assert.ok(luma.mouth.closed.source.includes('%3Cpath'))
  assert.ok(luma.mouth.small.source.includes('%3Cellipse'))
  assert.ok(luma.mouth.wide.source.includes('Q80'))
  assert.ok(luma.mouth.round.source.includes('%3Cellipse'))
  assert.notEqual(luma.mouth.small.source, luma.mouth.round.source)
  assert.ok(luma.eyes.open.source.includes('%3Ccircle'))
  assert.ok(luma.eyes.blink.source.includes('%3Cpath'))
  assert.ok(Object.values(sourceByFilename).every(source => source.startsWith('data:image/svg+xml;')))
  assert.ok(parsed.assets.every(asset => asset.source === `${asset.id}.svg`))
})

test('Video 3D baseline movement is deterministic and keyed by the shot timeline', () => {
  const fixture = createVideo3dProductionFixture()
  const parsed = parseSceneRecipe(fixture.recipe)
  const shot = listRecipeShots(parsed)[1]
  const scene = compileRecipeShot(parsed, shot, Object.fromEntries(parsed.assets.map(asset => [asset.id, asset.source])), fixtureFileUrl(fixture.sourceByFilename))
  const plate = scene.layers.find(layer => layer.id === 'shot-luma-plate')
  assert.ok(plate)
  const atOneSecond = evaluateSceneLayer(plate, 1)
  assert.deepEqual(evaluateSceneLayer(plate, 1), atOneSecond)
  assert.notDeepEqual(evaluateSceneLayer(plate, .2), atOneSecond)
  assert.equal(plate.animation.duration, shot.duration)
})

test('Video 3D baseline round-trips a compiled scene without loading media', () => {
  const fixture = createVideo3dProductionFixture()
  const parsed = parseSceneRecipe(fixture.recipe)
  const shot = listRecipeShots(parsed)[1]
  const resolved = Object.fromEntries(parsed.assets.map(asset => [asset.id, asset.source]))
  const scene = compileRecipeShot(parsed, shot, resolved, fixtureFileUrl(fixture.sourceByFilename))
  const roundTrip = parseSceneFile(serializeSceneFile(scene))
  assert.equal(roundTrip.version, 1)
  assert.equal(roundTrip.width, 320)
  assert.equal(roundTrip.height, 256)
  assert.equal(roundTrip.fps, 30)
  assert.equal(roundTrip.duration, shot.duration)
  assert.deepEqual(roundTrip.layers.map(layer => layer.id), scene.layers.map(layer => layer.id))
  const compiledPlate = scene.layers.find(layer => layer.id === 'shot-luma-plate')
  assert.equal(compiledPlate.source, fixture.sourceByFilename['plate-aurora.svg'])
  assert.equal(roundTrip.layers.find(layer => layer.id === 'shot-luma-plate').source, compiledPlate.source)
  const visualLayers = scene.layers.filter(layer => layer.type === 'image' || layer.type === 'overlay')
  assert.ok(visualLayers.every(layer => {
    const expectedFilename = fixtureFilenameForLayer(layer.id)
    return expectedFilename && layer.source.startsWith('data:image/svg+xml;') && layer.source === fixture.sourceByFilename[expectedFilename]
  }))
})

test('Video 3D baseline keeps language text literal and scopes audio/dialogue per shot', () => {
  const fixture = createVideo3dProductionFixture()
  const parsed = parseSceneRecipe(fixture.recipe)
  assert.equal(parsed.audio.find(track => track.id === 'voice-luma-es').prompt, fixture.lumaText)
  assert.equal(parsed.dialogueBeats.find(beat => beat.id === 'beat-luma-es').text, fixture.lumaText)
  assert.equal(parsed.audio.find(track => track.id === 'voice-brin-en').prompt, fixture.brinText)
  assert.equal(parsed.dialogueBeats.find(beat => beat.id === 'beat-brin-en').text, fixture.brinText)

  const resolved = Object.fromEntries(parsed.assets.map(asset => [asset.id, asset.source]))
  resolved['voice-luma-es'] = 'fixture/luma-es.wav'
  resolved['voice-brin-en'] = 'fixture/brin-en.wav'
  const fileUrlFor = fixtureFileUrl(fixture.sourceByFilename)
  const silent = compileRecipeShot(parsed, listRecipeShots(parsed)[0], resolved, fileUrlFor)
  const luma = compileRecipeShot(parsed, listRecipeShots(parsed)[1], resolved, fileUrlFor)
  const brin = compileRecipeShot(parsed, listRecipeShots(parsed)[2], resolved, fileUrlFor)

  assert.equal(silent.audioTracks, undefined)
  assert.equal(silent.dialogueBeats, undefined)
  const silentMouths = silent.layers.filter(layer => layer.faceBinding?.role === 'mouth')
  assert.equal(evaluateSceneLayer(silentMouths.find(layer => layer.faceBinding.state === 'closed'), 0).opacity, 1)
  assert.ok(silentMouths.filter(layer => layer.faceBinding.state !== 'closed').every(layer => evaluateSceneLayer(layer, 0).opacity === 0))
  assert.deepEqual(luma.audioTracks.map(track => track.id), ['voice-luma-es'])
  assert.deepEqual(luma.dialogueBeats.map(beat => beat.id), ['beat-luma-es'])
  assert.deepEqual(brin.audioTracks.map(track => track.id), ['voice-brin-en'])
  assert.deepEqual(brin.dialogueBeats.map(beat => beat.id), ['beat-brin-en'])
  assert.equal(luma.dialogueBeats[0].text, fixture.lumaText)
  assert.equal(brin.dialogueBeats[0].text, fixture.brinText)
  assert.equal(luma.layers.some(layer => layer.id.includes('kit-brin')), false)
  assert.equal(brin.layers.some(layer => layer.id.includes('kit-luma')), false)
  assertDialogueMouthContract(luma, 'beat-luma-es')
  assertDialogueMouthContract(brin, 'beat-brin-en')
})

test('Video 3D baseline resolver is fail-closed and never fetches in manual mode', async t => {
  let fetchCalls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    fetchCalls += 1
    throw new Error('Video 3D baseline must not call the backend.')
  })
  const fixture = createVideo3dProductionFixture()
  const recipe = parseSceneRecipe(fixture.recipe)
  const resolved = await resolveRecipeAssets(recipe, { workspace: 'fixture', generateMissing: false })
  assert.equal(fetchCalls, 0)
  assert.equal(resolved['plate-aurora'], recipe.assets.find(asset => asset.id === 'plate-aurora').source)
  assert.equal(resolved['voice-luma-es'], 'fixture/luma-es.wav')
  assert.equal(resolved['voice-brin-en'], 'fixture/brin-en.wav')

  for (const kind of ['image', 'video', 'model3d']) {
    const missing = parseSceneRecipe(minimalResolverRecipe(`missing-${kind}`, [{ id: `missing-${kind}`, kind, prompt: `fixture ${kind}` }]))
    await assert.rejects(
      resolveRecipeAssets(missing, { workspace: 'fixture', generateMissing: false }),
      new RegExp(`Asset “missing-${kind}” has no source`),
    )
  }
  const missingAudio = parseSceneRecipe(minimalResolverRecipe('missing-audio', [], [{ id: 'missing-audio', kind: 'speech', prompt: 'fixture line' }]))
  await assert.rejects(
    resolveRecipeAssets(missingAudio, { workspace: 'fixture', generateMissing: false }),
    /Audio track “missing-audio” has no source/,
  )
  assert.equal(fetchCalls, 0)
})
