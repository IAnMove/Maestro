import type { OutputFile } from '../types'

export interface ViggleEditSession {
  workspace: string
  previousOutputs: Array<Pick<OutputFile, 'name' | 'url'>>
  /** Unix seconds when the image step began; older gallery mtimes cannot apply. */
  startedAt: number
}

/** Viggle requires a new edited image from this trip, in its original workspace. */
export function latestAnchorImage(
  outputs: OutputFile[],
  target: { anchor: string; modelType?: string; viggleEditSession?: ViggleEditSession },
  workspace: string,
  browsingUploads = false,
) {
  if (target.anchor !== 'recast' || target.modelType !== 'viggle_animate') {
    return outputs.find(output => output.type === 'image')
  }
  const session = target.viggleEditSession
  if (!session || session.workspace !== workspace || browsingUploads) return undefined
  return outputs.find(output => output.type === 'image'
    && (output.created_at || 0) >= session.startedAt
    && !session.previousOutputs.some(
      previous => previous.name === output.name || previous.url === output.url,
    ))
}

/** Keep Auto tied to the source canvas during the Viggle image-editing step. */
export function viggleEditingParameters(state: {
  generationMode: string
  resolutionPreset: string
  aspectRatio: string
  editReturnTarget: { modelType?: string; sourceResolution?: string } | null
}) {
  const resolution = state.editReturnTarget?.sourceResolution || ''
  return state.generationMode === 'image' && state.editReturnTarget?.modelType === 'viggle_animate'
    && state.resolutionPreset === 'auto' && state.aspectRatio === 'auto' && /^\d+x\d+$/.test(resolution)
    ? { resolution } : {}
}
