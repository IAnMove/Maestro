import { createDefaultScene3DDocument } from './document.ts'
import { SCENE3D_TEMPLATE_IDS, type Scene3DCameraFamily, type Scene3DDocument, type Scene3DSlot, type Scene3DSlotId, type Scene3DTemplateId } from './types.ts'

export { SCENE3D_TEMPLATE_IDS, type Scene3DTemplateId }

export type Scene3DTemplate = {
  id: Scene3DTemplateId
  camera: Scene3DCameraFamily
  duration: number
  slots: Scene3DSlotId[]
}

export const SCENE3D_TEMPLATES: readonly Scene3DTemplate[] = [
  { id: 'two-shot', camera: 'establishment', duration: 6, slots: ['subject_1', 'subject_2', 'background'] },
  { id: 'product-orbit', camera: 'product', duration: 6, slots: ['subject_1', 'background'] },
  { id: 'hero-push', camera: 'establishment', duration: 5, slots: ['subject_1', 'background'] },
  { id: 'over-shoulder', camera: 'encounter', duration: 6, slots: ['subject_1', 'subject_2', 'background'] },
  { id: 'tracking', camera: 'follow', duration: 6, slots: ['subject_1', 'background'] },
  { id: 'crane-reveal', camera: 'reveal', duration: 6, slots: ['subject_1', 'background'] },
  { id: 'establishing', camera: 'orbit', duration: 8, slots: ['background', 'prop'] },
  { id: 'run-loop', camera: 'side', duration: 8, slots: ['subject_1', 'background'] },
  { id: 'neon-run', camera: 'side', duration: 6, slots: ['subject_1', 'background'] },
  { id: 'block-street', camera: 'side', duration: 6, slots: ['subject_1', 'background'] },
  { id: 'space-float', camera: 'musical', duration: 6, slots: ['subject_1', 'background'] },
  { id: 'walk-void', camera: 'establishment', duration: 6, slots: ['subject_1', 'background'] },
  { id: 'dance-orbit', camera: 'orbit', duration: 6, slots: ['subject_1', 'background'] },
  { id: 'dance-stage', camera: 'musical', duration: 8, slots: ['subject_1', 'background'] },
  { id: 'cafe-dance', camera: 'front', duration: 8, slots: ['subject_1'] },
  { id: 'drive-chase', camera: 'chase', duration: 8, slots: ['background'] },
  { id: 'drive-hood', camera: 'hood', duration: 8, slots: ['background'] },
  { id: 'drive-wing', camera: 'wing', duration: 8, slots: ['background'] },
  { id: 'drive-orbit', camera: 'musical', duration: 8, slots: ['background'] },
  { id: 'drive-tunnel', camera: 'hood', duration: 8, slots: ['background'] },
  { id: 'drive-hero', camera: 'chase', duration: 8, slots: ['subject_1', 'background'] },
]

const LAYOUTS: Record<Scene3DTemplateId, Partial<Record<Scene3DSlotId, Pick<Scene3DSlot, 'position' | 'rotationY' | 'scale'>>>> = {
  'two-shot': {
    subject_1: { position: [-0.95, 0, 0], rotationY: 0.4, scale: 1 },
    subject_2: { position: [0.95, 0, 0], rotationY: -0.4, scale: 1 },
    background: { position: [0, 0, -6], rotationY: 0, scale: 8 },
  },
  'product-orbit': {
    subject_1: { position: [0, 0, 0], rotationY: 0, scale: 1 },
    background: { position: [0, 0, -6], rotationY: 0, scale: 8 },
  },
  'hero-push': {
    subject_1: { position: [0, 0, 0], rotationY: 0.15, scale: 1 },
    background: { position: [0, 0, -6], rotationY: 0, scale: 8 },
  },
  'over-shoulder': {
    subject_1: { position: [0.35, 0, 0.55], rotationY: -0.7, scale: 1 },
    subject_2: { position: [-0.55, 0, -0.35], rotationY: 2.5, scale: 1 },
    background: { position: [0, 0, -6], rotationY: 0, scale: 8 },
  },
  'tracking': {
    subject_1: { position: [0, 0, 0], rotationY: 1.57, scale: 1 },
    background: { position: [0, 0, -6], rotationY: 0, scale: 8 },
  },
  'crane-reveal': {
    subject_1: { position: [0, 0, 0], rotationY: 0.2, scale: 1 },
    background: { position: [0, 0, -6], rotationY: 0, scale: 8 },
  },
  establishing: {
    background: { position: [0, 0, -6], rotationY: 0, scale: 10 },
    prop: { position: [1.6, 0, -1.2], rotationY: -0.4, scale: 0.8 },
  },
  'run-loop': {
    subject_1: { position: [0, 0, 0], rotationY: 1.57, scale: 1 },
    background: { position: [0, 0, 0], rotationY: 0, scale: 1 },
  },
  'neon-run': {
    subject_1: { position: [0, 0, 0], rotationY: 1.57, scale: 1 },
    background: { position: [0, 0, 0], rotationY: 0, scale: 1 },
  },
  'block-street': {
    subject_1: { position: [0, 0, 0], rotationY: 1.57, scale: 1 },
    background: { position: [0, 0, 0], rotationY: 0, scale: 1 },
  },
  'space-float': {
    subject_1: { position: [0, 0.7, 0], rotationY: 0.35, scale: 1 },
    background: { position: [0, 0, 0], rotationY: 0, scale: 1 },
  },
  'walk-void': {
    subject_1: { position: [0, 0, 0], rotationY: 0.25, scale: 1 },
    background: { position: [0, 0, 0], rotationY: 0, scale: 1 },
  },
  'dance-orbit': {
    subject_1: { position: [0, 0, 0], rotationY: 0, scale: 1 },
    background: { position: [0, 0, 0], rotationY: 0, scale: 1 },
  },
  'dance-stage': {
    subject_1: { position: [0, 0, 0], rotationY: 0.2, scale: 1 },
    background: { position: [0, 0, 0], rotationY: 0, scale: 1 },
  },
  'cafe-dance': {
    subject_1: { position: [0, 0, 0.35], rotationY: 0, scale: 1 },
  },
  'drive-chase': {
    background: { position: [0, 0, 0], rotationY: 0, scale: 1 },
  },
  'drive-hood': {
    background: { position: [0, 0, 0], rotationY: 0, scale: 1 },
  },
  'drive-wing': {
    background: { position: [0, 0, 0], rotationY: 0, scale: 1 },
  },
  'drive-orbit': {
    background: { position: [0, 0, 0], rotationY: 0, scale: 1 },
  },
  'drive-tunnel': {
    background: { position: [0, 0, 0], rotationY: 0, scale: 1 },
  },
  'drive-hero': {
    subject_1: { position: [0.38, 0.52, 0.15], rotationY: 3.14, scale: 0.58 },
    background: { position: [0, 0, 0], rotationY: 0, scale: 1 },
  },
}

function emptySlot(id: Scene3DSlotId): Scene3DSlot {
  return {
    id,
    slot: id,
    position: [0, 0, 0],
    rotationY: 0,
    scale: 1,
    sourceUrl: '',
    media: id === 'background' ? 'image' : 'model3d',
    clip: null,
  }
}

export function applyScene3DTemplate(id: Scene3DTemplateId): Scene3DDocument {
  const template = SCENE3D_TEMPLATES.find(item => item.id === id) ?? SCENE3D_TEMPLATES[0]
  const layout = LAYOUTS[template.id]
  const document = createDefaultScene3DDocument()
  document.templateId = template.id
  document.duration = template.duration
  document.camera = {
    ...document.camera,
    family: template.camera,
    look: template.camera === 'chase' || template.camera === 'wing' || template.camera === 'hood' || template.id === 'drive-orbit'
      ? [0, 0.7, -0.4]
      : document.camera.look,
    orbitRadius: template.id === 'drive-orbit' ? 6.4 : document.camera.orbitRadius,
    orbitHeight: template.id === 'drive-orbit' ? 1.25 : document.camera.orbitHeight,
    ...(template.camera === 'side' ? { fov: 38 } : {}),
    ...(template.camera === 'front' ? { fov: 42 } : {}),
    ...(template.camera === 'chase' ? { fov: 40 } : {}),
    ...(template.camera === 'hood' ? { fov: 55 } : {}),
    ...(template.camera === 'wing' ? { fov: 36 } : {}),
  }
  document.slots = template.slots.map(slotId => {
    const slot = emptySlot(slotId)
    const pose = layout[slotId]
    const next = pose ? { ...slot, ...pose } : slot
    const cylinder = CYLINDER_BY_TEMPLATE[template.id]
    if (cylinder && slotId === 'background') {
      return {
        ...next,
        media: 'image',
        sourceUrl: cylinder.plate ?? next.sourceUrl,
        loop: { cylinder: true, speed: cylinder.speed },
      }
    }
    return next
  })
  document.dressing = DRESSING_BY_TEMPLATE[template.id]
  return document
}

const CYLINDER_BY_TEMPLATE: Partial<Record<Scene3DTemplateId, { speed: number; plate?: string }>> = {
  'run-loop': { speed: -0.18 },
  'neon-run': { speed: -0.26 },
  'block-street': { speed: -0.16 },
  'space-float': { speed: 0.05 },
  'walk-void': { speed: 0.08 },
  'dance-orbit': { speed: 0.04 },
  'dance-stage': { speed: 0.03 },
  'drive-chase': { speed: 0.2, plate: '/scene3d/drive-city.jpg' },
  'drive-hood': { speed: 0.24, plate: '/scene3d/drive-city.jpg' },
  'drive-wing': { speed: 0.16, plate: '/scene3d/drive-coast.jpg' },
  'drive-orbit': { speed: 0.12, plate: '/scene3d/drive-city.jpg' },
  'drive-tunnel': { speed: 0.22, plate: '/scene3d/drive-tunnel.jpg' },
  'drive-hero': { speed: 0.18, plate: '/scene3d/drive-city.jpg' },
}

const DRESSING_BY_TEMPLATE: Partial<Record<Scene3DTemplateId, Scene3DDocument['dressing']>> = {
  'run-loop': 'treadmill',
  'neon-run': 'treadmill',
  'block-street': 'treadmill',
  'space-float': 'space',
  'dance-stage': 'street',
  'cafe-dance': 'cafe',
  'drive-chase': 'drive-city',
  'drive-hood': 'drive-city',
  'drive-wing': 'drive-coast',
  'drive-orbit': 'drive-city',
  'drive-tunnel': 'drive-tunnel',
  'drive-hero': 'drive-city',
}

export function patchScene3DSlot(
  document: Scene3DDocument,
  slotId: string,
  patch: Partial<Pick<Scene3DSlot, 'position' | 'rotationY' | 'scale' | 'sourceUrl' | 'sourceRef' | 'media' | 'clip' | 'loop'>>,
): Scene3DDocument {
  return {
    ...document,
    slots: document.slots.map(slot => slot.id === slotId ? { ...slot, ...patch } : slot),
  }
}
