import type { ApiOutput } from '../api/outputs'
import { uploadLocalAsset } from '../features/asset-picker/upload.ts'
import {
  commitLayerSourceChoice,
  localFileMatchesKind,
  outputFromLocalUpload,
  type LayerSourceCapture,
  type LayerSourceLive,
  type SceneLayerBindKind,
  type SceneLayerVisualType,
} from './sceneLayerSource.ts'

export function visualLayerTypeOf(type: string): SceneLayerVisualType | undefined {
  return type === 'model3d' || type === 'image' || type === 'video' || type === 'overlay' ? type : undefined
}

export function makeLiveLayerSource(input: {
  generation: number
  workspaceId: string
  recording: boolean
  publishing: boolean
  saving: boolean
  layers: ReadonlyArray<{ id: string; type: string }>
}): LayerSourceLive {
  return {
    generation: input.generation,
    workspaceId: input.workspaceId,
    recording: input.recording,
    publishing: input.publishing,
    saving: input.saving,
    layerExists: id => input.layers.some(layer => layer.id === id),
    layerType: id => visualLayerTypeOf(input.layers.find(layer => layer.id === id)?.type ?? ''),
  }
}

export function captureLayerBind(
  live: Pick<LayerSourceLive, 'generation' | 'workspaceId' | 'layerType'>,
  kind: SceneLayerBindKind,
  reassignLayerId: string | null,
): LayerSourceCapture {
  return {
    generation: live.generation,
    workspaceId: live.workspaceId,
    reassignId: reassignLayerId,
    kind,
    existingType: reassignLayerId ? live.layerType(reassignLayerId) : undefined,
  }
}

export type LayerBindSink = {
  addLayer: (type: SceneLayerVisualType, source: string, name: string, thumbnail?: string) => void
  reassignLayer: (layerId: string, source: string, name: string, thumbnail?: string) => void
}

export function applyLayerSourceCommit(
  live: LayerSourceLive,
  capture: LayerSourceCapture,
  item: ApiOutput | null,
  sink: LayerBindSink,
): void {
  const commit = commitLayerSourceChoice(live, capture, item)
  if (commit.action === 'add') sink.addLayer(commit.type, commit.source, commit.name, commit.thumbnail)
  else if (commit.action === 'reassign') sink.reassignLayer(commit.layerId, commit.source, commit.name, commit.thumbnail)
}

export async function bindLocalLayerFiles(
  getLive: () => LayerSourceLive,
  pending: LayerSourceCapture | null,
  kind: SceneLayerBindKind,
  files: File[],
  sink: LayerBindSink,
  onError: (message: string) => void,
  upload: (file: File) => Promise<{ filename: string; url: string }> = uploadLocalAsset,
): Promise<LayerSourceCapture | null> {
  const capture = pending?.kind === kind ? pending : captureLayerBind(getLive(), kind, pending?.reassignId ?? null)
  const selected = capture.reassignId ? files.slice(0, 1) : files
  for (const file of selected) {
    if (!localFileMatchesKind(kind, file)) continue
    try {
      const uploaded = await upload(file)
      // Re-read generation / workspace / busy / layers after the await so a
      // scene import, workspace switch, or record/save started mid-upload
      // cannot commit into the wrong document.
      applyLayerSourceCommit(getLive(), capture, outputFromLocalUpload(file, uploaded, kind), sink)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return capture
      onError(error instanceof Error ? error.message : 'Upload failed')
      return capture
    }
  }
  return null
}

export function catalogLayerOutput(
  type: 'model3d' | 'video' | 'image' | 'overlay',
  url: string,
  name: string,
  thumbnail?: string,
): ApiOutput {
  return {
    name,
    type: type === 'overlay' ? 'image' : type,
    mode: null,
    size: 0,
    created_at: 0,
    url,
    thumbnail_url: thumbnail ?? '',
  }
}

export function bindKindFromCatalogType(type: 'model3d' | 'video' | 'image' | 'overlay'): SceneLayerBindKind {
  return type === 'overlay' ? 'overlay' : type === 'model3d' ? 'model3d' : 'media'
}
