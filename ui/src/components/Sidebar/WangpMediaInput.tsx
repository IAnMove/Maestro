import { useEffect, useState } from 'react'
import { fetchAssets } from '../../api/assets'
import type { ApiOutput } from '../../api/outputs'
import { catalogItemToOutput } from '../../features/asset-picker'
import { AssetInput } from '../../features/asset-picker/AssetInput'
import { useStore } from '../../stores/useStore'

/** Keep the canonical URL, including its upload root or workspace, as identity. */
export function WangpMediaInput({ label, kind, path, url, onChoose }: {
  label: string
  kind: 'image' | 'video' | 'audio'
  path?: string
  url?: string
  onChoose: (item: ApiOutput | null) => void
}) {
  const workspace = useStore(s => s.activeWorkspace)
  const [catalog, setCatalog] = useState<{ workspace: string; kind: string; items: ApiOutput[] } | null>(null)
  const items = catalog?.workspace === workspace && catalog.kind === kind ? catalog.items : []
  useEffect(() => {
    const controller = new AbortController()
    void fetchAssets({ workspace, limit: 100, signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setCatalog({ workspace, kind, items: result.assets.filter(asset => asset.kind === kind)
        .map(asset => catalogItemToOutput(asset, workspace)).filter((item): item is ApiOutput => item !== null) })
    }).catch(error => { if (!controller.signal.aborted) console.error('Media catalog failed', error) })
    return () => controller.abort()
  }, [workspace, kind])
  const value: ApiOutput | undefined = path ? {
    name: path.split('/').pop()?.split('?')[0] || path, type: kind, mode: null,
    size: 0, created_at: 0, url: url || path, thumbnail_url: kind === 'image' ? url || path : '',
  } : undefined
  return <AssetInput label={label} placeholder={label} items={items} value={value}
    accept={`${kind}/*`} optional constraints={{ kinds: [kind], maxCount: 1, optional: true }} onChoose={onChoose} />
}
