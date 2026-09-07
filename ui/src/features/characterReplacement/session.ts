import { create } from 'zustand'
import type { ApiOutput } from '../../api/outputs'
import type { ApiJobStatus } from '../../api/generation'

export interface ReplacementJob {
  id?: string
  status: 'submitting' | 'running' | 'completed' | 'failed' | 'cancelled'
  message?: string
  progress?: number
  error?: string
  observationInterrupted?: boolean
}

export interface ReplacementMedia { url: string; path: string }
export interface ReplacementFrame extends ReplacementMedia { time: number; width: number; height: number }
export interface ReplacementSession {
  source: ApiOutput | null
  character: ApiOutput | null
  frame: ReplacementFrame | null
  replacement: ReplacementMedia | null
  videoResult: ReplacementMedia | null
  frameTime: number
  duration: number
  width: number
  height: number
  prompt: string
  modelType: string
  quality: '480p' | '512p' | '704p'
  audio: 'source' | 'generated'
  extracting: boolean
  error: string
  imageJob: ReplacementJob | null
  videoJob: ReplacementJob | null
}

// Keep each workspace's draft and exact job results when navigating elsewhere.
// This is UI state; the existing server queue continues to own execution.
export const useReplacementSessions = create<{ sessions: Record<string, ReplacementSession> }>(() => ({ sessions: {} }))

export function newReplacementSession(prompt: string, source: ApiOutput | null = null): ReplacementSession {
  return {
    source, character: null, frame: null, replacement: null, videoResult: null,
    frameTime: 0, duration: 0, width: 0, height: 0, prompt, modelType: 'flux2_klein_9b',
    quality: '480p', audio: 'source', extracting: false, error: '', imageJob: null, videoJob: null,
  }
}

export function updateReplacementSession(workspace: string, update: (session: ReplacementSession) => ReplacementSession) {
  useReplacementSessions.setState(state => {
    const session = state.sessions[workspace]
    return session ? { sessions: { ...state.sessions, [workspace]: update(session) } } : state
  })
}

export function jobIsActive(job: ReplacementJob | null) {
  return job?.status === 'submitting' || job?.status === 'running'
}

export function replacementIsBusy(session: ReplacementSession) {
  return session.extracting || jobIsActive(session.imageJob) || jobIsActive(session.videoJob)
}

export function observedJob(status: ApiJobStatus): ReplacementJob {
  return {
    id: status.job_id,
    status: ['completed', 'failed', 'cancelled'].includes(status.status)
      ? status.status as 'completed' | 'failed' | 'cancelled' : 'running',
    message: status.message,
    progress: status.progress,
    error: status.error || undefined,
  }
}
