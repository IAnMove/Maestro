import { createDefaultScene3DDocument } from './document'
import { createScreenSlot, mediaTemplateDocument } from './mediaTemplates'
import { parseWorldSfx } from '../sceneFx/world'
import type { Scene3DDocument, Scene3DSlotId } from './types'

export const EFFECTS_TEMPLATES = (['reflective-stage', 'character-materialization'] as const).map(id => ({
  id, camera: 'establishment' as const, duration: 8, slots: ['subject_1', 'background', 'prop'] as Scene3DSlotId[],
}))

export function effectsTemplateDocument(id: string): Scene3DDocument | null {
  if (id !== 'reflective-stage' && id !== 'character-materialization') return null
  const doc = createDefaultScene3DDocument(), arrival = id === 'character-materialization'
  doc.templateId = id; doc.duration = 8
  doc.environment = { reflectiveFloor: true, platform: arrival, bloom: .48 }
  doc.light = { kind: 'directional', direction: [-.4, -.8, -.6], intensity: 3.2, color: '#e9e3ff' }
  const actor = mediaTemplateDocument('tv-head-walk')!.slots[0]
  actor.position = [0, arrival ? .235 : 0, 0]; actor.performance = 'idle'; actor.clipPlayback = { start: .15, speed: 1, loop: true }
  if (arrival) actor.appearance = { start: 2, duration: .8, color: '#83e8ff' }
  doc.slots = [actor, { id: 'background', slot: 'background', media: 'image', sourceUrl: '', clip: null,
    position: [0, 0, 0], scale: 1, rotationY: 0, surface: 'environment' }]
  if (arrival) {
    for (const sign of [-1, 1]) {
      const screen = createScreenSlot(`portrait-${sign}`, [sign * 2.5, .7, -1.7], 2.5, 2.5)
      screen.screen!.sourceUrl = '/examples/tv-head-face.png'
      doc.slots.push(screen)
    }
  }
  doc.camera = { family: 'establishment', eye: [arrival ? .15 : 1.7, 1.9, arrival ? 7.8 : 5.3], look: [0, 1.2, 0], fov: 42 }
  doc.worldSfx = parseWorldSfx([
    { id: 'mist', kind: 'smoke', start: 0, end: 8, position: { x: 0, y: .23, z: -.6 }, scale: 1.4, color: '#987dcc', intensity: .65 },
    { id: 'gate', kind: 'summoning_gate', start: arrival ? .7 : 0, end: arrival ? 3.5 : 8, position: { x: 0, y: 1.45, z: -.7 }, scale: 1.6, color: '#b997ff' },
    ...(arrival ? [
      { id: 'strike', kind: 'lightning', start: 1.95, end: 2.55, position: { x: .5, y: 7, z: -.2 }, targetPosition: { x: 0, y: .24, z: 0 }, color: '#a5edff', intensity: 1.5 },
      { id: 'shock', kind: 'shockwave', start: 2, end: 3.4, position: { x: 0, y: .26, z: 0 }, color: '#b997ff', scale: 1.6 },
      { id: 'sparks', kind: 'sparks', start: 2, end: 4.5, position: { x: 0, y: .3, z: 0 }, color: '#f7c186', intensity: 1.3 },
    ] : []),
  ])
  return doc
}
