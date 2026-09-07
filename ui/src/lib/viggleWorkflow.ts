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
