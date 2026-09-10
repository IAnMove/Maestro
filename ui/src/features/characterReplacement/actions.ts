import { cancelJob } from '../../api/generation'
import { inspectViggleFrame, viggleFrameProblem } from '../../lib/viggleFrame'
import { generateReplacementFrame, submitReplacementVideo, waitForReplacementVideo } from './generation'
import {
  useReplacementSessions, updateReplacementSession, replacementIsBusy, observedJob,
  type ReplacementJob, type ReplacementSession,
} from './session'

type JobKey = 'imageJob' | 'videoJob'
const activeRuns = new Set<string>()
const read = (workspace: string) => useReplacementSessions.getState().sessions[workspace]
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

function jobUpdate(workspace: string, key: JobKey, job: ReplacementJob) {
  updateReplacementSession(workspace, session => ({ ...session, [key]: job }))
}

/** Resolve the chosen timestamp separately from the video's generation range. */
export async function captureReplacementFrame(workspace: string, requestedTime: number) {
  const session = read(workspace)
  if (!session?.source || replacementIsBusy(session) || !session.duration) return
  const time = Math.max(0, Math.min(requestedTime, session.duration - 0.04))
  if (!Number.isFinite(time)) return
  updateReplacementSession(workspace, current => ({ ...current, extracting: true, error: '' }))
  try {
    const response = await fetch('/api/v1/extract-frames', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_path: session.source.url, start_time: time, wangp_media: true, workspace }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.detail || 'Frame extraction failed')
    if (!result.start_url || !result.start_path) throw new Error('The extracted frame is missing')
    updateReplacementSession(workspace, current => ({
      ...current,
      frame: { url: result.start_url, path: result.start_path, time, width: session.width, height: session.height },
      replacement: null, videoResult: null, imageJob: null, videoJob: null,
    }))
  } catch (error) {
    updateReplacementSession(workspace, current => ({ ...current, error: message(error) }))
  } finally {
    updateReplacementSession(workspace, current => ({ ...current, extracting: false }))
  }
}

function beginJob(workspace: string, key: JobKey) {
  const session = read(workspace)
  const runKey = `${workspace}:${key}`
  if (!session || replacementIsBusy(session) || activeRuns.has(runKey)) return null
  const previous = session[key]
  // Reconnect to a known interrupted job. Failed/cancelled jobs require a fresh user click.
  const existingJobId = previous?.observationInterrupted ? previous.id : undefined
  activeRuns.add(runKey)
  jobUpdate(workspace, key, { id: existingJobId, status: existingJobId ? 'running' : 'submitting' })
  return { session, existingJobId, runKey }
}

function failJob(workspace: string, key: JobKey, error: unknown) {
  const current = read(workspace)?.[key]
  // A terminal status received from the job remains authoritative.
  const terminal = current?.status === 'failed' || current?.status === 'cancelled'
  jobUpdate(workspace, key, {
    ...current, status: terminal ? current.status : 'failed', error: message(error),
    observationInterrupted: !terminal && !!current?.id,
  })
}

export async function generateReplacementImage(workspace: string) {
  const original = read(workspace)
  if (!original?.frame || !original.character || !original.prompt.trim()) return
  const run = beginJob(workspace, 'imageJob')
  if (!run) return
  const { session, existingJobId, runKey } = run
  try {
    const asset = await generateReplacementFrame({
      sourceFrameURL: session.frame!.url, characterURL: session.character!.url,
      prompt: session.prompt, modelType: session.modelType, workspace,
      resolution: `${session.frame!.width}x${session.frame!.height}`, existingJobId,
      onJobSubmitted: id => jobUpdate(workspace, 'imageJob', { id, status: 'running' }),
      onStatus: status => jobUpdate(workspace, 'imageJob', observedJob(status)),
    })
    updateReplacementSession(workspace, current => ({
      ...current, replacement: { url: asset.source, path: asset.source }, videoResult: null, videoJob: null,
      imageJob: { ...current.imageJob, status: 'completed', progress: 100 },
    }))
  } catch (error) { failJob(workspace, 'imageJob', error) }
  finally { activeRuns.delete(runKey) }
}

export async function generateReplacementVideo(workspace: string, aspectError: (dimensions: Awaited<ReturnType<typeof inspectViggleFrame>>) => string) {
  const original = read(workspace)
  if (!original?.source || !original.replacement) return
  const run = beginJob(workspace, 'videoJob')
  if (!run) return
  const { session, existingJobId, runKey } = run
  try {
    const dimensions = await inspectViggleFrame(session.source!.url, session.replacement!.url)
    if (viggleFrameProblem(dimensions)) throw new Error(aspectError(dimensions))
    let jobId = existingJobId
    if (!jobId) {
      const submitted = await submitReplacementVideo({
        videoURL: session.source!.url, editedFrameURL: session.replacement!.url, workspace,
        resolutionProfile: session.quality, audioMode: session.audio,
        startTime: 0, endTime: session.duration,
      })
      jobId = submitted.job_id
      jobUpdate(workspace, 'videoJob', { id: jobId, status: 'running' })
    }
    const result = await waitForReplacementVideo(jobId, workspace, status => jobUpdate(workspace, 'videoJob', observedJob(status)))
    updateReplacementSession(workspace, current => ({
      ...current, videoResult: { url: result.source, path: result.source },
      videoJob: { ...current.videoJob, status: 'completed', progress: 100 },
    }))
  } catch (error) { failJob(workspace, 'videoJob', error) }
  finally { activeRuns.delete(runKey) }
}

export async function cancelReplacementJob(workspace: string, key: JobKey) {
  const job = read(workspace)?.[key]
  if (!job?.id) return
  try { await cancelJob(job.id) }
  catch (error) { updateReplacementSession(workspace, current => ({ ...current, error: message(error) })) }
}

/** Invalidate only dependent results; edits never mutate another Studio's inputs. */
export function editReplacementSession(workspace: string, patch: Partial<ReplacementSession>, invalidate: 'source' | 'image' | 'video' | 'none' = 'none') {
  updateReplacementSession(workspace, session => {
    if (replacementIsBusy(session)) return session
    const next = { ...session, ...patch, error: '' }
    if (invalidate === 'source') Object.assign(next, { frame: null, duration: 0, width: 0, height: 0, frameTime: 0 })
    if (invalidate === 'source' || invalidate === 'image') Object.assign(next, { replacement: null, imageJob: null })
    if (invalidate !== 'none') Object.assign(next, { videoResult: null, videoJob: null })
    return next
  })
}
