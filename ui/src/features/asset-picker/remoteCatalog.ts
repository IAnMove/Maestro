import { useEffect, useRef, useState } from 'react'
import type { ApiOutput } from '../../api/outputs'
import type { AssetKind } from '../../api/assets'
import {
  checkCompatibility,
  outputToPickerItem,
  pickerItemToOutput,
} from './adapters.ts'
import { confirmPickerChoice, livePickerItem } from './confirmChoice.ts'
import { filterPickerItems, paginatePickerItems, sortPickerItems } from './localQuery.ts'
import { createCatalogQuerySession } from './query.ts'
import { ASSET_PICKER_PAGE_SIZE } from './types.ts'
import type { AssetConstraints, CatalogSort, PickerItem } from './types.ts'

const DEFAULT_KINDS: AssetKind[] = ['image', 'video', 'audio', 'model3d', 'scene']

export function remoteCatalogFilterKey(
  kind: AssetKind | '',
  constraints?: AssetConstraints,
): string {
  if (kind) return kind
  return (constraints?.kinds || []).join(',')
}

export function useRemoteCatalogPage(input: {
  enabled: boolean
  workspaceId?: string
  query: string
  sort: CatalogSort
  kind: AssetKind | ''
  page: number
  retry: number
  constraints?: AssetConstraints
}): { items: PickerItem[]; total: number; status: 'ready' | 'loading' | 'error' } {
  const session = useRef(createCatalogQuerySession())
  const [items, setItems] = useState<PickerItem[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<'ready' | 'loading' | 'error'>(input.enabled ? 'loading' : 'ready')
  const kindsKey = remoteCatalogFilterKey(input.kind, input.constraints)
  useEffect(() => () => session.current.dispose(), [])
  useEffect(() => {
    if (!input.enabled || !input.workspaceId) return
    const kinds = kindsKey ? kindsKey.split(',') as AssetKind[] : undefined
    void session.current.run({
      workspace: input.workspaceId,
      search: input.query.trim() || undefined,
      sort: input.sort,
      kinds,
      limit: ASSET_PICKER_PAGE_SIZE,
      offset: input.page * ASSET_PICKER_PAGE_SIZE,
    }).then(result => {
      if (result.stale) return
      setItems(result.items)
      setTotal(result.total)
      setStatus('ready')
    }).catch(() => setStatus('error'))
  }, [input.enabled, input.page, input.query, input.retry, input.sort, input.workspaceId, kindsKey])
  return { items, total, status }
}

export function remotePageCount(total: number): number {
  return Math.max(1, Math.ceil(total / ASSET_PICKER_PAGE_SIZE) || 1)
}

export function explorerToolbarKinds(
  remote: boolean,
  localItems: PickerItem[],
  constraints?: AssetConstraints,
): AssetKind[] {
  if (remote) return [...(constraints?.kinds?.length ? constraints.kinds : DEFAULT_KINDS)]
  const present = [...new Set(localItems.map(item => item.kind))]
  return constraints?.kinds?.length ? present.filter(kind => constraints.kinds.includes(kind)) : present
}

export function explorerListModel(input: {
  remote: boolean
  remoteItems: PickerItem[]
  remoteTotal: number
  remoteStatus: 'ready' | 'loading' | 'error'
  localItems: PickerItem[]
  query: string
  kind: AssetKind | ''
  sort: CatalogSort
  page: number
  constraints?: AssetConstraints
  fallbackStatus: 'ready' | 'loading' | 'error'
}) {
  const pickerItems = input.remote ? input.remoteItems : input.localItems
  const filtered = sortPickerItems(
    filterPickerItems(input.localItems, input.query, input.kind ? [input.kind] : input.constraints?.kinds),
    input.sort,
  )
  const localPage = paginatePickerItems(filtered, input.page, ASSET_PICKER_PAGE_SIZE)
  const pages = input.remote ? remotePageCount(input.remoteTotal) : localPage.pages
  return {
    pickerItems,
    filtered,
    pages,
    safePage: input.remote ? Math.min(input.page, pages - 1) : localPage.safePage,
    visible: input.remote ? input.remoteItems : localPage.visible,
    galleryStatus: input.remote ? input.remoteStatus : input.fallbackStatus,
    footerTotal: input.remote ? input.remoteTotal : filtered.length,
    emptyLabelIsNoResults: Boolean((input.remote ? input.remoteTotal : pickerItems.length) && input.query.trim()),
    toolbarKinds: explorerToolbarKinds(input.remote, input.localItems, input.constraints),
  }
}

function usableExplorerOutput(output: ApiOutput): boolean {
  return Boolean(output.asset_id || String(output.url || '').trim())
}

export function resolveExplorerSelection(input: {
  remote: boolean
  pickerItems: PickerItem[]
  scopedPicked: PickerItem | null
  selectedOutput?: ApiOutput
  selectedName?: string
  workspaceId: string
}): PickerItem | null {
  const selectedFromValue = input.selectedOutput
    ? livePickerItem(input.pickerItems, outputToPickerItem(input.selectedOutput, input.workspaceId))
      ?? (input.remote && usableExplorerOutput(input.selectedOutput)
        ? outputToPickerItem(input.selectedOutput, input.workspaceId)
        : null)
    : null
  const namedMatches = input.selectedName ? input.pickerItems.filter(item => item.filename === input.selectedName) : []
  if (input.remote) return input.scopedPicked ?? selectedFromValue ?? namedUnique(input.scopedPicked, namedMatches)
  return livePickerItem(input.pickerItems, input.scopedPicked) ?? selectedFromValue ?? namedUnique(input.scopedPicked, namedMatches)
}

function namedUnique(scopedPicked: PickerItem | null, namedMatches: PickerItem[]): PickerItem | null {
  if (scopedPicked) return null
  return namedMatches.length === 1 ? namedMatches[0] : null
}

export function explorerCanConfirm(
  remote: boolean,
  pickerItems: PickerItem[],
  selected: PickerItem | null,
): boolean {
  if (!selected) return false
  if (!remote) return Boolean(livePickerItem(pickerItems, selected))
  return Boolean(String(selected.url || '').trim())
}

export function confirmExplorerItem(
  remote: boolean,
  items: ApiOutput[],
  pickerItems: PickerItem[],
  item: PickerItem | null,
  workspaceId: string,
  constraints: AssetConstraints | undefined,
  onChoose: (item: ApiOutput | null) => void,
  onClose: () => void,
): void {
  if (!remote) {
    confirmPickerChoice(items, pickerItems, item, workspaceId, constraints, onChoose, onClose)
    return
  }
  if (!item) {
    onChoose(null)
    onClose()
    return
  }
  const output = pickerItemToOutput(item)
  if (!output || !String(output.url || '').trim()) return
  if (constraints && !checkCompatibility(item, constraints, 0).allowed) return
  onChoose(output)
  onClose()
}
