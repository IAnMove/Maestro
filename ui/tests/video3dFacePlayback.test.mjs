import assert from 'node:assert/strict'
import test from 'node:test'
import { mountCharacterKitLayers } from '../src/lib/characterKit.ts'
import { ensureCutoutFacePlayback, normalizeFaceBinding } from '../src/lib/cutoutDialogue.ts'
import { parseSceneFile, serializeSceneFile } from '../src/lib/sceneFile.ts'
import { compileRecipeShot, listRecipeShots, parseSceneRecipe } from '../src/lib/sceneRecipe.ts'
import { evaluateSceneLayer } from '../src/lib/sceneTimeline.ts'
import { createVideo3dProductionFixture, fixtureFileUrl } from './fixtures/video3dProduction.mjs'

const compileFixtureShot = shotName => {
  const fixture = createVideo3dProductionFixture()
  const recipe = parseSceneRecipe(fixture.recipe)
  const shot = listRecipeShots(recipe).find(item => item.name === shotName)
  assert.ok(shot, `fixture shot ${shotName} exists`)
  const resolved = Object.fromEntries(recipe.assets.map(asset => [asset.id, asset.source]))
  const scene = compileRecipeShot(recipe, shot, resolved, fixtureFileUrl(fixture.sourceByFilename))
  return { fixture, scene }
}

/** The same normalization/import boundary used by SceneAnimatorPanel. */
const importSceneLikePanel = scene => {
  const parsed = parseSceneFile(serializeSceneFile(scene))
  return {
    ...parsed,
    layers: parsed.layers.map(layer => ({
      ...layer,
      faceBinding: normalizeFaceBinding(layer.faceBinding),
    })),
  }
}

const faceLayers = scene => scene.layers.filter(layer => (
  layer.faceBinding?.role === 'mouth'
  || layer.faceBinding?.role === 'eyes'
  || layer.faceBinding?.role === 'blink'
))

const eyeLayers = scene => scene.layers.filter(layer => (
  layer.faceBinding?.role === 'eyes' || layer.faceBinding?.role === 'blink'
))

const mouthLayers = scene => scene.layers.filter(layer => layer.faceBinding?.role === 'mouth')

const assertExactlyOneEyeState = (scene, characterId) => {
  const eyes = eyeLayers(scene)
  assert.equal(eyes.length, 2, `${characterId}: open and blink layers are required`)
  const frames = Math.ceil(scene.duration * (scene.fps ?? 30))
  for (let frame = 0; frame <= frames; frame += 1) {
    const time = Math.min(scene.duration, frame / (scene.fps ?? 30))
    const visible = eyes.filter(layer => evaluateSceneLayer(layer, time).opacity > .5)
    assert.equal(visible.length, 1, `${characterId}: exactly one eye state at frame ${frame}`)
  }
}

const withAuthorizedFaceKeyframes = scene => ({
  ...scene,
  layers: scene.layers.map(layer => {
    if (!layer.faceBinding || !['mouth', 'eyes', 'blink'].includes(layer.faceBinding.role)) return layer
    const visibleAtStart = layer.faceBinding.role === 'mouth'
      ? layer.faceBinding.state === 'closed'
      : layer.faceBinding.state === 'open'
    const point = (time, opacity) => ({
      id: `authorized-${layer.id}-${time}`,
      time,
      x: layer.transform.x,
      y: layer.transform.y,
      scale: layer.transform.scale,
      opacity,
      rotation: layer.transform.rotation ?? 0,
      curve: 'hold',
    })
    return {
      ...layer,
      animation: {
        ...layer.animation,
        keyframes: [
          point(0, visibleAtStart ? 1 : 0),
          point(scene.duration, layer.faceBinding.role === 'mouth'
            ? Number(layer.faceBinding.state === 'wide')
            : Number(layer.faceBinding.role === 'blink')),
        ],
      },
    }
  }),
})

test('Video 3D face import keeps open eyes and one visible eye state per character', () => {
  for (const [shotName, characterId, poseTransform] of [
    ['silent-establishing', 'luma', { x: 34, y: 58, scale: .62, opacity: 1, rotation: 0 }],
    ['brin-english', 'brin', { x: 66, y: 58, scale: .62, opacity: 1, rotation: 0 }],
  ]) {
    const { fixture, scene } = compileFixtureShot(shotName)
    const mounted = mountCharacterKitLayers(fixture[characterId], 'base', poseTransform, scene.duration)
    const mountedOpenEyes = mounted.find(layer => layer.faceBinding?.role === 'eyes')
    assert.ok(mountedOpenEyes, `${characterId}: fixture kit mounts open eyes`)

    const imported = importSceneLikePanel(scene)
    const openEyes = imported.layers.find(layer => layer.id === mountedOpenEyes.id)
    assert.equal(openEyes?.faceBinding?.state, 'open', `${characterId}: open state survives JSON import`)
    assert.deepEqual(openEyes?.relationship, { type: 'parent', targetLayerId: `kit-${characterId}-pose-base` })

    const playback = { ...imported, layers: ensureCutoutFacePlayback(imported.layers, imported.duration, imported.fps, imported.dialogueBeats ?? []) }
    assertExactlyOneEyeState(playback, characterId)
  }
})

test('silent cutout playback does not invent mouth movement, while explicit dialogue still animates', () => {
  const { scene } = compileFixtureShot('silent-establishing')
  const imported = importSceneLikePanel(scene)
  const before = mouthLayers(imported)
  assert.equal(imported.dialogueBeats, undefined)

  const silent = {
    ...imported,
    layers: ensureCutoutFacePlayback(imported.layers, imported.duration, imported.fps),
  }
  for (const layer of mouthLayers(silent)) {
    const original = before.find(item => item.id === layer.id)
    assert.deepEqual(layer.animation.keyframes, original.animation.keyframes, `${layer.id}: silence keeps authored mouth frames`)
  }
  const frames = Math.ceil(silent.duration * silent.fps)
  const closed = mouthLayers(silent).find(layer => layer.faceBinding.state === 'closed')
  const open = mouthLayers(silent).filter(layer => layer.faceBinding.state !== 'closed')
  for (let frame = 0; frame <= frames; frame += 1) {
    const time = Math.min(silent.duration, frame / silent.fps)
    assert.equal(evaluateSceneLayer(closed, time).opacity, 1, `closed mouth remains visible at frame ${frame}`)
    assert.ok(open.every(layer => evaluateSceneLayer(layer, time).opacity === 0), `silent mouth remains closed at frame ${frame}`)
  }

  const explicit = {
    ...imported,
    layers: ensureCutoutFacePlayback(imported.layers, imported.duration, imported.fps, [], 'La nieve canta en español.'),
  }
  const speaking = mouthLayers(explicit).filter(layer => layer.faceBinding.state !== 'closed')
  assert.ok(speaking.some(layer => layer.animation.keyframes?.some(frame => frame.opacity === 1)), 'explicit dialogue creates an open mouth pulse')
  assert.ok(speaking.every(layer => layer.animation.keyframes?.every(frame => (
    frame.x === layer.transform.x && frame.y === layer.transform.y && frame.scale === layer.transform.scale
  ))), 'dialogue keyframes retain the mounted face placement')
})

test('authorized facial keyframes are not overwritten by playback preparation', () => {
  const { scene } = compileFixtureShot('brin-english')
  const imported = importSceneLikePanel(scene)
  const authored = withAuthorizedFaceKeyframes(imported)
  const before = new Map(faceLayers(authored).map(layer => [layer.id, layer.animation.keyframes]))
  const prepared = ensureCutoutFacePlayback(authored.layers, authored.duration, authored.fps, [], 'Una línea nueva.')

  for (const layer of faceLayers({ ...authored, layers: prepared })) {
    assert.deepEqual(layer.animation.keyframes, before.get(layer.id), `${layer.id}: authored keyframes remain authoritative`)
  }
})
