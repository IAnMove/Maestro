import type { ApiOutput } from '../../api/outputs'
import type { AssetCatalogItem, AssetKind } from '../../api/assets'
import { displayAssetTitle, knownCreatedAt } from './titles.ts'
import type { AssetConstraints, AssetRef, Compatibility, LegacyOutputRef, PickerItem } from './types.ts'

const OUTPUT_KIND: Record<ApiOutput['type'], AssetKind> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  model3d: 'model3d',
  scene: 'scene',
  comic: 'document',
}

export function catalogLocation(item: AssetCatalogItem, workspaceId: string) {
  return item.locations.find(entry => entry.workspace_id === workspaceId)
}

export function catalogItemToPickerItem(
  item: AssetCatalogItem,
  workspaceId: string,
  options?: { strict?: boolean },
): PickerItem {
  const location = catalogLocation(item, workspaceId) ?? (options?.strict ? undefined : item.locations[0])
  if (options?.strict && !location) {
    const error = new Error('Asset location not found')
    ;(error as Error & { status: number }).status = 409
    throw error
  }
  const filename = location?.filename || item.filename
  const createdAt = knownCreatedAt(item.created_at)
  const ref: AssetRef = {
    version: 1,
    scheme: 'catalog',
    id: item.id,
    workspaceId: location?.workspace_id || workspaceId,
    filename,
  }
  return {
    ref,
    kind: item.kind,
    filename,
    title: displayAssetTitle(item.kind, createdAt),
    createdAt,
    sizeBytes: item.size_bytes,
    url: location?.url || item.url,
    thumbnailUrl: item.kind === 'image' ? (location?.url || item.url) : '',
  }
}

const OUTPUT_TYPE: Partial<Record<AssetKind, ApiOutput['type']>> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  model3d: 'model3d',
  scene: 'scene',
  document: 'comic',
}

export function catalogItemToOutput(item: AssetCatalogItem, workspaceId: string): ApiOutput | null {
  const type = OUTPUT_TYPE[item.kind]
  if (!type) return null
  const location = catalogLocation(item, workspaceId) ?? item.locations[0]
  if (!location) return null
  return {
    name: location.filename || item.filename,
    type,
    mode: null,
    size: item.size_bytes,
    created_at: item.created_at,
    completed_at: item.completed_at,
    url: location.url || item.url,
    thumbnail_url: item.kind === 'image' ? (location.url || item.url) : '',
  }
}

export function matchCatalogByOutput(
  items: readonly AssetCatalogItem[],
  output: ApiOutput,
  workspaceId: string,
): AssetCatalogItem | undefined {
  return items.find(item => {
    const mapped = catalogItemToOutput(item, workspaceId)
    return mapped?.name === output.name && mapped.url === output.url
  })
}

export function outputToPickerItem(item: ApiOutput, workspaceId: string): PickerItem {
  const kind = OUTPUT_KIND[item.type]
  const createdAt = knownCreatedAt(item.created_at)
  const ref: LegacyOutputRef = {
    version: 1,
    scheme: 'legacy-output',
    workspaceId,
    filename: item.name,
    outputType: item.type,
  }
  return {
    ref,
    kind,
    filename: item.name,
    title: displayAssetTitle(kind, createdAt),
    createdAt,
    sizeBytes: item.size,
    url: item.url,
    thumbnailUrl: item.thumbnail_url || (item.type === 'image' ? item.url : ''),
  }
}

export function checkCompatibility(item: PickerItem, constraints: AssetConstraints, alreadyChosen: number): Compatibility {
  if (!constraints.kinds.includes(item.kind)) return { allowed: false, reasonKey: 'picker.incompatibleKind' }
  if (alreadyChosen >= constraints.maxCount) return { allowed: false, reasonKey: 'picker.tooMany' }
  return { allowed: true }
}

export function resolveCatalogMatch(items: AssetCatalogItem[], ref: AssetRef): AssetCatalogItem | undefined {
  if (ref.scheme === 'catalog') {
    return items.find(item => item.id === ref.id)
  }
  return items.find(item => item.locations.some(location => (
    location.workspace_id === ref.workspaceId && location.filename === ref.filename
  )))
}
