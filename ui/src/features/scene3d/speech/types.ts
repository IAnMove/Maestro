import type { Scene3DSourceRef, Vec3 } from '../types'

export const VISEMES = ['rest', 'M', 'A', 'E', 'I', 'O', 'U', 'F', 'L'] as const
export type Viseme = typeof VISEMES[number]
export type MouthCue = { start: number; end: number; viseme: Viseme }
export const EXPRESSIONS = ['neutral', 'happy', 'angry', 'worried', 'surprised', 'sleepy'] as const
export type Expression = typeof EXPRESSIONS[number]
/** Coordinates belong to the ORIGINAL mesh position attribute, before skinning. */
export type FacePlacement = {
  meshIndex: number
  center: Vec3
  size: readonly [number, number]
  skin: Vec3
  eyes: { left: Vec3; right: Vec3; size: readonly [number, number]; skinLeft: Vec3; skinRight: Vec3 }
}
export type Scene3DSpeech = {
  /** Optional repeated interventions. Face calibration remains shared by this model. */
  clips?: SpeechClip[]
  end?: number
  audible?: boolean
  version: 1
  enabled: boolean
  face?: FacePlacement
  audio?: Scene3DSourceRef
  atlas?: Scene3DSourceRef
  cues: MouthCue[]
  driver: 'rhubarb' | 'amplitude' | 'imported'
  start: number
  offset: number
  gain: number
  strength: number
  clean: boolean
  style: 'soft' | 'toon' | 'pixel'
  lip: string
  expression: Expression
  blink: boolean
  eyes: boolean
}
export type SpeechClip = {
  id: string
  text?: string
  audio?: Scene3DSourceRef
  cues: MouthCue[]
  driver: Scene3DSpeech['driver']
  start: number
  offset: number
  end?: number
  gain: number
  /** False when the same audio already belongs to the scene soundtrack. */
  audible?: boolean
}
export type Scene3DSoundtrack = Omit<SpeechClip, 'cues' | 'driver' | 'text'> & { audio: Scene3DSourceRef }
export function defaultSpeech(): Scene3DSpeech {
  return { version: 1, enabled: true, cues: [], driver: 'imported', start: 0, offset: 0, gain: 1,
    strength: .85, clean: true, style: 'soft', lip: '#874d47', expression: 'neutral', blink: true, eyes: true }
}
