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
  { id: 'run-loop', camera: 'pursuit', duration: 8, slots: ['subject_1', 'background'] },
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
  }
  document.slots = template.slots.map(slotId => {
    const slot = emptySlot(slotId)
    const pose = layout[slotId]
    const next = pose ? { ...slot, ...pose } : slot
    if (template.id === 'run-loop' && slotId === 'background') {
      return { ...next, media: 'image', loop: { cylinder: true, speed: 0.18 } }
    }
    return next
  })
  return document
}

export function patchScene3DSlot(
  document: Scene3DDocument,
  slotId: string,
  patch: Partial<Pick<Scene3DSlot, 'position' | 'rotationY' | 'scale' | 'sourceUrl' | 'media' | 'clip' | 'loop'>>,
): Scene3DDocument {
  return {
    ...document,
    slots: document.slots.map(slot => slot.id === slotId ? { ...slot, ...patch } : slot),
  }
}
