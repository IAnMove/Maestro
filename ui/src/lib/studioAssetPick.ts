import { useEffect, useState } from 'react'
import { fetchAssets, type AssetKind } from '../api/assets'
import { getServerMediaReference, type ApiOutput } from '../api/outputs'
import { catalogItemToOutput } from '../features/asset-picker'

const KIND_FROM_OUTPUT: Partial<Record<ApiOutput['type'], AssetKind>> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  model3d: 'model3d',
}

function fallbackMime(item: ApiOutput): string {
  if (item.type === 'audio') return 'audio/mpeg'
  if (item.type === 'video') return 'video/mp4'
  if (item.type === 'image') return 'image/png'
  return 'application/octet-stream'
}

export function studioMediaPath(item: ApiOutput): string {
  if (item.path) return item.path
  const ref = getServerMediaReference(item.url, item.name, item.workspace_id)
  return ref?.audio_path || item.name
}

export function placeholderMediaFile(item: ApiOutput): File {
  return new File([], item.name, { type: fallbackMime(item) })
}

export function applyChosenStudioMedia(
  item: ApiOutput,
  onReady: (next: { file: File; path: string; url: string; duration: number; width: number; height: number }) => void,
  signal?: AbortSignal,
): void {
  const path = studioMediaPath(item)
  const url = item.url
  const file = placeholderMediaFile(item)
  if (signal?.aborted) return
  if (item.type === 'image') {
    const image = new Image()
    image.onload = () => {
      if (!signal?.aborted) onReady({ file, path, url, duration: 0, width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      if (!signal?.aborted) onReady({ file, path, url, duration: 0, width: 0, height: 0 })
    }
    image.src = url
    return
  }
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.onloadedmetadata = () => {
    if (signal?.aborted) return
    onReady({
      file,
      path,
      url,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth,
      height: video.videoHeight,
    })
  }
  video.onerror = () => {
    if (!signal?.aborted) onReady({ file, path, url, duration: 0, width: 0, height: 0 })
  }
  video.src = url
}

export function useWorkspaceOutputs(workspace: string, mediaType?: ApiOutput['type']): ApiOutput[] {
  const [items, setItems] = useState<ApiOutput[]>([])
  useEffect(() => {
    const controller = new AbortController()
    fetchAssets({
      workspace,
      kind: mediaType ? KIND_FROM_OUTPUT[mediaType] : undefined,
      limit: 100,
      signal: controller.signal,
    })
      .then(result => {
        if (controller.signal.aborted) return
        const mapped = result.assets
          .map(asset => catalogItemToOutput(asset, workspace))
          .filter((item): item is ApiOutput => Boolean(item))
        setItems(mediaType ? mapped.filter(item => item.type === mediaType) : mapped)
      })
      .catch(() => { if (!controller.signal.aborted) setItems([]) })
    return () => controller.abort()
  }, [workspace, mediaType])
  return items
}
