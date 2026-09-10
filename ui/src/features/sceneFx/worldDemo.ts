import { createDefaultScene3DDocument } from '../scene3d/document'
import type { Scene3DDocument } from '../scene3d/types'
import { parseWorldSfx } from './world'

/** Small depth-test scene: orbiting camera, opaque column, standing portal, floor circle. */
export function worldSfxDepthDocument(): Scene3DDocument {
  const document = createDefaultScene3DDocument()
  document.duration = 10
  document.templateId = 'two-shot'
  document.dressing = 'none'
  document.camera = {
    family: 'orbit',
    eye: [0, 1.7, 5.4],
    look: [0, 0.9, -0.2],
    fov: 46,
    orbitRadius: 5.4,
    orbitHeight: 1.7,
    orbitTurns: 0.35,
  }
  document.slots = [
    { id: 'subject_1', slot: 'subject_1', position: [0.55, 0, 1.15], rotationY: 0.2, scale: 1, sourceUrl: '', media: 'model3d', clip: null },
    { id: 'column', slot: 'prop', position: [-1.15, 0, -0.35], rotationY: 0.4, scale: 2.4, sourceUrl: '', media: 'model3d', clip: null },
  ]
  document.worldSfx = parseWorldSfx([
    { id: 'demo-portal', kind: 'portal', start: 0, end: 10, position: { x: 0, y: 1.15, z: -1.35 }, scale: 1.6, color: '#bb77ff', seed: 11, sound: true, volume: 0.22 },
    { id: 'demo-circle', kind: 'magic_circle', start: 0, end: 10, position: { x: 0.1, y: 0.02, z: 0.15 }, scale: 1.5, color: '#66e0ff', seed: 23, sound: true, volume: 0.18 },
  ])
  document.sfx = [
    { id: 'demo-speed', kind: 'speedlines', start: 6, end: 9.5, x: 50, y: 48, size: 110, intensity: 0.8, color: '#ffffff', seed: 5, sound: false, volume: 0, rotation: 12 },
  ]
  return document
}
