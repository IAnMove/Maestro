import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CUT_PAPER_CAST,
  CUT_PAPER_FORBIDDEN,
  CUT_PAPER_KIT_ID,
  CUT_PAPER_LOCATIONS,
  CUT_PAPER_PIECES,
  CUT_PAPER_TOWN,
} from '../src/features/cutPaper/bible.ts'
import { compileCutPaperPilotScene, CUT_PAPER_PILOT_DURATION, CUT_PAPER_PILOT_SCRIPT } from '../src/features/cutPaper/pilot.ts'
import { assertCutPaperKitHasNoPrivateGlb, cutPaperKitManifest, cutPaperPuppetLayers } from '../src/features/cutPaper/puppet.ts'
import { parseSceneFile, serializeSceneFile } from '../src/lib/sceneFile.ts'

test('Tijeral kit ids are stable, original and not a private GLB body', () => {
  assert.equal(CUT_PAPER_KIT_ID, 'tijeral-cut-paper')
  assert.equal(CUT_PAPER_TOWN.id, 'tijeral')
  assert.equal(CUT_PAPER_CAST.length, 6)
  assert.equal(new Set(CUT_PAPER_CAST.map(item => item.id)).size, 6)
  assert.equal(CUT_PAPER_LOCATIONS.length, 5)
  assert.deepEqual([...CUT_PAPER_PIECES], ['legs', 'torso', 'arm-back', 'arm-front', 'head', 'face', 'hat'])
  assert.ok(CUT_PAPER_FORBIDDEN.some(item => item.includes('orange parka')))
  assert.equal(cutPaperKitManifest().characters.join(','), 'nilo,berta,kito,rami,paca,lino')
})

test('a puppet is parented paper pieces with a square face and independent mouths', () => {
  const layers = cutPaperPuppetLayers({ characterId: 'nilo', x: 40, y: 60, scale: 1 }, 8)
  const ids = layers.map(layer => layer.id)
  assert.ok(ids.includes('puppet-nilo'))
  assert.ok(CUT_PAPER_PIECES.every(piece => ids.includes(`puppet-nilo-${piece}`)))
  assert.ok(ids.includes('puppet-nilo-face'))
  assert.equal(layers.find(layer => layer.id === 'puppet-nilo-face')?.name.includes('face'), true)
  const mouths = layers.filter(layer => layer.faceBinding?.role === 'mouth')
  assert.equal(mouths.length, 4)
  assert.ok(mouths.every(layer => layer.faceBinding?.poseLayerId === 'puppet-nilo'))
  assert.ok(mouths.every(layer => layer.relationship?.targetLayerId === 'puppet-nilo'))
  assert.ok(layers.every(layer => layer.type !== 'model3d'))
  assert.throws(() => cutPaperPuppetLayers({ characterId: 'kenny', x: 0, y: 0, scale: 1 }, 1), /Unknown/)
})

test('pilot scene roundtrips, lasts 78s, talks, slides, and never mounts a GLB', () => {
  const scene = compileCutPaperPilotScene()
  assert.equal(scene.duration, CUT_PAPER_PILOT_DURATION)
  assert.equal(CUT_PAPER_PILOT_DURATION >= 60 && CUT_PAPER_PILOT_DURATION <= 90, true)
  assert.equal(scene.generationPolicy, 'provided_only')
  assert.equal(scene.layers.some(layer => layer.id === 'location-plaza'), true)
  assert.equal(scene.layers.some(layer => layer.id === 'puppet-kito'), true)
  assert.equal(scene.dialogueBeats?.length, CUT_PAPER_PILOT_SCRIPT.length)
  assert.ok(scene.dialogueBeats?.every(beat => beat.mouthLayerIds.length === 4))
  const kito = scene.layers.find(layer => layer.id === 'puppet-kito')
  const xs = (kito?.animation.keyframes ?? []).map(frame => frame.x)
  assert.ok(Math.min(...xs) < 60 && Math.max(...xs) > 100)
  assertCutPaperKitHasNoPrivateGlb(scene)
  const restored = parseSceneFile(serializeSceneFile(scene))
  assert.equal(restored.name, scene.name)
  assert.equal(restored.layers.length, scene.layers.length)
  assert.equal(restored.dialogueBeats?.length, scene.dialogueBeats?.length)
  assert.ok(restored.layers.every(layer => layer.type !== 'model3d' && !/\.glb/i.test(layer.source)))
})
