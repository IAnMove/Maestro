import { rebuildCutoutDialogueLayers } from '../../lib/cutoutDialogue'
import type { Scene } from '../../types'
import {
  applyPuppetSpeech,
  assertCutPaperKitHasNoPrivateGlb,
  cutPaperCamera,
  cutPaperLocationLayer,
  cutPaperPuppetLayers,
  emptyCutPaperScene,
  slidePuppet,
} from './puppet.ts'

export const CUT_PAPER_PILOT_DURATION = 78

export const CUT_PAPER_PILOT_SCRIPT = [
  { id: 'nilo-1', speaker: 'nilo', start: 6, end: 16, text: 'La fuente no está congelada. Alguien le pegó un cuadrado de papel cebolla.' },
  { id: 'berta-1', speaker: 'berta', start: 17, end: 24, text: 'Pues sabe a hielo. Lo probé.' },
  { id: 'nilo-2', speaker: 'nilo', start: 25, end: 30, text: 'Berta, eso es cola.' },
  { id: 'berta-2', speaker: 'berta', start: 31, end: 38, text: 'Cola fría. Como hielo.' },
  { id: 'kito-1', speaker: 'kito', start: 62, end: 68, text: '¡Era un sticker!' },
] as const

/** 78 s, three shots: plaza, talk, paper-sled gag. Dialogue first, then mouths, then slides. */
export function compileCutPaperPilotScene(): Scene {
  const duration = CUT_PAPER_PILOT_DURATION
  const scene = emptyCutPaperScene('Tijeral · la fuente', duration)
  scene.layers = [
    cutPaperCamera(duration),
    cutPaperLocationLayer('plaza', duration),
    ...cutPaperPuppetLayers({ characterId: 'nilo', x: 36, y: 62, scale: 1, z0: 20 }, duration),
    ...cutPaperPuppetLayers({ characterId: 'berta', x: 62, y: 64, scale: 0.95, z0: 30 }, duration),
    ...cutPaperPuppetLayers({ characterId: 'kito', x: 118, y: 70, scale: 0.7, z0: 40 }, duration),
  ]
  scene.layers.push({
    id: 'sticker-ice', name: 'Papel cebolla', type: 'image',
    source: '/examples/cut-paper/props/onion-paper.png',
    visible: true, locked: false, z: 8,
    transform: { x: 50, y: 58, scale: 0.22, opacity: 1, rotation: -6 },
    animation: {
      start: { x: 50, y: 58, scale: 0.22, opacity: 1, rotation: -6 },
      end: { x: 78, y: 82, scale: 0.18, opacity: 0, rotation: 18 },
      duration, curve: 'ease',
      keyframes: [
        { id: 'ice-0', time: 0, x: 50, y: 58, scale: 0.22, opacity: 1, rotation: -6, curve: 'hold' },
        { id: 'ice-1', time: 54, x: 50, y: 58, scale: 0.22, opacity: 1, rotation: -6, curve: 'ease' },
        { id: 'ice-2', time: 61, x: 78, y: 82, scale: 0.18, opacity: 0, rotation: 18, curve: 'ease' },
        { id: 'ice-3', time: duration, x: 78, y: 82, scale: 0.18, opacity: 0, rotation: 18, curve: 'hold' },
      ],
    },
    parallax: 0.4,
  })
  scene.layers = slidePuppet(scene.layers, 'kito', { x: 118, y: 70 }, { x: 52, y: 70 }, 54, 61)
  for (const line of CUT_PAPER_PILOT_SCRIPT) {
    scene.layers = applyPuppetSpeech(scene.layers, line.speaker, line.text, line.start, line.end, 30)
  }
  scene.dialogueBeats = CUT_PAPER_PILOT_SCRIPT.map(line => ({
    id: line.id, text: line.text, start: line.start, end: line.end,
    mouthLayerIds: ['closed', 'small', 'wide', 'round'].map(state => `puppet-${line.speaker}-mouth-${state}`),
    confidence: 'known-text' as const,
  }))
  scene.layers = rebuildCutoutDialogueLayers(scene.layers, scene.dialogueBeats ?? [], 30, duration)
  scene.texts = [
    { id: 'title', text: 'Tijeral', start: 0.4, end: 3.6, preset: 'rise', x: 50, y: 12, size: 7, color: '#1d2b5a', rotation: 0 },
  ]
  scene.audioTracks = CUT_PAPER_PILOT_SCRIPT.map(line => ({
    id: `vo-${line.id}`, filename: `vo-${line.speaker}-${line.id}.wav`,
    name: `${line.speaker} · ${line.text.slice(0, 24)}`, kind: 'speech' as const,
    startTime: line.start, volume: 1,
  }))
  assertCutPaperKitHasNoPrivateGlb(scene)
  return scene
}

export type CutPaperShotId = 'plaza' | 'talk' | 'sticker'

/** One Video 2D clip per Story Lab beat. Same kit, shorter timeline. */
export function compileCutPaperShot(shot: CutPaperShotId): Scene {
  const full = compileCutPaperPilotScene()
  if (shot === 'plaza') {
    const duration = 6
    const layers = full.layers.filter(layer => layer.type === 'camera' || layer.id === 'location-plaza' || layer.id === 'sticker-ice')
      .map(layer => ({ ...layer, animation: { ...layer.animation, duration } }))
    const scene = { ...full, name: 'Tijeral · plano 1 plaza', duration, layers, dialogueBeats: [], audioTracks: [], texts: full.texts }
    assertCutPaperKitHasNoPrivateGlb(scene)
    return scene
  }
  if (shot === 'talk') {
    const duration = 40
    const layers = full.layers.filter(layer =>
      layer.type === 'camera' || layer.id === 'location-plaza' || layer.id === 'sticker-ice'
      || layer.id.startsWith('puppet-nilo') || layer.id.startsWith('puppet-berta'))
      .map(layer => ({ ...layer, animation: { ...layer.animation, duration } }))
    const scene = {
      ...full, name: 'Tijeral · plano 2 cola fría', duration, layers,
      dialogueBeats: (full.dialogueBeats ?? []).filter(beat => beat.start < 40),
      audioTracks: (full.audioTracks ?? []).filter(track => track.startTime < 40),
      texts: [],
    }
    assertCutPaperKitHasNoPrivateGlb(scene)
    return scene
  }
  const duration = 26
  const scene = emptyCutPaperScene('Tijeral · plano 3 sticker', duration)
  scene.layers = [
    cutPaperCamera(duration),
    cutPaperLocationLayer('plaza', duration),
    ...cutPaperPuppetLayers({ characterId: 'nilo', x: 36, y: 62, scale: 1, z0: 20 }, duration),
    ...cutPaperPuppetLayers({ characterId: 'berta', x: 62, y: 64, scale: 0.95, z0: 30 }, duration),
    ...cutPaperPuppetLayers({ characterId: 'kito', x: 118, y: 70, scale: 0.7, z0: 40 }, duration),
    full.layers.find(layer => layer.id === 'sticker-ice')!,
  ]
  const ice = scene.layers.find(layer => layer.id === 'sticker-ice')
  if (ice) {
    ice.animation = {
      ...ice.animation, duration,
      keyframes: [
        { id: 'ice-0', time: 0, x: 50, y: 58, scale: 0.22, opacity: 1, rotation: -6, curve: 'hold' },
        { id: 'ice-1', time: 2, x: 50, y: 58, scale: 0.22, opacity: 1, rotation: -6, curve: 'ease' },
        { id: 'ice-2', time: 9, x: 78, y: 82, scale: 0.18, opacity: 0, rotation: 18, curve: 'ease' },
        { id: 'ice-3', time: duration, x: 78, y: 82, scale: 0.18, opacity: 0, rotation: 18, curve: 'hold' },
      ],
    }
  }
  scene.layers = slidePuppet(scene.layers, 'kito', { x: 118, y: 70 }, { x: 52, y: 70 }, 2, 9)
  scene.layers = applyPuppetSpeech(scene.layers, 'kito', '¡Era un sticker!', 10, 16, 30)
  scene.dialogueBeats = [{
    id: 'kito-1', text: '¡Era un sticker!', start: 10, end: 16,
    mouthLayerIds: ['closed', 'small', 'wide', 'round'].map(state => `puppet-kito-mouth-${state}`),
    confidence: 'known-text' as const,
  }]
  scene.layers = rebuildCutoutDialogueLayers(scene.layers, scene.dialogueBeats ?? [], 30, duration)
  scene.audioTracks = [{ id: 'vo-kito-1', filename: 'vo-kito-kito-1.wav', name: 'kito · sticker', kind: 'speech', startTime: 10, volume: 1 }]
  assertCutPaperKitHasNoPrivateGlb(scene)
  return scene
}
