import { isLiveStatus, type ActivityTaskLike } from './lineage'

export const PHASE_KEYS: Record<string, string> = {
  planning: 'planning',
  known_series_research: 'knownSeriesResearch',
  canon: 'canon',
  outline: 'outline',
  script: 'script',
  shots: 'shots',
  canon_validation: 'canonValidation',
  canon_delta: 'canonDelta',
  rendering: 'rendering',
  generating_images: 'generatingImages',
  generating_video: 'generatingVideo',
  post_processing: 'postProcessing',
  waiting_resource: 'waitingResource',
  cancelling: 'cancelling',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  interrupted: 'interrupted',
}

function epochMs(value?: number | null): number | undefined {
  if (!value || !Number.isFinite(value)) return undefined
  return value < 1_000_000_000_000 ? value * 1000 : value
}

export function elapsedSeconds(task: ActivityTaskLike, now: number): number | undefined {
  const start = epochMs(task.started_at || task.queued_at || task.created_at)
  if (!start) return undefined
  const end = isLiveStatus(task.status)
    ? now
    : epochMs(task.completed_at || task.updated_at) || now
  return Math.max(0, (end - start) / 1000)
}

export function formatElapsed(task: ActivityTaskLike, now: number): string {
  const total = elapsedSeconds(task, now)
  if (total === undefined) return ''
  const seconds = Math.floor(total)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`
    : `${minutes}:${remainder.toString().padStart(2, '0')}`
}

export function estimatedRemainingSeconds(task: ActivityTaskLike, now: number): number | undefined {
  if (!isLiveStatus(task.status)) return undefined
  const elapsed = elapsedSeconds(task, now)
  const total = Number(task.total || 0)
  const current = Number(task.current || 0)
  const fraction = total > 0
    ? Math.max(0, Math.min(1, current / total))
    : Math.max(0, Math.min(1, Number(task.progress || 0)))
  if (!elapsed || elapsed < 3 || fraction < 0.01 || fraction >= 1) return undefined
  return Math.max(1, Math.round(elapsed * ((1 - fraction) / fraction)))
}

export function formatEta(seconds: number | undefined): string {
  if (seconds === undefined) return ''
  const rounded = Math.max(1, Math.round(seconds))
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const remainder = rounded % 60
  if (hours) return `~${hours}h ${minutes.toString().padStart(2, '0')}m`
  if (minutes) return `~${minutes}m ${remainder.toString().padStart(2, '0')}s`
  return `~${remainder}s`
}

export function fallbackPhaseLabel(task: ActivityTaskLike): string {
  return task.phase?.replaceAll('_', ' ') || task.status
}

export function resourceSummary(task: ActivityTaskLike): { kind: 'using' | 'waiting' | 'required'; value: string } | '' {
  const acquired = task.acquired_resources || []
  const required = task.resource_requirements || []
  if (acquired.length) return { kind: 'using', value: acquired.join(' · ') }
  if (task.status === 'waiting_resource' && required.length) return { kind: 'waiting', value: required.join(' · ') }
  return required.length ? { kind: 'required', value: required.join(' · ') } : ''
}

export function generationRecipe(task: ActivityTaskLike): string {
  const metadata = task.metadata || {}
  const details = (metadata.generation_details || metadata.settings || {}) as Record<string, unknown>
  const parts = [task.provider, task.model].filter(Boolean) as string[]
  const addModel = (label: string, value: unknown) => {
    if (!value) return
    const model = String(value)
    if (!parts.some(part => part === model || part.endsWith(` ${model}`))) {
      parts.push(label ? `${label} ${model}` : model)
    }
  }
  addModel('', details.model_name || details.model_type)
  addModel('text', details.text_model)
  addModel('image', details.image_model_name || details.image_model_type)
  addModel('video', details.video_model_name || details.video_model_type)
  const resolution = details.video_resolution || details.image_resolution || details.resolution
  const seed = details.seed
  const steps = details.video_steps || details.image_steps || details.steps || details.numInferenceSteps
  if (details.simulated === true || details.execution_mode === 'simulate') parts.push('SIMULATED')
  if (resolution) parts.push(String(resolution))
  if (seed !== undefined) parts.push(`seed ${seed}`)
  if (steps !== undefined) parts.push(`${steps} steps`)
  if (details.guidance !== undefined) parts.push(`guidance ${details.guidance}`)
  if (details.frames !== undefined) parts.push(`${details.frames} frames`)
  if (details.duration_seconds !== undefined) parts.push(`${details.duration_seconds}s`)
  if (details.dialogue_syllables !== undefined) {
    parts.push(
      `dialogue ${details.dialogue_syllables} syllables × ${details.dialogue_seconds_per_syllable}s → ${details.dialogue_duration_calculated}s calculated`
      + (details.dialogue_duration_minimum_limited ? ' · H3 minimum applied' : ''),
    )
  } else if (details.dialogue_words !== undefined) {
    parts.push(
      `dialogue ${details.dialogue_words} words → ${details.dialogue_duration_calculated}s calculated`
      + (details.dialogue_duration_minimum_limited ? ' · H3 minimum applied' : ''),
    )
  }
  if (details.profile) parts.push(`profile ${details.profile}`)
  if (details.flow_shift !== undefined || details.flowShift !== undefined) {
    parts.push(`flow shift ${details.flow_shift ?? details.flowShift}`)
  }
  if (details.audio_shift !== undefined || details.audioShift !== undefined) {
    parts.push(`audio shift ${details.audio_shift ?? details.audioShift}`)
  }
  if (details.turbo !== undefined) parts.push(`Turbo ${details.turbo ? 'on' : 'off'}`)
  if (details.cache !== undefined) {
    parts.push(details.cache
      ? `Cache on${details.cache_type ? ` (${details.cache_type})` : ''}`
      : 'Cache off')
  }
  if (details.lora_count !== undefined) {
    const loras = Array.isArray(details.loras) ? details.loras.map(String).filter(Boolean) : []
    parts.push(details.lora_count
      ? `${details.lora_count} LoRA${Number(details.lora_count) === 1 ? '' : 's'}${loras.length ? ` (${loras.join(', ')})` : ''}`
      : 'LoRAs off')
  }
  if (details.clip_count !== undefined) parts.push(`${details.clip_count} clips`)
  return parts.join(' · ')
}

export function generationPrompt(task: ActivityTaskLike): string {
  const metadata = task.metadata || {}
  const details = (metadata.generation_details || metadata.settings || {}) as Record<string, unknown>
  const value = details.prompt ?? metadata.prompt ?? metadata.prompt_preview
  return typeof value === 'string' ? value.trim() : ''
}

export function generationInitiator(task: ActivityTaskLike): string {
  const metadata = task.metadata || {}
  const details = (metadata.generation_details || metadata.settings || {}) as Record<string, unknown>
  const explicit = details.initiator ?? metadata.initiator
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim()
  const mode = String(details.generation_mode || task.kind || '').replaceAll('_', ' ')
  if (task.parent_id?.startsWith('task-series-') || (task.workflow || '').startsWith('series')) return 'Series Lab · Chapter'
  if (task.parent_id?.startsWith('task-director-') || task.workflow === 'director') {
    return `Director${mode ? ` · ${mode === 'music video' ? 'Music video' : mode}` : ''}`
  }
  if (task.workflow === 'audio-analysis') return 'Story/Director · Audio analysis'
  if (task.workflow === 'generation') {
    const room = mode === 'model3d' ? '3D' : mode ? mode[0].toUpperCase() + mode.slice(1) : 'Generation'
    return `Studio · ${room}`
  }
  return task.workflow ? task.workflow.replaceAll('_', ' ') : ''
}

export function truncatePrompt(prompt: string, limit = 180): string {
  const oneLine = prompt.replace(/\s+/g, ' ').trim()
  return oneLine.length > limit ? `${oneLine.slice(0, limit - 1)}…` : oneLine
}
