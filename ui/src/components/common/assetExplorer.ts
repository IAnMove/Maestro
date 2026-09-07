import type { ApiOutput } from '../../api/outputs'

export type AssetExplorerPurpose =
  | 'layer-model'
  | 'layer-media'
  | 'narrative-hero'
  | 'narrative-plate'
  | 'narrative-prop'
  | 'narrative-foreground'
  | 'scene-audio'

export type ExplorerChoiceHandlers = {
  addLayer: (type: 'model3d' | 'video' | 'image', url: string, name: string, thumbnail?: string) => void
  setHero: (name: string) => void
  setPlate: (name: string) => void
  setProp: (name: string) => void
  setForeground: (name: string) => void
  attachAudio: (filename: string, title: string, kind: 'audio') => void
}

export function formatAssetDate(item: ApiOutput, locale?: string) {
  const stamp = item.completed_at || item.created_at
  if (!Number.isFinite(stamp) || stamp <= 0) return ''
  return new Date(stamp * 1000).toLocaleString(locale)
}

export function assetPreviewUrl(item: ApiOutput) {
  if (item.thumbnail_url) return item.thumbnail_url
  if (item.type === 'image') return item.url
  return ''
}

export function assetsForExplorer(
  purpose: AssetExplorerPurpose,
  models: ApiOutput[],
  media: ApiOutput[],
  visuals: ApiOutput[],
  audio: ApiOutput[],
): ApiOutput[] {
  if (purpose === 'layer-model') return models
  if (purpose === 'layer-media' || purpose === 'narrative-plate' || purpose === 'narrative-foreground') return media
  if (purpose === 'scene-audio') return audio
  return visuals
}

export function explorerTitleKey(
  purpose: AssetExplorerPurpose,
): 'animator.generatedModels' | 'animator.generatedMedia' | 'animator.chooseAudio' | 'animator.chooseAsset' {
  if (purpose === 'layer-model') return 'animator.generatedModels'
  if (purpose === 'layer-media') return 'animator.generatedMedia'
  if (purpose === 'scene-audio') return 'animator.chooseAudio'
  return 'animator.chooseAsset'
}

export function explorerSelectedName(
  purpose: AssetExplorerPurpose,
  names: { hero: string; plate: string; prop: string; foreground: string },
): string | undefined {
  if (purpose === 'narrative-hero') return names.hero
  if (purpose === 'narrative-plate') return names.plate
  if (purpose === 'narrative-prop') return names.prop
  if (purpose === 'narrative-foreground') return names.foreground
  return undefined
}

export function explorerAllowsNone(purpose: AssetExplorerPurpose): boolean {
  return purpose.startsWith('narrative-')
}

export function applyExplorerChoice(
  purpose: AssetExplorerPurpose,
  item: ApiOutput | null,
  handlers: ExplorerChoiceHandlers,
): void {
  if (purpose === 'layer-model' && item) {
    handlers.addLayer('model3d', item.url, item.name, item.thumbnail_url ?? undefined)
    return
  }
  if (purpose === 'layer-media' && item) {
    handlers.addLayer(item.type === 'video' ? 'video' : 'image', item.url, item.name, item.thumbnail_url ?? undefined)
    return
  }
  if (purpose === 'narrative-hero') { handlers.setHero(item?.name ?? ''); return }
  if (purpose === 'narrative-plate') { handlers.setPlate(item?.name ?? ''); return }
  if (purpose === 'narrative-prop') { handlers.setProp(item?.name ?? ''); return }
  if (purpose === 'narrative-foreground') { handlers.setForeground(item?.name ?? ''); return }
  if (purpose === 'scene-audio' && item) {
    handlers.attachAudio(item.name, item.name.replace(/\.[^.]+$/, ''), 'audio')
  }
}
