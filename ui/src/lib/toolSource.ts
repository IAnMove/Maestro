import type { AssetCatalogItem } from '../api/assets'
import type { ApiOutput } from '../api/outputs'
import { matchCatalogByOutput } from '../features/asset-picker/adapters.ts'

type ToolKind = 'image' | 'video' | 'audio'

export function resolveToolSource(
  item: ApiOutput,
  catalogAssets: readonly AssetCatalogItem[],
  activeWorkspace: string,
) {
  const catalog = matchCatalogByOutput(catalogAssets, item, activeWorkspace)
  const location = catalog?.locations.find(entry => entry.workspace_id === activeWorkspace) ?? catalog?.locations[0]
  const kind: ToolKind = item.type === 'video' ? 'video' : item.type === 'audio' ? 'audio' : 'image'
  const assetId = catalog?.id ?? item.asset_id ?? null
  return {
    path: location?.filename || item.name,
    name: catalog?.filename || item.name,
    url: item.url,
    assetId,
    workspace: location?.workspace_id ?? (assetId ? (item.workspace_id || activeWorkspace) : '__uploads__'),
    kind,
  }
}
