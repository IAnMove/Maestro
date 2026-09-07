import * as api from '../../api/client'
import type { ModelDef } from '../../types'
import { useStore, getModelMode } from '../../stores/useStore'
import {
  generateImageAsset, observeImageRequest, throwIfImageObservationAborted,
} from '../../lib/imageGeneration'
import {
  generationProvenancePayload, newUserGenerationContext, type GenerationSubmissionContext,
} from '../studio/generationProvenance'

export const DEFAULT_REPLACEMENT_IMAGE_MODEL = 'flux2_klein_9b'
// These architectures explicitly support KI: a source canvas followed by identities.
const MULTI_IMAGE_ARCHITECTURES = new Set(['flux2_klein_9b', 'flux2_klein_4b', 'flux2_dev'])

export function replacementImageModels(models: ModelDef[]): ModelDef[] {
  return models.filter(model => model.supports_ref_images
    && getModelMode(model.model_type, model.family) === 'image'
    && MULTI_IMAGE_ARCHITECTURES.has(model.architecture || model.model_type))
}

function canonicalMediaURL(source: string, workspace: string): string {
  if (!source.startsWith('/api/v1/')) throw new Error('Choose a local media asset')
  const url = new URL(source, 'http://local.invalid')
  const match = /^\/api\/v1\/(uploads|file)\/(.+)$/.exec(url.pathname)
  if (!match || url.hash) throw new Error('Choose a canonical local media asset')
  const relative = decodeURIComponent(match[2])
  if (relative.startsWith('/') || relative.includes('\\') || relative.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Media must remain inside its declared location')
  }
  const query = [...url.searchParams.entries()]
  if (match[1] === 'uploads') {
    if (query.length) throw new Error('An upload URL cannot select another workspace')
  } else {
    if (query.length > 1 || query.some(([key, value]) => key !== 'workspace' || value !== workspace)) {
      throw new Error('The selected media belongs to another workspace')
    }
    url.searchParams.set('workspace', workspace)
  }
  return url.pathname + url.search
}

export interface ReplacementFrameOptions {
  sourceFrameURL: string
  characterURL: string
  prompt: string
  modelType?: string
  workspace: string
  resolution: string
  onJobSubmitted?: (jobId: string) => void
  onStatus?: (status: api.ApiJobStatus) => void
  signal?: AbortSignal
  existingJobId?: string
  submissionContext?: GenerationSubmissionContext
}

/** One ordinary image job. The returned asset belongs to that job, never a gallery match. */
export function generateReplacementFrame(options: ReplacementFrameOptions) {
  throwIfImageObservationAborted(options.signal)
  const modelType = options.modelType || DEFAULT_REPLACEMENT_IMAGE_MODEL
  if (!replacementImageModels(useStore.getState().models).some(model => model.model_type === modelType)) {
    throw new Error('Choose a verified multi-image Flux 2 editor from the model catalog')
  }
  if (!options.prompt.trim()) throw new Error('Describe the character replacement')
  if (!/^[1-9]\d*x[1-9]\d*$/.test(options.resolution)) throw new Error('The source frame dimensions are unavailable')
  const references = [options.sourceFrameURL, options.characterURL].map(url => canonicalMediaURL(url, options.workspace))
  return generateImageAsset('maestro', options.prompt, modelType, undefined, '', {
    references, canonicalReferences: true, strictReference: true, referenceMode: 'edit',
    cleanModelDefaults: true, comicPanel: false,
    workspace: options.workspace, resolution: options.resolution,
    existingJobId: options.existingJobId, onJobSubmitted: options.onJobSubmitted,
    onStatus: options.onStatus, signal: options.signal,
    submissionContext: options.submissionContext || newUserGenerationContext(),
  })
}

export interface ReplacementVideoOptions {
  videoURL: string
  editedFrameURL: string
  workspace: string
  resolutionProfile?: '480p' | '512p' | '704p'
  audioMode?: 'source' | 'generated'
  startTime?: number
  endTime?: number
  seed?: number
  submissionContext?: GenerationSubmissionContext
}

/** Frame selection time is intentionally absent: it never changes the video trim. */
export function submitReplacementVideo(options: ReplacementVideoOptions) {
  const request = {
    model_type: 'viggle_animate',
    video_path: canonicalMediaURL(options.videoURL, options.workspace),
    ref_image_path: canonicalMediaURL(options.editedFrameURL, options.workspace),
    workspace: options.workspace,
    resolution_profile: options.resolutionProfile || '480p',
    viggle_audio_mode: options.audioMode || 'source',
    start_time: options.startTime ?? 0,
    ...(options.endTime === undefined ? {} : { end_time: options.endTime }),
    seed: options.seed ?? -1,
    reference_aligned_to_source: true,
    provenance: generationProvenancePayload(options.submissionContext || newUserGenerationContext()),
  }
  return api.submitRecast(request)
}

/** Observe an already admitted job. Abort stops observation; api.cancelJob is explicit. */
export async function waitForReplacementVideo(
  jobId: string, workspace: string,
  onStatus?: (status: api.ApiJobStatus) => void, signal?: AbortSignal,
) {
  let failures = 0
  for (;;) {
    throwIfImageObservationAborted(signal)
    let status: api.ApiJobStatus
    try {
      status = await observeImageRequest(api.fetchJobStatus(jobId), signal)
      failures = 0
    } catch (error) {
      throwIfImageObservationAborted(signal)
      if (++failures >= 20) throw new Error(`Could not reconnect to job ${jobId}: ${String(error)}`)
      await observeImageRequest(new Promise(resolve => window.setTimeout(resolve, 1500)), signal)
      continue
    }
    throwIfImageObservationAborted(signal)
    onStatus?.(status)
    throwIfImageObservationAborted(signal)
    if (status.status === 'failed' || status.status === 'cancelled') {
      throw new Error(status.error || status.message || 'Character replacement did not complete')
    }
    if (status.status === 'completed') {
      const path = status.output_files.find(value => /\.(mp4|webm|mov|mkv)$/i.test(value))
      if (!path) throw new Error('Character replacement completed without a video')
      const name = path.split(/[\\/]/).pop()!
      return { name, source: api.getFileUrl(name, workspace), jobId,
        taskId: status.task_id || undefined, rootTaskId: status.root_task_id || status.task_id || undefined }
    }
    await observeImageRequest(new Promise(resolve => window.setTimeout(resolve, 1500)), signal)
  }
}
