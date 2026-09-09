import type { AgentPrepareAudioAction } from './agentActions'

const AUDIO_SUB_MODES = new Set<AgentPrepareAudioAction['subMode']>(['speech', 'music', 'sfx'])

const cleanString = (value: unknown, maxLength: number): string => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
)

const literalString = (value: unknown, maxLength: number): string | undefined => (
  typeof value === 'string' && value.length <= maxLength ? value : undefined
)

const optionalNumber = (
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const bounded = Math.max(minimum, Math.min(maximum, value))
  return integer ? Math.round(bounded) : bounded
}

const strictNumber = (
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
): number | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value < minimum || value > maximum || (integer && !Number.isInteger(value))) return undefined
  return value
}

const optionalPositiveNumber = (
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
): number | undefined => (
  typeof value === 'number' && value > 0
    ? optionalNumber(value, minimum, maximum, integer)
    : undefined
)

type ParsedAudioText = Pick<AgentPrepareAudioAction, 'prompt' | 'negativePrompt'>
type ParsedMusicControls = Pick<
  AgentPrepareAudioAction,
  'durationSeconds' | 'seed' | 'inferenceSteps' | 'guidanceScale' | 'outputCount'
>
type ParsedAudioControls = Pick<
  AgentPrepareAudioAction,
  'durationSeconds' | 'altPrompt' | 'musicDescription' | 'musicInstrumental'
  | 'seed' | 'inferenceSteps' | 'guidanceScale' | 'outputCount'
>

function parseAudioText(raw: Record<string, unknown>, literal: boolean): ParsedAudioText | null {
  const prompt = literal ? literalString(raw.prompt, 200_000) : cleanString(raw.prompt, 8_000)
  if (!prompt?.trim()) return null
  const negativePrompt = literal
    ? (raw.negative_prompt === undefined ? undefined : literalString(raw.negative_prompt, 200_000))
    : cleanString(raw.negative_prompt, 2_000) || undefined
  if (raw.negative_prompt !== undefined && negativePrompt === undefined) return null
  return { prompt, negativePrompt: negativePrompt || undefined }
}

function parseMusicControls(raw: Record<string, unknown>): ParsedMusicControls | null {
  const durationSeconds = strictNumber(raw.duration_seconds, 5, 360)
  const seed = strictNumber(raw.seed, -1, 2_147_483_647, true)
  const inferenceSteps = strictNumber(raw.inference_steps, 1, 1_000, true)
  const guidanceScale = strictNumber(raw.guidance_scale, 0, 1_000)
  const outputCount = strictNumber(raw.output_count, 1, 1, true)
  if (
    (raw.duration_seconds !== undefined && durationSeconds === undefined)
    || (raw.seed !== undefined && seed === undefined)
    || (raw.inference_steps !== undefined && inferenceSteps === undefined)
    || (raw.guidance_scale !== undefined && guidanceScale === undefined)
    || (raw.output_count !== undefined && outputCount === undefined)
  ) return null
  return { durationSeconds, seed, inferenceSteps, guidanceScale, outputCount }
}

function parseAudioExtras(
  raw: Record<string, unknown>,
  music: boolean,
): Pick<AgentPrepareAudioAction, 'altPrompt' | 'musicDescription' | 'musicInstrumental'> | null {
  const altPrompt = music
    ? (raw.alt_prompt === undefined ? undefined : literalString(raw.alt_prompt, 200_000))
    : undefined
  const musicDescription = music
    ? (raw.music_description === undefined ? undefined : literalString(raw.music_description, 200_000))
    : undefined
  if (raw.alt_prompt !== undefined && altPrompt === undefined) return null
  if (raw.music_description !== undefined && musicDescription === undefined) return null
  if (raw.music_instrumental !== undefined && typeof raw.music_instrumental !== 'boolean') return null
  return {
    altPrompt,
    musicDescription,
    musicInstrumental: music ? raw.music_instrumental as boolean | undefined : undefined,
  }
}

function parseNonMusicControls(
  raw: Record<string, unknown>,
  speech: boolean,
): ParsedMusicControls {
  return {
    durationSeconds: speech
      ? optionalNumber(raw.duration_seconds, 0, 1_800)
      : optionalPositiveNumber(raw.duration_seconds, 1, 20),
    seed: undefined,
    inferenceSteps: undefined,
    guidanceScale: undefined,
    outputCount: undefined,
  }
}

function parseAudioControls(
  raw: Record<string, unknown>,
  subMode: AgentPrepareAudioAction['subMode'],
): ParsedAudioControls | null {
  const music = subMode === 'music'
  const extras = parseAudioExtras(raw, music)
  if (!extras) return null
  const controls = music
    ? parseMusicControls(raw)
    : parseNonMusicControls(raw, subMode === 'speech')
  if (!controls) return null
  return { ...extras, ...controls }
}

export function parsePrepareAudioAction(raw: Record<string, unknown>): AgentPrepareAudioAction | null {
  const subMode = cleanString(raw.audio_sub_mode, 12) as AgentPrepareAudioAction['subMode']
  const text = parseAudioText(raw, subMode === 'speech' || subMode === 'music')
  if (!text) return null
  const controls = parseAudioControls(raw, subMode)
  if (!controls) return null
  return {
    type: 'prepare_audio',
    subMode: AUDIO_SUB_MODES.has(subMode) ? subMode : 'sfx',
    prompt: text.prompt,
    modelType: cleanString(raw.model_type, 160) || undefined,
    durationSeconds: controls.durationSeconds,
    negativePrompt: text.negativePrompt,
    altPrompt: controls.altPrompt,
    musicDescription: controls.musicDescription,
    musicInstrumental: controls.musicInstrumental,
    seed: controls.seed,
    inferenceSteps: controls.inferenceSteps,
    guidanceScale: controls.guidanceScale,
    outputCount: controls.outputCount,
  }
}

// Only explicitly named, bounded fields in the user's request are authoritative.
// A multiline value needs the next named header; never guess where prose ends.
const AUTHORED_MUSIC_HEADER = /^(?:Native[ \t]+)?(lyrics\/prompt|prompt|alt_prompt|music_description)(?:[ \t]+\(including line breaks\))?:[ \t]*(\r?\n)?/gim
const MUSIC_TEXT_FIELDS = {
  'lyrics/prompt': 'prompt', prompt: 'prompt',
  alt_prompt: 'altPrompt', music_description: 'musicDescription',
} as const

export function restoreAuthoredMusicFields(
  request: string,
  action: AgentPrepareAudioAction,
): AgentPrepareAudioAction {
  if (action.subMode !== 'music') return action
  const headers = [...request.matchAll(AUTHORED_MUSIC_HEADER)]
  const fields: Partial<Pick<AgentPrepareAudioAction, 'prompt' | 'altPrompt' | 'musicDescription'>> = {}
  const seen = new Set<string>()
  for (const [index, header] of headers.entries()) {
    const field = MUSIC_TEXT_FIELDS[header[1].toLowerCase() as keyof typeof MUSIC_TEXT_FIELDS]
    // Ambiguous duplicate labels must not silently pick a winner.
    if (seen.has(field)) return action
    seen.add(field)
    const start = header.index + header[0].length
    const next = headers[index + 1]
    if (header[2] && !next) continue
    const end = header[2] ? next.index : request.indexOf('\n', start)
    const value = request.slice(start, end < 0 ? undefined : end)
      .replace(header[2] ? /\r?\n$/ : /\r$/, '')
    if (value.length > 200_000 || (field === 'prompt' && !value.trim())) continue
    fields[field] = value
  }
  return { ...action, ...fields }
}
