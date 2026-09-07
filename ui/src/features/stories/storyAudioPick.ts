import type { ApiOutput } from '../../api/outputs'
import type { StoryMusicCandidate } from './types'

export type StoryAudioCapture = {
  projectId: string
  cueId?: string
}

export type CoverPatch = {
  mode: 'cover'
  coverReferenceFilename: string
  coverReferenceName: string
}

export type CueAudioRole = 'lyria' | 'custom'

export function audioBindingFilename(item: ApiOutput): string {
  const path = typeof item.path === 'string' ? item.path.trim() : ''
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  return (path || name).split(/[\\/]/).pop() || name
}

export function isAudioOutput(item: ApiOutput | null): item is ApiOutput {
  if (!item) return false
  if (item.type === 'audio') return true
  return /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(item.name || item.path || '')
}

export function isCustomMp3Output(item: ApiOutput): boolean {
  const filename = audioBindingFilename(item)
  return /\.mp3$/i.test(filename) || /\.mp3(\?|$)/i.test(item.url || '')
}

export function coverPatchFromOutput(item: ApiOutput): CoverPatch {
  return {
    mode: 'cover',
    coverReferenceFilename: audioBindingFilename(item),
    coverReferenceName: item.name,
  }
}

export function cueCandidateFromOutput(
  item: ApiOutput,
  input: {
    role: CueAudioRole
    id: string
    title: string
    language: string
    version: number
    prompt: string
    lyrics: string
    createdAt?: string
  },
): StoryMusicCandidate {
  const filename = audioBindingFilename(item)
  const custom = input.role === 'custom'
  return {
    id: input.id,
    displayName: custom
      ? `${input.title} · custom MP3 · v${input.version}`
      : `${input.title} · ${input.language} · v${input.version}`,
    title: input.title,
    language: input.language,
    version: input.version,
    name: item.name || filename,
    source: item.url,
    prompt: input.prompt,
    lyrics: input.lyrics,
    provider: custom ? 'local' : 'lyria',
    model: custom ? 'custom-audio-upload' : 'lyria-3-pro-preview',
    durationSeconds: 0,
    createdAt: input.createdAt || new Date().toISOString(),
  }
}

export function commitStoryAudioChoice(
  live: StoryAudioCapture,
  capture: StoryAudioCapture,
  item: ApiOutput | null,
  requireMp3 = false,
): { action: 'ignore' } | { action: 'clear' } | { action: 'reject' } | { action: 'apply'; item: ApiOutput } {
  if (live.projectId !== capture.projectId) return { action: 'ignore' }
  if ((live.cueId || '') !== (capture.cueId || '')) return { action: 'ignore' }
  if (!item) return { action: 'clear' }
  if (!isAudioOutput(item)) return { action: 'reject' }
  if (requireMp3 && !isCustomMp3Output(item)) return { action: 'reject' }
  return { action: 'apply', item }
}
