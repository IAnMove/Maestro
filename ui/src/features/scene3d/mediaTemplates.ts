import { createDefaultScene3DDocument } from './document'
import { defaultMediaScreen, defaultModelScreen } from './mediaScreen'
import { MEDIA_TEMPLATE_IDS } from './mediaTemplateIds'
import type { Scene3DDocument, Scene3DSlot, Vec3 } from './types'

export const MEDIA_TEMPLATES = MEDIA_TEMPLATE_IDS.map(id => ({ id, camera: 'establishment' as const, duration: 6, slots: ['subject_1', 'prop'] as ('subject_1' | 'prop')[] }))
export const MEDIA_CATEGORIES = Object.fromEntries(MEDIA_TEMPLATE_IDS.map(id => [id, 'product'])) as Record<typeof MEDIA_TEMPLATE_IDS[number], 'product'>

export function createScreenSlot(id: string, position: Vec3, width = 4, height = 2.25): Scene3DSlot {
  return { id, slot: 'prop', media: 'screen', position, scale: 1, rotationY: 0, sourceUrl: '', clip: null,
    screen: { ...defaultMediaScreen(), width, height, style: 'frameless' } }
}

export function mediaTemplateDocument(id: string): Scene3DDocument | null {
  if (!(MEDIA_TEMPLATE_IDS as readonly string[]).includes(id)) return null
  const doc = createDefaultScene3DDocument()
  doc.templateId = id as Scene3DDocument['templateId']; doc.duration = 6; doc.dressing = 'observatory'
  doc.light = { kind: 'directional', direction: [-.4, -.8, -.6], intensity: 2.5, color: '#dde9ff' }
  const mascot: Scene3DSlot = { id: 'subject_1', slot: 'subject_1', media: 'model3d', sourceUrl: '', clip: null, position: [0, .1, 1], scale: .85, rotationY: 0 }
  doc.slots = [mascot, createScreenSlot('screen-main', [0, 1.8, -2.5], 6, 3.375)]
  doc.camera = { family: 'establishment', eye: [1, 2.6, 9], look: [0, 2.4, -1], fov: 43 }
  if (id === 'monitor-reveal' || id === 'desk-presenter' || id === 'monitor-detail') {
    doc.dressing = 'retro-lab'; mascot.position = [1.5, .2, .4]; mascot.scale = .7
    doc.slots[1] = createScreenSlot('screen-main', [-.8, .8, -.6], 2.5, 1.875)
    doc.slots[1].screen!.style = 'monitor'
    doc.camera = { family: 'reveal', eye: [1.6, 2.7, 6], look: [0, 1.8, 0], fov: 43 }
    if (id === 'desk-presenter') {
      doc.slots[1] = { ...mascot, id: 'computer', slot: 'prop', position: [-.8, 0, -.6], scale: 1.1, screen: defaultMediaScreen(), clip: null }
      doc.camera.family = 'establishment'
    }
    if (id === 'monitor-detail') { doc.slots = [doc.slots[1]]; doc.camera = { family: 'establishment', eye: [-.8, 2.13, 2.8], look: [-.8, 2.13, -.6], fov: 38 } }
  }
  if (id === 'screen-gallery' || id === 'product-finale') {
    for (const sign of [-1, 1]) { const screen = createScreenSlot(`screen-${sign}`, [sign * 5.3, 1, -1.8], 3.6, 2.8); screen.rotationY = -sign * .28; doc.slots.push(screen) }
    doc.camera.eye = [0, 3, 13]; doc.camera.look = [0, 2.8, -1.3]; doc.camera.fov = 48
    if (id === 'product-finale') { mascot.position = [0, .65, 2]; mascot.scale = 1.1; doc.camera.eye = [.5, 2.4, 11] }
  }
  if (id === 'billboard-plaza') {
    doc.dressing = 'broadcast-plaza'; doc.slots[1] = createScreenSlot('screen-main', [0, 0, -5], 12, 6.75); doc.slots[1].screen!.style = 'billboard'
    doc.camera = { family: 'reveal', eye: [3, 3, 14], look: [0, 4.2, -4], fov: 47 }; mascot.scale = 1.2
  }
  if (id === 'control-room') {
    doc.slots = [mascot]
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) doc.slots.push(createScreenSlot(`screen-${row}-${col}`, [(col - 1) * 3.1, 1.3 + row * 1.9, -3], 2.9, 1.63))
    doc.camera.eye = [2, 2.7, 9]; doc.camera.look = [0, 2.4, -2]
  }
  if (id === 'screen-corridor') {
    doc.slots = [mascot]; mascot.position = [0, .2, -5]; mascot.motion = { to: [0, .2, 4], faceTravel: true, easing: 'linear' }
    for (let i = 0; i < 3; i++) for (const sign of [-1, 1]) { const screen = createScreenSlot(`screen-${i}-${sign}`, [sign * 4, 1.2, 3 - i * 5], 4.2, 2.6); screen.rotationY = -sign * Math.PI / 2; doc.slots.push(screen) }
    doc.camera = { family: 'follow', eye: [0, 2, 6], look: [0, 1.2, 0], fov: 52, eyeOffset: [0, .5, 6], targetOffset: [0, 0, 0] }
  }
  if (id === 'tv-head-walk') {
    mascot.sourceUrl = '/examples/tv-head-humanoid.glb'
    mascot.position = [0, 0, 0.35]
    mascot.scale = 1
    mascot.grounded = true
    mascot.clip = { index: 0, name: 'Walking' }
    mascot.clipPlayback = { speed: 1, start: 0, loop: true }
    mascot.screen = defaultModelScreen(['headfront', 'Head', 'tv_frame'])
    mascot.screen.sourceUrl = '/examples/tv-head-face.png'
    mascot.screen.media = 'image'
    doc.slots = [mascot]
    doc.duration = 4
    doc.dressing = 'observatory'
    doc.camera = { family: 'establishment', eye: [1.6, 1.7, 4.2], look: [0, 1.35, 0], fov: 40 }
  }
  return doc
}
