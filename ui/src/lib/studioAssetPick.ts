import { useEffect, useState } from 'react'
import { fetchAssets, type AssetKind } from '../api/assets'
import type { ApiOutput } from '../api/outputs'
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

export async function fileFromOutput(item: ApiOutput): Promise<File> {
  const response = await fetch(item.url)
  if (!response.ok) throw new Error('Could not read the selected media')
  const blob = await response.blob()
  return new File([blob], item.name, { type: blob.type || fallbackMime(item) })
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
