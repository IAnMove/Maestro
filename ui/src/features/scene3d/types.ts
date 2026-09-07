export type Vec3 = readonly [number, number, number]

export type Scene3DCameraFamily =
  | 'establishment'
  | 'follow'
  | 'orbit'
  | 'reveal'
  | 'encounter'
  | 'pursuit'
  | 'product'
  | 'musical'

export type Scene3DSlotId = 'subject_1' | 'subject_2' | 'background' | 'prop'

export const SCENE3D_TEMPLATE_IDS = [
  'two-shot',
  'product-orbit',
  'hero-push',
  'over-shoulder',
  'tracking',
  'crane-reveal',
  'establishing',
  'run-loop',
] as const

export type Scene3DTemplateId = (typeof SCENE3D_TEMPLATE_IDS)[number]

export type Scene3DClipRef = {
  index: number
  name: string
}

export type Scene3DSlotMedia = 'model3d' | 'image'

export type Scene3DLoop = {
  cylinder: boolean
  speed: number
}

export type Scene3DSlot = {
  id: string
  slot: Scene3DSlotId
  position: Vec3
  rotationY: number
  scale: number
  sourceUrl: string
  media: Scene3DSlotMedia
  clip: Scene3DClipRef | null
  loop?: Scene3DLoop
}

export type Scene3DCamera = {
  family: Scene3DCameraFamily
  eye: Vec3
  look: Vec3
  fov: number
  orbitRadius?: number
  orbitHeight?: number
  orbitTurns?: number
}

export type Scene3DLight = {
  kind: 'directional'
  direction: Vec3
  intensity: number
  color: string
}

export type Scene3DDocument = {
  version: 1
  units: 'meters'
  up: 'y'
  width: number
  height: number
  fps: 24 | 30 | 60
  duration: number
  templateId: Scene3DTemplateId
  camera: Scene3DCamera
  light: Scene3DLight
  slots: Scene3DSlot[]
}

export type Scene3DClipCatalogEntry = {
  index: number
  name: string
  durationSeconds: number | null
}

export type Scene3DClipError = {
  code: 'clip_missing' | 'clip_name_mismatch'
  message: string
}
