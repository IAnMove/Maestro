import { EXPRESSIONS, VISEMES, defaultSpeech, type FacePlacement, type MouthCue, type Scene3DSpeech, type Viseme } from './types'
import { parseScene3DSourceRef } from '../slotSource'

const RHUBARB: Record<string, Viseme> = { X: 'rest', A: 'M', B: 'I', C: 'E', D: 'A', E: 'O', F: 'U', G: 'F', H: 'L' }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const vector = (value: unknown, length: number, min: number, max: number) => Array.isArray(value) && value.length === length && value.every(n => finite(n, min, max))

export function parseMouthCues(raw: unknown): MouthCue[] {
  const data = object(raw)
  const entries = Array.isArray(raw) ? raw : data.mouthCues ?? data.cues ?? object(data.track).cues
  if (!Array.isArray(entries) || entries.length > 10000) throw new Error('Invalid mouth cues (maximum 10,000).')
  const cues = entries.map(entry => {
    const cue = object(entry)
    const shape = cue.value ?? cue.shape
    const viseme = (typeof shape === 'string' ? RHUBARB[shape] : undefined) ?? cue.viseme
    if (!VISEMES.includes(viseme as Viseme) || !finite(cue.start, 0, 600) || !finite(cue.end, 0, 600) || cue.end <= cue.start) throw new Error('Invalid mouth cue.')
    return { start: cue.start, end: cue.end, viseme: viseme as Viseme }
  }).sort((a, b) => a.start - b.start)
  if (cues.some((cue, index) => index > 0 && cue.start < cues[index - 1].end - 1e-6)) throw new Error('Overlapping mouth cues.')
  return cues
}
export function validFace(value: unknown): value is FacePlacement {
  const face = object(value), eyes = object(face.eyes)
  return Number.isInteger(face.meshIndex) && finite(face.meshIndex, 0, 1023)
    && vector(face.center, 3, -10000, 10000) && vector(face.size, 2, .00001, 10000) && vector(face.skin, 3, 0, 1)
    && vector(eyes.left, 3, -10000, 10000) && vector(eyes.right, 3, -10000, 10000)
    && vector(eyes.size, 2, .00001, 10000) && vector(eyes.skinLeft, 3, 0, 1) && vector(eyes.skinRight, 3, 0, 1)
}
export function parseSpeech(raw: unknown): Scene3DSpeech | undefined {
  if (raw === undefined) return undefined
  const data = object(raw), defaults = defaultSpeech()
  if (data.version !== 1 || typeof data.enabled !== 'boolean') throw new Error('Invalid speech configuration.')
  if (data.face !== undefined && !validFace(data.face)) throw new Error('Invalid face placement.')
  const ref = (key: 'audio' | 'atlas') => {
    if (data[key] === undefined) return undefined
    const parsed = parseScene3DSourceRef(data[key])
    if (!parsed || !safeMediaUrl(parsed.url)) throw new Error('Invalid speech asset.')
    return parsed
  }
  for (const [key, min, max] of [['start', 0, 600], ['offset', 0, 600], ['gain', 0, 1], ['strength', 0, 1.5]] as const) {
    if (!finite(data[key], min, max)) throw new Error('Invalid speech timing or level.')
  }
  return { ...defaults, version: 1, enabled: data.enabled, face: data.face as FacePlacement | undefined,
    audio: ref('audio'), atlas: ref('atlas'), cues: parseMouthCues(data.cues), start: data.start as number, offset: data.offset as number,
    gain: data.gain as number, strength: data.strength as number, clean: data.clean !== false,
    style: data.style === 'toon' || data.style === 'pixel' ? data.style : 'soft',
    driver: data.driver === 'rhubarb' || data.driver === 'amplitude' ? data.driver : 'imported',
    lip: typeof data.lip === 'string' && /^#[0-9a-f]{6}$/i.test(data.lip) ? data.lip : defaults.lip,
    expression: EXPRESSIONS.includes(data.expression as typeof EXPRESSIONS[number]) ? data.expression as typeof EXPRESSIONS[number] : 'neutral',
    blink: data.blink !== false, eyes: data.eyes !== false }
}
export function safeMediaUrl(url: string) {
  return /^(https?:\/\/|\/(?!\/))/.test(url) && ![...url].some(c => c.charCodeAt(0) <= 32 || c === '\\')
}
export function cueAt(cues: readonly MouthCue[], time: number): Viseme {
  let lo = 0, hi = cues.length - 1, found: MouthCue | undefined
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (cues[mid].start <= time) { found = cues[mid]; lo = mid + 1 } else hi = mid - 1 }
  return found && time < found.end ? found.viseme : 'rest'
}
/** Pure time sampling, including seeking backwards and rendering frames out of order. */
export function mouthAt(speech: Scene3DSpeech, sceneSeconds: number) {
  const time = sceneSeconds - speech.start + speech.offset
  if (!speech.enabled || sceneSeconds < speech.start) return { a: 0, b: 0, mix: 1 }
  const current = cueAt(speech.cues, time)
  const previous = cueAt(speech.cues, time - .045)
  let boundary = 0
  for (const cue of speech.cues) {
    if (cue.start <= time) boundary = Math.max(boundary, cue.start)
    if (cue.end <= time) boundary = Math.max(boundary, cue.end)
    if (cue.start > time) break
  }
  return { a: VISEMES.indexOf(previous), b: VISEMES.indexOf(current), mix: Math.min(1, Math.max(0, (time - boundary) / .045)) }
}
export function amplitudeCues(buffer: AudioBuffer): MouthCue[] {
  const samples = buffer.getChannelData(0), step = Math.max(1, Math.round(buffer.sampleRate / 30)), levels: number[] = []
  for (let i = 0; i < samples.length; i += step) {
    let sum = 0
    for (let j = i; j < Math.min(i + step, samples.length); j++) sum += samples[j] ** 2
    levels.push(Math.sqrt(sum / step))
  }
  const peak = Math.max(.03, ...levels), result: MouthCue[] = []
  levels.forEach((level, i) => {
    const normalized = Math.max(0, (level - .006) / (peak * .7))
    const viseme: Viseme = normalized < .055 ? 'rest' : normalized > .45 ? 'A' : 'E'
    const end = Math.min(buffer.duration, (i + 1) * step / buffer.sampleRate)
    if (result.at(-1)?.viseme === viseme) result[result.length - 1].end = end
    else result.push({ start: i * step / buffer.sampleRate, end, viseme })
  })
  return result
}
