import { defaultModelScreen } from '../mediaScreen.ts'
import type { Scene3DSlot, Scene3DSlotId, Scene3DSourceRef, Vec3 } from '../types.ts'
import { defaultSpeech, type ExpressionCue, type MouthCue, type Scene3DSpeech, type Scene3DSoundtrack } from './types'

export const FACE_PACK_GLB = '/examples/tv-head-humanoid.glb'
export const FACE_PACK_AUDIO_URL = '/examples/face-pack/neutral-vowels.wav'
export const TV_FACE_PACK_URL = '/examples/face-pack/tv-pack.png'
export const SKULL_FACE_PACK_URL = '/examples/face-pack/skull-pack.png'

const bundled = (filename: string, url: string): Scene3DSourceRef => (
  { workspaceId: 'bundled', filename, url }
)

export const FACE_PACK_AUDIO = bundled('neutral-vowels.wav', FACE_PACK_AUDIO_URL)
export const TV_FACE_PACK = bundled('tv-pack.png', TV_FACE_PACK_URL)
export const SKULL_FACE_PACK = bundled('skull-pack.png', SKULL_FACE_PACK_URL)

export const FACE_PACK_SOUNDTRACK: Scene3DSoundtrack[] = [
  { id: 'neutral-vowels', audio: FACE_PACK_AUDIO, start: 0, offset: 0, gain: 0.9, end: 8 },
]

const TV_MOUTH: MouthCue[] = [
  { start: 0, end: 0.35, viseme: 'rest' },
  { start: 0.35, end: 0.85, viseme: 'A' },
  { start: 0.85, end: 1.05, viseme: 'rest' },
  { start: 1.05, end: 1.55, viseme: 'E' },
  { start: 1.55, end: 1.75, viseme: 'rest' },
  { start: 1.75, end: 2.25, viseme: 'I' },
  { start: 2.25, end: 2.45, viseme: 'rest' },
  { start: 2.45, end: 2.95, viseme: 'O' },
  { start: 2.95, end: 3.15, viseme: 'rest' },
  { start: 3.15, end: 3.65, viseme: 'U' },
  { start: 3.65, end: 8, viseme: 'rest' },
]

const SKULL_MOUTH: MouthCue[] = [
  { start: 0, end: 4.35, viseme: 'rest' },
  { start: 4.35, end: 4.85, viseme: 'A' },
  { start: 4.85, end: 5.05, viseme: 'rest' },
  { start: 5.05, end: 5.55, viseme: 'E' },
  { start: 5.55, end: 5.75, viseme: 'rest' },
  { start: 5.75, end: 6.25, viseme: 'I' },
  { start: 6.25, end: 6.45, viseme: 'rest' },
  { start: 6.45, end: 6.95, viseme: 'O' },
  { start: 6.95, end: 7.15, viseme: 'rest' },
  { start: 7.15, end: 7.65, viseme: 'U' },
  { start: 7.65, end: 8, viseme: 'rest' },
]

const TV_FACE: ExpressionCue[] = [
  { start: 0, end: 0.35, expression: 'neutral' },
  { start: 0.35, end: 2.25, expression: 'happy' },
  { start: 2.25, end: 3.65, expression: 'surprised' },
  { start: 3.65, end: 8, expression: 'sleepy' },
]

const SKULL_FACE: ExpressionCue[] = [
  { start: 0, end: 4.35, expression: 'neutral' },
  { start: 4.35, end: 6.25, expression: 'angry' },
  { start: 6.25, end: 7.65, expression: 'worried' },
  { start: 7.65, end: 8, expression: 'sleepy' },
]

function demoSpeech(pack: Scene3DSourceRef, cues: MouthCue[], expressionCues: ExpressionCue[]): Scene3DSpeech {
  return {
    ...defaultSpeech(),
    enabled: true,
    audible: false,
    driver: 'imported',
    start: 0,
    offset: 0,
    end: 8,
    gain: 1,
    blink: false,
    eyes: false,
    facePack: pack,
    cues,
    expressionCues,
  }
}

export function talkingMascot(
  id: string,
  slot: Scene3DSlotId,
  position: Vec3,
  kind: 'tv' | 'skull',
  patch: Partial<Scene3DSlot> = {},
): Scene3DSlot {
  const pack = kind === 'tv' ? TV_FACE_PACK : SKULL_FACE_PACK
  const screen = {
    ...defaultModelScreen(['headfront', 'Head', 'tv_frame']),
    sourceUrl: pack.url,
    sourceRef: pack,
    media: 'image' as const,
    fit: 'cover' as const,
    // Bundled CRT walker: headfront +Z is out of the glass (not Meshy +Y).
    pitch: 0,
    yaw: 0,
    roll: 0,
    offset: [0, 0, 0.03],
    width: 0.30,
    height: 0.22,
  }
  return {
    id,
    slot,
    media: 'model3d',
    sourceUrl: FACE_PACK_GLB,
    clip: { index: 1, name: 'Idle' },
    clipPlayback: { speed: 1, start: 0, loop: true },
    position,
    rotationY: 0,
    scale: 1,
    grounded: true,
    screen,
    speech: demoSpeech(pack, kind === 'tv' ? TV_MOUTH : SKULL_MOUTH, kind === 'tv' ? TV_FACE : SKULL_FACE),
    ...patch,
  }
}
