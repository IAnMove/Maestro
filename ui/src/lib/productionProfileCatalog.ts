import type { LlmModelOption, ModelDef } from '../types'

export type CatalogOption = { id: string; label: string }

export function keepCurrentOption(options: CatalogOption[], current: string): CatalogOption[] {
  if (current && !options.some(option => option.id === current)) {
    return [{ id: current, label: current }, ...options]
  }
  return options
}

export function textModelOptions(
  llmModels: LlmModelOption[],
  provider: string,
  current: string,
): CatalogOption[] {
  const filtered = llmModels
    .filter(model => {
      const modelProvider = model.provider || 'local'
      if (provider === 'local') return modelProvider === 'local'
      return modelProvider === provider
    })
    .map(model => ({ id: model.id, label: model.label }))
  return keepCurrentOption(filtered, current)
}

export const MINIMAX_IMAGE_MODELS: CatalogOption[] = [
  { id: 'image-01', label: 'image-01' },
]

export const MINIMAX_MUSIC_MODELS: CatalogOption[] = [
  { id: 'music-3.0', label: 'Music 3.0' },
  { id: 'music-2.6', label: 'Music 2.6' },
]

export const HUNYUAN3D_PROFILE_MODELS: CatalogOption[] = [
  'hunyuan3d-2mini-turbo',
  'hunyuan3d-2mini-fast',
  'hunyuan3d-2mini',
  'hunyuan3d-2-turbo',
  'hunyuan3d-2-fast',
  'hunyuan3d-2',
  'hunyuan3d-2mv-turbo',
  'hunyuan3d-2mv-fast',
  'hunyuan3d-2mv',
  'hunyuan3d-2.1',
].map(id => ({ id, label: id }))

export function downloadedModelOptions(models: ModelDef[], familyIds: string[]): CatalogOption[] {
  return models
    .filter(model => familyIds.includes(model.family) && !model.tool_only && model.is_downloaded !== false)
    .map(model => ({ id: model.model_type, label: model.name || model.model_type }))
}
