import catalog from '../../../../app/shared/scene_effects.json' with { type: 'json' }
import { parseSceneFx, type SceneFx } from './types'

export const WORLD_SFX_KINDS = ['portal', 'magic_circle', 'summoning_gate'] as const
export type WorldSfxKind = (typeof WORLD_SFX_KINDS)[number]

export type WorldVec3 = { x: number; y: number; z: number }

export type WorldSfxAnchor = {
  slotId: string
  offset?: WorldVec3
}

export type WorldSfx = {
  id: string
  kind: WorldSfxKind
  label?: string
  start: number
  end: number
  position: WorldVec3
  rotation: WorldVec3
  scale: number
  intensity: number
  color: string
  seed: number
  sound: boolean
  volume: number
  anchor?: WorldSfxAnchor
}

const PRESETS = Object.fromEntries(catalog.map(item => [item.id, item]))
const number = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback

export function worldVec3(raw: unknown, fallback: WorldVec3, min: number, max: number): WorldVec3 {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return {
    x: number(value.x, fallback.x, min, max),
    y: number(value.y, fallback.y, min, max),
    z: number(value.z, fallback.z, min, max),
  }
}

export function isWorldSfxKind(value: unknown): value is WorldSfxKind {
  return typeof value === 'string' && (WORLD_SFX_KINDS as readonly string[]).includes(value)
}

export function parseWorldSfx(raw: unknown): WorldSfx[] {
  if (!Array.isArray(raw)) return []
  const ids = new Set<string>()
  return raw.slice(0, 64).flatMap((value: Partial<WorldSfx> | null, index) => {
    if (!value || !isWorldSfxKind(value.kind) || !PRESETS[value.kind]) return []
    const start = number(value.start, 0, 0, 600)
    const end = number(value.end, start + 2, 0, 600)
    const id = typeof value.id === 'string' && value.id ? value.id.slice(0, 160) : `world-fx-${index}`
    if (end <= start || ids.has(id)) return []
    ids.add(id)
    const preset = PRESETS[value.kind]
    const offset = value.anchor?.offset ? worldVec3(value.anchor.offset, { x: 0, y: 0, z: 0 }, -20, 20) : undefined
    const slotId = typeof value.anchor?.slotId === 'string' ? value.anchor.slotId.slice(0, 160) : ''
    return [{
      id,
      kind: value.kind,
      ...(typeof value.label === 'string' ? { label: value.label.slice(0, 80) } : {}),
      start,
      end,
      position: worldVec3(value.position, { x: 0, y: value.kind === 'magic_circle' ? 0.02 : 1.1, z: 0 }, -50, 50),
      rotation: worldVec3(value.rotation, { x: 0, y: 0, z: 0 }, -180, 180),
      scale: number(value.scale, 1.4, 0.05, 20),
      intensity: number(value.intensity, 1, 0.1, 2),
      color: typeof value.color === 'string' && /^#[\da-f]{6}$/i.test(value.color) ? value.color : preset.color,
      seed: Math.round(number(value.seed, index + 21, 1, 1000000)),
      sound: value.sound === true,
      volume: number(value.volume, 0.25, 0, 1),
      ...(slotId ? { anchor: { slotId, ...(offset ? { offset } : {}) } } : {}),
    }]
  })
}

export function worldSfxAudioCues(cues: readonly WorldSfx[] | undefined): SceneFx[] {
  return parseSceneFx((cues ?? []).map(cue => ({
    id: cue.id,
    kind: cue.kind,
    start: cue.start,
    end: cue.end,
    intensity: cue.intensity,
    color: cue.color,
    seed: cue.seed,
    sound: cue.sound,
    volume: cue.volume,
  })))
}

export function createWorldSfx(kind: WorldSfxKind, duration: number, taken: Iterable<string> = []): WorldSfx {
  const used = new Set(taken)
  let id = `world-${kind}`
  let n = 1
  while (used.has(id)) { n += 1; id = `world-${kind}-${n}` }
  const standing = kind !== 'magic_circle'
  return parseWorldSfx([{
    id,
    kind,
    start: 0,
    end: Math.min(8, Math.max(1, duration)),
    position: standing ? { x: 0, y: 1.1, z: -1.2 } : { x: 0, y: 0.02, z: 0.2 },
    sound: true,
  }])[0]
}

export const WORLD_SFX_SCHEMA = {
  type: 'array', maxItems: 64, items: {
    type: 'object', additionalProperties: false,
    properties: {
      id: { type: 'string', maxLength: 160 },
      kind: { enum: [...WORLD_SFX_KINDS] },
      label: { type: 'string', maxLength: 80 },
      start: { type: 'number', minimum: 0, maximum: 600 },
      end: { type: 'number', minimum: 0, maximum: 600 },
      position: { type: 'object', additionalProperties: false, properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'y', 'z'] },
      rotation: { type: 'object', additionalProperties: false, properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
      scale: { type: 'number', minimum: 0.05, maximum: 20 },
      intensity: { type: 'number', minimum: 0.1, maximum: 2 },
      color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      seed: { type: 'integer', minimum: 1, maximum: 1000000 },
      sound: { type: 'boolean' },
      volume: { type: 'number', minimum: 0, maximum: 1 },
      anchor: { type: 'object', additionalProperties: false, properties: {
        slotId: { type: 'string', maxLength: 160 },
        offset: { type: 'object', additionalProperties: false, properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
      }, required: ['slotId'] },
    },
    required: ['id', 'kind', 'start', 'end'],
  },
} as const
