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
  | 'side'
  | 'front'
  | 'chase'
  | 'hood'
  | 'wing'

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
  'neon-run',
  'block-street',
  'space-float',
  'walk-void',
  'dance-orbit',
  'dance-stage',
  'cafe-dance',
  'drive-chase',
  'drive-hood',
  'drive-wing',
  'drive-orbit',
  'drive-tunnel',
  'drive-hero',
  'portrait-arc',
  'duo-diagonal',
  'high-angle',
  'wide-tableau',
  'product-detail',
  'product-pair',
  'product-pedestal',
  'duet-stage',
  'cafe-duet',
  'stage-crane',
  'space-encounter',
  'space-survey',
  'drive-coast-reveal',
  'drive-city-wide',
  'drive-tunnel-wing',
  'siege-ring',
  'spell-duel',
  'victory-circle',
  'coder-room',
  'clone-chase',
] as const

export type Scene3DTemplateId = (typeof SCENE3D_TEMPLATE_IDS)[number]

export type Scene3DClipRef = {
  index: number
  name: string
}

export type Scene3DClipPlayback = {
  speed?: number
  start?: number
  loop?: boolean
}

export type Scene3DMotion = {
  to: Vec3
  via?: Vec3
  faceTravel?: boolean
  turnTo?: number
  easing?: 'linear' | 'smooth'
}

export type Scene3DSlotMedia = 'model3d' | 'image'

export type Scene3DLoop = {
  cylinder: boolean
  speed: number
}

export type Scene3DDressing = 'none' | 'street' | 'space' | 'treadmill' | 'cafe' | 'drive-city' | 'drive-coast' | 'drive-tunnel' | 'citadel' | 'workshop' | 'chase-street'

export type Scene3DSourceRef = {
  workspaceId: string
  filename: string
  url: string
  assetId?: string
}

export type Scene3DSlot = {
  id: string
  slot: Scene3DSlotId
  position: Vec3
  rotationY: number
  scale: number
  sourceUrl: string
  sourceRef?: Scene3DSourceRef
  media: Scene3DSlotMedia
  surface?: 'wall' | 'floor'
  textureRepeat?: number
  performance?: 'typing'
  grounded?: boolean
  clip: Scene3DClipRef | null
  clipPlayback?: Scene3DClipPlayback
  motion?: Scene3DMotion
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
  targetOffset?: Vec3
  eyeOffset?: Vec3
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
  /** Stable review number, baked into exported frames when present. */
  clipNumber?: number
  texts?: import('../../lib/kineticText').KineticText[]
  /** Timeline rate; exported duration is duration / playbackSpeed. */
  playbackSpeed?: number
  templateId: Scene3DTemplateId
  camera: Scene3DCamera
  light: Scene3DLight
  dressing?: Scene3DDressing
  workshopScreen?: 'code' | 'error' | 'success'
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
