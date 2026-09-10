import type { GenerateParams } from '../types'

export function viggleSubmissionOptions(params: GenerateParams, spatial: string) {
  if (params.model_type !== 'viggle_animate') return {}
  return { model_type: params.model_type, spatial_upsampling: spatial, temporal_upsampling: params.temporal_upsampling,
    wangp_processor_settings: params.wangp_processor_settings,
    viggle_audio_mode: params.viggle_audio_mode === 'generated' ? 'generated' as const : 'source' as const }
}

/** Only new options: missing fields clear values from the previously selected output. */
export function restoreWangpSettings(params: Record<string, unknown>): Partial<GenerateParams> {
  const fields = ['temporal_upsampling', 'custom_settings', 'wangp_processor_settings', 'viggle_audio_mode', 'model_switch_phase',
    'attention_sparsity', 'switch_threshold', 'denoising_strength', 'video_guide_outpainting', 'video_mask', 'video_guide2']
  return Object.fromEntries(fields.map(field => [field, params[field]]))
}

export function fetchEditingRestoreAsset(params: Record<string, unknown>, field: string, path: string,
  legacyFetch: (path: string) => Promise<Response>): Promise<Response> {
  if (params.model_type !== 'viggle_animate') return legacyFetch(path)
  const url = String(params[field] || path)
  if (!/^\/api\/v1\/(uploads|file)\//.test(url)) {
    return Promise.reject(new Error('Select the original Viggle asset again; this sidecar has no canonical media URL'))
  }
  return fetch(url)
}

export function restoredEditingTrim(params: Record<string, unknown>, duration: number) {
  const start = Number(params.edit_start_time ?? params.outpaint_trim_start ?? 0)
  const end = Number(params.edit_end_time ?? params.outpaint_trim_end ?? duration)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= end || end > duration) return {}
  return { editStartTime: start, editEndTime: end }
}
