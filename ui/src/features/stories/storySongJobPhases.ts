import type { MiniMaxMusicJob } from '../../api/stories'
import { isPendingStoryMusicCandidate } from './storySongRecovery'
import type { StoryMusicCandidate, StoryMusicExecutionPhase } from './types'

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted'])

export function musicJobExecutionPhase(
  job: Pick<MiniMaxMusicJob, 'status' | 'phase'>,
): StoryMusicExecutionPhase {
  const status = String(job.status || '').trim()
  const phase = String(job.phase || '').trim()
  if (TERMINAL.has(status) || TERMINAL.has(phase)) return 'terminal'
  if (status === 'waiting_resource' || phase === 'waiting_resource') return 'waiting_resource'
  if (status === 'cancelling' || phase === 'cancelling') return 'cancelling'
  if (status === 'running' || phase === 'running' || phase === 'executing') return 'executing'
  if (phase === 'prepared') return 'prepared'
  return 'accepted'
}

export function patchSongCandidateJob(
  candidate: StoryMusicCandidate,
  job: MiniMaxMusicJob,
): StoryMusicCandidate {
  return {
    ...candidate,
    taskId: job.taskId || candidate.taskId,
    rootTaskId: job.rootTaskId || candidate.rootTaskId,
    executionPhase: musicJobExecutionPhase(job),
    provenance: {
      ...candidate.provenance,
      jobId: job.jobId,
      taskId: job.taskId || candidate.provenance?.taskId,
      rootTaskId: job.rootTaskId || candidate.provenance?.rootTaskId,
    },
  }
}

export function songJobIdentityChanged(
  candidate: StoryMusicCandidate,
  next: StoryMusicCandidate,
): boolean {
  return next.executionPhase !== candidate.executionPhase
    || next.provenance?.jobId !== candidate.provenance?.jobId
    || next.taskId !== candidate.taskId
    || next.rootTaskId !== candidate.rootTaskId
}

export function reusableInFlightSongCandidate(
  candidates: StoryMusicCandidate[],
): StoryMusicCandidate | undefined {
  const pending = candidates.filter(isPendingStoryMusicCandidate)
  return pending.find(item => Boolean(item.provenance?.jobId?.trim())) || pending[0]
}
