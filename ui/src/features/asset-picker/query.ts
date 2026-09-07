import { fetchAsset, fetchAssets, type AssetCatalogItem, type AssetKind } from '../../api/assets'
import { catalogItemToPickerItem, resolveCatalogMatch } from './adapters.ts'
import { ASSET_PICKER_PAGE_SIZE, type AssetRef, type CatalogSort, type PickerItem } from './types.ts'

export type CatalogQueryInput = {
  search?: string
  kinds?: readonly AssetKind[]
  workspace?: string
  sort?: CatalogSort
  limit?: number
  offset?: number
  signal?: AbortSignal
}

export type CatalogQueryResult = {
  items: PickerItem[]
  total: number
}

function kindParam(kinds: readonly AssetKind[] | undefined): AssetKind | undefined {
  if (!kinds?.length) return undefined
  if (kinds.length === 1) return kinds[0]
  return kinds.join(',') as AssetKind
}

export async function queryAssetCatalog(input: CatalogQueryInput = {}): Promise<CatalogQueryResult> {
  const workspace = input.workspace || ''
  const page = await fetchAssets({
    search: input.search,
    kind: kindParam(input.kinds),
    workspace: input.workspace,
    sort: input.sort ?? 'created_desc',
    limit: input.limit ?? ASSET_PICKER_PAGE_SIZE,
    offset: input.offset ?? 0,
    signal: input.signal,
  })
  const items = page.assets.flatMap(item => {
    try {
      return [catalogItemToPickerItem(item, workspace || item.workspace_ids[0] || '', { strict: Boolean(workspace) })]
    } catch {
      return []
    }
  })
  return { items, total: page.total }
}

function notFound(): Error {
  const error = new Error('Asset not found')
  ;(error as Error & { status: number }).status = 404
  return error
}

function requireLocation(item: AssetCatalogItem, ref: AssetRef): AssetCatalogItem {
  const found = item.locations.some(location => (
    location.workspace_id === ref.workspaceId && location.filename === ref.filename
  ))
  if (!found) {
    const error = new Error('Asset location not found')
    ;(error as Error & { status: number }).status = 409
    throw error
  }
  return item
}

const RESOLVE_PAGE = 50

async function resolveLegacyRef(ref: AssetRef, signal?: AbortSignal): Promise<AssetCatalogItem> {
  let offset = 0
  for (;;) {
    const page = await fetchAssets({
      workspace: ref.workspaceId,
      limit: RESOLVE_PAGE,
      offset,
      signal,
    })
    const match = resolveCatalogMatch(page.assets, ref)
    if (match) return requireLocation(match, ref)
    offset += page.assets.length
    if (!page.assets.length || offset >= page.total) break
  }
  throw notFound()
}

export async function resolveAssetRef(ref: AssetRef, signal?: AbortSignal): Promise<AssetCatalogItem> {
  if (ref.scheme === 'catalog') {
    try {
      const item = await fetchAsset(ref.id, signal)
      return requireLocation(item, ref)
    } catch (error) {
      if (error instanceof Error && (error.message === 'Asset not found' || error.message === 'Asset location not found')) {
        throw error.message === 'Asset location not found' ? error : notFound()
      }
      throw error
    }
  }
  return resolveLegacyRef(ref, signal)
}

export function createCatalogQuerySession() {
  let sequence = 0
  let controller: AbortController | null = null
  const cancel = () => {
    sequence += 1
    controller?.abort()
    controller = null
  }
  return {
    get requestId() { return sequence },
    cancel,
    dispose: cancel,
    async run(input: CatalogQueryInput): Promise<CatalogQueryResult & { requestId: number; stale: boolean }> {
      sequence += 1
      const requestId = sequence
      controller?.abort()
      controller = new AbortController()
      try {
        const result = await queryAssetCatalog({ ...input, signal: controller.signal })
        if (requestId !== sequence) return { ...result, requestId, stale: true }
        return { ...result, requestId, stale: false }
      } catch (error) {
        if (requestId !== sequence) return { items: [], total: 0, requestId, stale: true }
        throw error
      }
    },
  }
}
