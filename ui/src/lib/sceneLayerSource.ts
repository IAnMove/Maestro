import type { ApiOutput } from '../api/outputs'

export type SceneLayerBindKind = 'model3d' | 'media' | 'overlay'
export type SceneLayerVisualType = 'model3d' | 'image' | 'video' | 'overlay'

export type LayerSourceCapture = {
  generation: number
  workspaceId: string
  reassignId: string | null
  kind: SceneLayerBindKind
  existingType?: SceneLayerVisualType
}

export type LayerSourceLive = {
  generation: number
  workspaceId: string
  recording: boolean
  publishing: boolean
  saving: boolean
  layerExists: (id: string) => boolean
  layerType: (id: string) => SceneLayerVisualType | undefined
}

export type LayerSourceCommit =
  | { action: 'ignore' }
  | {
    action: 'add'
    type: SceneLayerVisualType
    source: string
    name: string
    thumbnail?: string
  }
  | {
    action: 'reassign'
    layerId: string
    type: SceneLayerVisualType
    source: string
    name: string
    thumbnail?: string
  }

export function isTransientLayerSource(url: string): boolean {
  return url.startsWith('blob:') || url.startsWith('filesystem:') || url.startsWith('data:')
}

export function isOverlayFilename(name: string): boolean {
  return /\.(png|webp)$/i.test(name)
}

export function explorerPurposeForBindKind(kind: SceneLayerBindKind): 'layer-model' | 'layer-media' | 'layer-overlay' {
  if (kind === 'model3d') return 'layer-model'
  if (kind === 'overlay') return 'layer-overlay'
  return 'layer-media'
}

export function bindKindFromLayerType(type: string): SceneLayerBindKind | null {
  if (type === 'model3d') return 'model3d'
  if (type === 'overlay') return 'overlay'
  if (type === 'image' || type === 'video') return 'media'
  return null
}

export function localFileMatchesKind(kind: SceneLayerBindKind, file: File): boolean {
  if (kind === 'model3d') return /\.glb$/i.test(file.name) || file.type === 'model/gltf-binary'
  if (kind === 'overlay') return file.type === 'image/png' || file.type === 'image/webp' || isOverlayFilename(file.name)
  return file.type.startsWith('image/') || file.type.startsWith('video/') || /\.(png|jpe?g|webp|gif|mp4|webm|mov|mkv)$/i.test(file.name)
}

export function resolveBoundLayerType(
  kind: SceneLayerBindKind,
  item: ApiOutput,
  existingType?: SceneLayerVisualType,
): SceneLayerVisualType | null {
  if (kind === 'model3d') {
    if (item.type !== 'model3d' || !/\.glb$/i.test(item.name)) return null
    if (existingType && existingType !== 'model3d') return null
    return 'model3d'
  }
  if (kind === 'overlay') {
    if (item.type !== 'image' || !isOverlayFilename(item.name)) return null
    if (existingType && existingType !== 'overlay') return null
    return 'overlay'
  }
  const resolved: SceneLayerVisualType | null = item.type === 'video' ? 'video' : item.type === 'image' ? 'image' : null
  if (!resolved) return null
  if (existingType && existingType !== resolved) return null
  return resolved
}

export function outputFromLocalUpload(
  file: File,
  uploaded: { filename: string; url: string },
  kind: SceneLayerBindKind,
): ApiOutput {
  const type: ApiOutput['type'] = kind === 'model3d' || /\.glb$/i.test(file.name)
    ? 'model3d'
    : file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name)
      ? 'video'
      : 'image'
  return {
    name: uploaded.filename,
    type,
    mode: null,
    size: file.size,
    created_at: Date.now() / 1000,
    url: uploaded.url,
    thumbnail_url: type === 'image' ? uploaded.url : '',
  }
}

export function commitLayerSourceChoice(
  live: LayerSourceLive,
  capture: LayerSourceCapture,
  item: ApiOutput | null,
): LayerSourceCommit {
  if (live.recording || live.publishing || live.saving) return { action: 'ignore' }
  if (live.generation !== capture.generation) return { action: 'ignore' }
  if (live.workspaceId !== capture.workspaceId) return { action: 'ignore' }
  if (!item) return { action: 'ignore' }
  if (!item.url || !item.name || isTransientLayerSource(item.url)) return { action: 'ignore' }
  const existingType = capture.reassignId
    ? (live.layerType(capture.reassignId) ?? capture.existingType)
    : undefined
  const type = resolveBoundLayerType(capture.kind, item, existingType)
  if (!type) return { action: 'ignore' }
  const thumb = typeof item.thumbnail_url === 'string' ? item.thumbnail_url : ''
  const thumbnail = thumb && !isTransientLayerSource(thumb)
    ? thumb
    : type === 'image' || type === 'overlay'
      ? item.url
      : undefined
  const payload = { type, source: item.url, name: item.name, thumbnail }
  if (capture.reassignId) {
    if (!live.layerExists(capture.reassignId)) return { action: 'ignore' }
    const currentType = live.layerType(capture.reassignId)
    if (currentType && currentType !== type) return { action: 'ignore' }
    return { action: 'reassign', layerId: capture.reassignId, ...payload }
  }
  return { action: 'add', ...payload }
}
