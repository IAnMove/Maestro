import { parseScene3DLoop } from './backdrop.ts'
import { SCENE3D_TEMPLATE_IDS, type Scene3DDocument, type Scene3DSlot, type Scene3DTemplateId } from './types.ts'

const SLOT_COLORS: Record<string, [number, number, number]> = {
  subject_1: [40, 140, 220],
  subject_2: [220, 90, 70],
  background: [60, 60, 70],
  prop: [200, 180, 60],
}

export function scene3dSlotColor(slot: Scene3DSlot['slot']): [number, number, number] {
  return SLOT_COLORS[slot] ?? [180, 180, 180]
}

export function createDefaultScene3DDocument(): Scene3DDocument {
  return {
    version: 1,
    units: 'meters',
    up: 'y',
    width: 1280,
    height: 720,
    fps: 30,
    duration: 4,
    templateId: 'two-shot',
    camera: {
      family: 'establishment',
      eye: [0, 1.6, 4.2],
      look: [0, 1, 0],
      fov: 50,
      orbitRadius: 4.2,
      orbitHeight: 1.6,
      orbitTurns: 1,
    },
    light: {
      kind: 'directional',
      direction: [-0.35, -1, -0.25],
      intensity: 1.15,
      color: '#fff4e5',
    },
    slots: [
      {
        id: 'subject_1',
        slot: 'subject_1',
        position: [-0.85, 0, 0],
        rotationY: 0.35,
        scale: 1,
        sourceUrl: '',
        media: 'model3d',
        clip: null,
      },
      {
        id: 'subject_2',
        slot: 'subject_2',
        position: [0.85, 0, 0],
        rotationY: -0.35,
        scale: 1,
        sourceUrl: '',
        media: 'model3d',
        clip: null,
      },
    ],
  }
}

export function cloneScene3DDocument(document: Scene3DDocument): Scene3DDocument {
  return structuredClone(document)
}

export function parseScene3DDocument(raw: unknown): Scene3DDocument | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<Scene3DDocument>
  if (value.version !== 1 || value.units !== 'meters' || value.up !== 'y') return null
  if (!Array.isArray(value.slots) || !value.camera || !value.light) return null
  const slots = value.slots.map(slot => ({
    ...slot,
    media: slot.media === 'image' ? 'image' as const : 'model3d' as const,
    loop: parseScene3DLoop(slot.loop),
  }))
  const templateId: Scene3DTemplateId = typeof value.templateId === 'string'
    && (SCENE3D_TEMPLATE_IDS as readonly string[]).includes(value.templateId)
    ? value.templateId as Scene3DTemplateId
    : 'two-shot'
  return { ...value, slots, templateId } as Scene3DDocument
}
