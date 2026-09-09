import { createDefaultScene3DDocument } from './document'
import { CINEMATIC_TEMPLATE_IDS, type CinematicTemplateId } from './cinematicTemplateIds'
import type { Scene3DDocument, Scene3DFraming, Scene3DSlot, Scene3DSlotId, Vec3 } from './types'

type Preset = { framing: Partial<Scene3DFraming>; fov: number; duration?: number; slots?: Scene3DSlotId[]; dressing?: Scene3DDocument['dressing'] }
const PRESETS: Record<CinematicTemplateId, Preset> = {
  'face-closeup': { fov: 32, framing: { from: [.15, .08, 1.3], to: [.05, .03, 1.05] } },
  'face-extreme': { fov: 28, framing: { from: [0, .08, .86], to: [.08, .08, .7], lookFrom: [0, .07, .02] } },
  'face-profile': { fov: 34, framing: { from: [1.4, .05, .3], to: [1.1, .05, .2] } },
  'face-reaction-arc': { fov: 34, framing: { from: [-.55, .06, 1.6], to: [-.55, .06, 1.45], orbitTurns: .105 } },
  'face-low-angle': { fov: 36, framing: { from: [.1, -.48, 1.6], to: [.1, -.22, 1.15] } },
  'face-high-angle': { fov: 34, framing: { from: [-.15, .6, 1.5], to: [.1, .35, 1.2] } },
  'face-revelation': { fov: 30, duration: 2.5, framing: { from: [0, .05, 3.2], to: [0, .02, 1.15] } },
  'face-to-face': { fov: 40, slots: ['subject_1', 'subject_2', 'background'], framing: { from: [.57, .08, 2], to: [.57, .08, 1.8], lookFrom: [.57, .05, 0] } },
  'boots-to-face': { fov: 35, framing: { anchor: 'feet', from: [.4, .25, 2.1], to: [.15, 1.5, 2.1], lookFrom: [0, .12, 0], lookTo: [0, 1.45, 0] } },
  'dutch-charge': { fov: 43, dressing: 'chase-street', framing: { anchor: 'center', from: [.3, .2, 4], to: [-.3, .3, 3], rollFrom: -12, rollTo: 10, relativeToFacing: false } },
  'overhead-formation': { fov: 48, slots: ['subject_1', 'subject_2', 'prop', 'background'], framing: { anchor: 'feet', from: [0, 8, .1], to: [0, 7, .1], rollFrom: 0, rollTo: 40, relativeToFacing: false } },
  'camera-pass': { fov: 45, dressing: 'chase-street', framing: { anchor: 'center', from: [5, .3, 2], to: [-5, .3, 2], relativeToFacing: false } },
  'vehicle-showcase': { fov: 42, dressing: 'chase-street', framing: { anchor: 'center', from: [3.3, 1.1, 4.5], to: [3.3, 1.1, 4.5], orbitTurns: .4 } },
  'vehicle-front-low': { fov: 36, dressing: 'chase-street', framing: { anchor: 'feet', from: [.3, .4, 5.2], to: [0, .25, 3.7], lookFrom: [0, .6, 1] } },
  'vehicle-rear-chase': { fov: 47, dressing: 'chase-street', framing: { anchor: 'center', from: [.4, 1.2, -6], to: [.8, .8, -5.5] } },
  'vehicle-side-track': { fov: 38, dressing: 'chase-street', framing: { anchor: 'center', from: [6.4, .3, .5], to: [6.4, .4, -.3] } },
  'vehicle-wheel-detail': { fov: 38, dressing: 'chase-street', framing: { anchor: 'feet', from: [2.4, .6, 1.6], to: [1.8, .45, 1.3], lookFrom: [.75, .4, 1.1] } },
  'vehicle-roof-orbit': { fov: 43, dressing: 'chase-street', framing: { anchor: 'center', from: [2.5, 5, 2.5], to: [2.5, 5, 2.5], orbitTurns: .25 } },
  'vehicle-convoy': { fov: 48, dressing: 'chase-street', slots: ['subject_1', 'subject_2', 'prop', 'background'], framing: { anchor: 'center', from: [7, 4, 9], to: [6, 3, 8], lookFrom: [0, 0, -3] } },
  'vehicle-drift-arc': { fov: 46, dressing: 'chase-street', framing: { anchor: 'center', from: [4, 1.5, 5], to: [4, 1, 4.5], relativeToFacing: false } },
}

export const CINEMATIC_TEMPLATES = CINEMATIC_TEMPLATE_IDS.map(id => ({ id, camera: 'follow' as const, duration: PRESETS[id].duration ?? 5, slots: PRESETS[id].slots ?? ['subject_1', 'background'] as Scene3DSlotId[] }))
export const CINEMATIC_CATEGORIES = Object.fromEntries(CINEMATIC_TEMPLATE_IDS.map(id => [id, id.startsWith('vehicle-') ? 'drive' : 'cinema'])) as Record<CinematicTemplateId, 'drive' | 'cinema'>

function modelSlot(id: Scene3DSlotId, index: number, vehicle: boolean): Scene3DSlot {
  return { id, slot: id, media: id === 'background' ? 'image' : 'model3d', sourceUrl: '', clip: null,
    position: id === 'background' ? [0, 1, -7] : vehicle ? [index === 1 ? -2.4 : index === 2 ? 2.4 : 0, 0, -index * 4] : [index * 1.15, 0, 0],
    rotationY: 0, scale: id === 'background' ? 1 : vehicle ? .8 : 1, grounded: vehicle && id !== 'background',
    ...(id === 'background' ? { loop: { cylinder: true, speed: 0 } } : {}) }
}

export function cinematicDocument(id: string): Scene3DDocument | null {
  if (!(CINEMATIC_TEMPLATE_IDS as readonly string[]).includes(id)) return null
  const preset = PRESETS[id as CinematicTemplateId]
  const template = CINEMATIC_TEMPLATES.find(t => t.id === id)!
  const doc = createDefaultScene3DDocument()
  doc.templateId = template.id; doc.duration = template.duration; doc.dressing = preset.dressing ?? 'citadel'
  doc.slots = template.slots.map((slot, i) => modelSlot(slot, i, id.startsWith('vehicle-')))
  doc.camera = { family: 'follow', eye: [0, 2, 5], look: [0, 1, 0], fov: preset.fov,
    framing: { targetSlot: 'subject_1', anchor: 'head', from: [0, 0, 2], to: [0, 0, 1.5], ...preset.framing } }
  doc.light = { kind: 'directional', direction: [-.4, -.7, .8], intensity: 2, color: '#fff0dc' }
  if (['vehicle-rear-chase', 'vehicle-side-track', 'vehicle-convoy', 'dutch-charge', 'camera-pass', 'vehicle-drift-arc'].includes(id)) {
    const curve = id === 'vehicle-drift-arc'
    doc.slots.filter(s => s.media === 'model3d').forEach(slot => {
      const p = slot.position
      slot.position = [p[0] - 5, p[1], p[2]]
      slot.motion = { to: [p[0] + 5, p[1], p[2]], faceTravel: true, ...(curve ? { via: [p[0], p[1], p[2] + 4] as Vec3 } : {}) }
    })
  }
  return doc
}
