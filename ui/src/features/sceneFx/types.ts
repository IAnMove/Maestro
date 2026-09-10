import catalog from '../../../../app/shared/scene_effects.json'

export const FX_CATALOG = catalog
export type SceneFx = {
  id: string; kind: string; label?: string; start: number; end: number
  x: number; y: number; size: number; intensity: number; color: string
  seed: number; sound: boolean; volume: number
}
const number = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback

/** Absolute-time, seeded cues: scrubbing and export never advance a random simulation. */
export function parseSceneFx(raw: unknown): SceneFx[] {
  if (!Array.isArray(raw)) return []
  const ids = new Set<string>()
  return raw.slice(0, 64).flatMap((value: Partial<SceneFx> | null, index) => {
    const preset = catalog.find(item => item.id === value?.kind)
    if (!value || !preset) return []
    const start = number(value.start, 0, 0, 600), end = number(value.end, start + 2, 0, 600)
    const id = typeof value.id === 'string' && value.id ? value.id.slice(0, 160) : `fx-${index}`
    if (end <= start || ids.has(id)) return []
    ids.add(id)
    return [{ id, kind: preset.id, ...(typeof value.label === 'string' ? { label: value.label.slice(0, 80) } : {}), start, end, x: number(value.x, 50, 0, 100), y: number(value.y, 50, 0, 100),
      size: number(value.size, 65, 1, 200), intensity: number(value.intensity, 1, .1, 2),
      color: typeof value.color === 'string' && /^#[\da-f]{6}$/i.test(value.color) ? value.color : preset.color,
      seed: Math.round(number(value.seed, index + 1, 1, 1000000)), sound: value.sound === true,
      volume: number(value.volume, .25, 0, 1) }]
  })
}
export function sceneFxFields(raw: unknown): { sfx?: SceneFx[] } {
  const sfx = parseSceneFx(raw)
  return sfx.length ? { sfx } : {}
}
export function fxRandom(seed: number, index: number) {
  let value = Math.imul(seed ^ (index + 1), 0x45d9f3b)
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296
}

export const SCENE_FX_SCHEMA = {
  type: 'array', maxItems: 64, items: { type: 'object', additionalProperties: false,
    properties: { id: { type: 'string', maxLength: 160 }, kind: { enum: FX_CATALOG.map(item => item.id) },
      label: { type: 'string', maxLength: 80 }, start: { type: 'number', minimum: 0, maximum: 600 },
      end: { type: 'number', minimum: 0, maximum: 600 }, x: { type: 'number', minimum: 0, maximum: 100 },
      y: { type: 'number', minimum: 0, maximum: 100 }, size: { type: 'number', minimum: 1, maximum: 200 },
      intensity: { type: 'number', minimum: .1, maximum: 2 }, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      seed: { type: 'integer', minimum: 1, maximum: 1000000 }, sound: { type: 'boolean' }, volume: { type: 'number', minimum: 0, maximum: 1 } },
    required: ['id', 'kind', 'start', 'end'] },
} as const
