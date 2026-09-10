export const KINETIC_PRESETS = ['impact', 'rise', 'typewriter', 'wave'] as const
export type KineticText = {
  id: string
  text: string
  start: number
  end: number
  preset: typeof KINETIC_PRESETS[number]
  x: number
  y: number
  size: number
  color: string
  rotation: number
  font?: 'sans' | 'mono'
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const numeric = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback

/** Shared, bounded text contract for the 2D compositor and world-space editor. */
export function parseKineticTexts(raw: unknown): KineticText[] {
  if (!Array.isArray(raw)) return []
  const ids = new Set<string>()
  return raw.slice(0, 12).flatMap((value: Partial<KineticText> | null) => {
    if (!value || typeof value.id !== 'string' || !value.id || ids.has(value.id)) return []
    if (typeof value.text !== 'string' || value.text.length > 240) return []
    const start = Math.max(0, numeric(value.start, 0))
    const end = numeric(value.end, start + 3)
    if (end <= start) return []
    ids.add(value.id)
    return [{
      id: value.id, text: value.text, start, end,
      preset: KINETIC_PRESETS.includes(value.preset!) ? value.preset! : 'impact',
      x: clamp(numeric(value.x, 50), 0, 100), y: clamp(numeric(value.y, 82), 0, 100),
      size: clamp(numeric(value.size, 9), 2, 25),
      color: /^#[0-9a-f]{6}$/i.test(value.color ?? '') ? value.color! : '#ffe3a0',
      rotation: clamp(numeric(value.rotation, 0), -45, 45),
      ...(value.font === 'mono' || value.font === 'sans' ? { font: value.font } : {}),
    }]
  })
}

export function kineticTextFields(raw: unknown): { texts?: KineticText[] } {
  const texts = parseKineticTexts(raw)
  return texts.length ? { texts } : {}
}

export const KINETIC_TEXT_SCHEMA = {
  type: 'array', maxItems: 12, items: {
    type: 'object', properties: {
      id: { type: 'string' }, text: { type: 'string', maxLength: 240 },
      start: { type: 'number', minimum: 0 }, end: { type: 'number', minimum: 0 },
      preset: { enum: KINETIC_PRESETS }, x: { type: 'number', minimum: 0, maximum: 100 },
      y: { type: 'number', minimum: 0, maximum: 100 }, size: { type: 'number', minimum: 2, maximum: 25 },
      color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, rotation: { type: 'number', minimum: -45, maximum: 45 },
      font: { enum: ['sans', 'mono'] },
    }, required: ['id', 'text', 'start', 'end', 'preset'], additionalProperties: false,
  },
}

/** Pure time sampling: seeking backwards never depends on the last painted frame. */
export function kineticTextState(cue: KineticText, seconds: number) {
  if (seconds < cue.start || seconds >= cue.end) return null
  const elapsed = seconds - cue.start
  const enter = clamp(elapsed / Math.min(.65, (cue.end - cue.start) / 3), 0, 1)
  const exit = clamp((cue.end - seconds) / Math.min(.3, (cue.end - cue.start) / 3), 0, 1)
  const impact = .65 * (1 - enter) ** 2 * Math.cos(enter * Math.PI * 3)
  return {
    elapsed, opacity: Math.min(1, enter * 5) * exit,
    scale: cue.preset === 'impact' ? 1 + impact : 1,
    dy: cue.preset === 'rise' ? (1 - enter) ** 3 * .22 : 0,
    letters: cue.preset === 'typewriter' ? Math.ceil(Array.from(cue.text).length * clamp(elapsed / Math.min(1.7, (cue.end - cue.start) * .65), 0, 1)) : Array.from(cue.text).length,
  }
}

function paintTextLine(ctx: CanvasRenderingContext2D, text: string, y: number, cue: KineticText, time: number, size: number) {
  if (cue.preset !== 'wave') {
    ctx.strokeText(text, 0, y); ctx.fillText(text, 0, y)
    return
  }
  let x = -ctx.measureText(text).width / 2
  ctx.textAlign = 'left'
  Array.from(text).forEach((letter, index) => {
    const dy = Math.sin(time * 5.6 - index * .42) * size * .14
    ctx.strokeText(letter, x, y + dy); ctx.fillText(letter, x, y + dy)
    x += ctx.measureText(letter).width
  })
  ctx.textAlign = 'center'
}

export function paintKineticTexts(ctx: CanvasRenderingContext2D, width: number, height: number, seconds: number, cues: readonly KineticText[] = []) {
  for (const cue of cues) {
    const state = kineticTextState(cue, seconds)
    if (!state) continue
    ctx.save()
    let size = height * cue.size / 100
    const font = (pixels: number) => cue.font === 'mono' ? `700 ${pixels}px ui-monospace, monospace` : `900 ${pixels}px system-ui, sans-serif`
    ctx.font = font(size)
    const lines = cue.text.split('\n')
    const textWidth = Math.max(1, ...lines.map(line => ctx.measureText(line).width))
    size *= Math.min(1, width * .86 / textWidth)
    ctx.font = font(size)
    ctx.translate(width * cue.x / 100, height * (cue.y / 100 + state.dy))
    ctx.rotate(cue.rotation * Math.PI / 180)
    ctx.scale(state.scale, state.scale)
    ctx.globalAlpha = state.opacity
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
    ctx.strokeStyle = '#07101e'; ctx.lineWidth = Math.max(3, size * .085)
    ctx.fillStyle = cue.color; ctx.shadowColor = '#020711'; ctx.shadowBlur = size * .12
    ctx.shadowOffsetY = size * .065
    let remaining = state.letters
    lines.forEach((line, index) => {
      const letters = Array.from(line)
      paintTextLine(ctx, letters.slice(0, Math.max(0, remaining)).join(''), (index - (lines.length - 1) / 2) * size * 1.12, cue, state.elapsed, size)
      remaining -= letters.length + 1
    })
    ctx.restore()
  }
}
