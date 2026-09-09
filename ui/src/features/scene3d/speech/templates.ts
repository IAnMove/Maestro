import { createDefaultScene3DDocument } from '../document'
import type { Scene3DDocument, Scene3DSlot } from '../types'
import { SPEECH_TEMPLATE_IDS } from './templateIds'

export const SPEECH_TEMPLATES = SPEECH_TEMPLATE_IDS.map(id => ({
  id, camera: 'follow' as const, duration: id === 'speech-dialogue' ? 16 : 10,
  slots: id === 'speech-dialogue' ? ['subject_1', 'subject_2'] as const : ['subject_1'] as const,
})).map(item => ({ ...item, slots: [...item.slots] }))
export const SPEECH_CATEGORIES = Object.fromEntries(SPEECH_TEMPLATE_IDS.map(id => [id, 'cinema'])) as Record<typeof SPEECH_TEMPLATE_IDS[number], 'cinema'>
export function speechTemplateDocument(id: string): Scene3DDocument | null {
  const preset = SPEECH_TEMPLATES.find(item => item.id === id)
  if (!preset) return null
  const doc = createDefaultScene3DDocument()
  const duo = id === 'speech-dialogue', presenter = id === 'speech-presenter'
  const slots: Scene3DSlot[] = preset.slots.map((slot, i) => ({
    id: slot, slot, media: 'model3d', sourceUrl: '', clip: null, scale: 1,
    position: [duo ? i * .95 : 0, 0, 0], rotationY: duo ? (i ? -.15 : .15) : 0,
  }))
  return { ...doc, templateId: preset.id, duration: preset.duration, slots,
    camera: { family: 'follow', eye: [0, 1.5, 3], look: [0, 1.5, 0], fov: duo ? 40 : 32,
      framing: { targetSlot: 'subject_1', anchor: 'head', relativeToFacing: false,
        from: duo ? [.475, 0, 2.2] : presenter ? [0, -.15, 2.2] : [0, .02, 1.15],
        to: duo ? [.475, 0, 2.2] : presenter ? [0, -.15, 2] : [.04, .02, 1.05],
        lookFrom: duo ? [.475, 0, 0] : presenter ? [0, -.2, 0] : [0, .02, 0] } },
    light: { kind: 'directional', direction: [-.4, -.7, .8], intensity: 2, color: '#fff0dc' } }
}
