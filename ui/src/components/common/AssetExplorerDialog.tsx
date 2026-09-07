import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import type { ApiOutput } from '../../api/outputs'
import type { AssetKind } from '../../api/assets'
import {
  ASSET_PICKER_PAGE_SIZE,
  checkCompatibility,
  confirmPickerChoice,
  createCatalogQuerySession,
  filterPickerItems,
  isSameRef,
  livePickerItem,
  outputToPickerItem,
  paginatePickerItems,
  pickerItemToOutput,
  sortPickerItems,
  type AssetConstraints,
  type CatalogSort,
  type PickerItem,
} from '../../features/asset-picker'
import { useUiTranslation } from '../../i18n'
import { ExplorerFooter, ExplorerGallery, ExplorerPreview, ExplorerToolbar } from './AssetExplorerChrome.tsx'
import { assetPreviewUrl, formatAssetDate } from './assetExplorer.ts'
import { ModalShell } from './ModalShell'

export function AssetPickTrigger({
  label,
  selected,
  placeholder,
  onOpen,
  disabled,
}: {
  label: string
  selected?: ApiOutput
  placeholder: string
  onOpen: () => void
  disabled?: boolean
}) {
  const preview = selected ? assetPreviewUrl(selected) : ''
  const picked = selected ? outputToPickerItem(selected, '') : null
  return (
    <div className="block text-[9px] text-text-muted">
      {label}
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        className="mt-0.5 flex w-full items-center gap-2 rounded border border-border bg-bg-primary px-1.5 py-1 text-left text-[10px] text-text-primary disabled:opacity-40"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-bg-active">
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <FolderOpen size={14} className="text-text-muted" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{picked?.title ?? placeholder}</span>
          {picked && <span className="block truncate text-[8px] text-text-muted">{picked.filename}</span>}
          {selected && <span className="block text-[8px] text-text-muted">{formatAssetDate(selected)}</span>}
        </span>
      </button>
    </div>
  )
}

type BodyProps = {
  title: string
  subtitle?: string
  items: ApiOutput[]
  selected?: ApiOutput
  selectedName?: string
  allowNone?: boolean
  noneLabel?: string
  workspaceId?: string
  remote?: boolean
  constraints?: AssetConstraints
  status?: 'ready' | 'loading' | 'error'
  onRetry?: () => void
  onChoose: (item: ApiOutput | null) => void
  onClose: () => void
}

function compatibleKinds(items: PickerItem[], constraints?: AssetConstraints) {
  const present = [...new Set(items.map(item => item.kind))]
  return constraints?.kinds?.length ? present.filter(kind => constraints.kinds.includes(kind)) : present
}

function confirmOutput(
  items: ApiOutput[],
  pickerItems: PickerItem[],
  item: PickerItem | null,
  workspaceId: string,
  constraints: AssetConstraints | undefined,
  onChoose: (item: ApiOutput | null) => void,
  onClose: () => void,
) {
  confirmPickerChoice(items, pickerItems, item, workspaceId, constraints, onChoose, onClose)
}

function AssetExplorerBody({
  title,
  subtitle,
  items,
  selected: selectedOutput,
  selectedName,
  allowNone,
  noneLabel,
  workspaceId,
  remote,
  constraints,
  status = 'ready',
  onRetry,
  onChoose,
  onClose,
}: BodyProps) {
  const { t } = useUiTranslation('common')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<CatalogSort>('created_desc')
  const [kind, setKind] = useState<AssetKind | ''>('')
  const [retry, setRetry] = useState(0)
  const catalogRemote = Boolean(remote && workspaceId)
  const session = useRef(createCatalogQuerySession())
  const [remoteItems, setRemoteItems] = useState<PickerItem[]>([])
  const [remoteTotal, setRemoteTotal] = useState(0)
  const [remoteStatus, setRemoteStatus] = useState<'ready' | 'loading' | 'error'>(catalogRemote ? 'loading' : 'ready')
  useEffect(() => () => session.current.dispose(), [])
  useEffect(() => {
    if (!catalogRemote || !workspaceId) return
    const kinds = kind ? [kind] : constraints?.kinds
    void session.current.run({
      workspace: workspaceId,
      search: query.trim() || undefined,
      sort,
      kinds,
      limit: ASSET_PICKER_PAGE_SIZE,
      offset: page * ASSET_PICKER_PAGE_SIZE,
    }).then(result => {
      if (result.stale) return
      setRemoteItems(result.items)
      setRemoteTotal(result.total)
      setRemoteStatus('ready')
    }).catch(() => setRemoteStatus('error'))
  }, [catalogRemote, constraints, kind, page, query, retry, sort, workspaceId])
  const localItems = useMemo(
    () => items.map(item => outputToPickerItem(item, workspaceId || '')),
    [items, workspaceId],
  )
  const pickerItems = catalogRemote ? remoteItems : localItems
  const [picked, setPicked] = useState<{ workspaceId: string; item: PickerItem } | null>(null)
  const scopedPicked = picked && picked.workspaceId === (workspaceId || '') ? picked.item : null
  const selectedFromValue = selectedOutput
    ? livePickerItem(pickerItems, outputToPickerItem(selectedOutput, workspaceId || ''))
      ?? (catalogRemote ? outputToPickerItem(selectedOutput, workspaceId || '') : null)
    : null
  const namedMatches = selectedName ? pickerItems.filter(item => item.filename === selectedName) : []
  const selected = (catalogRemote ? scopedPicked : livePickerItem(pickerItems, scopedPicked))
    ?? selectedFromValue
    ?? (scopedPicked ? null : namedMatches.length === 1 ? namedMatches[0] : null)
  const filtered = useMemo(
    () => sortPickerItems(filterPickerItems(localItems, query, kind ? [kind] : constraints?.kinds), sort),
    [constraints, kind, localItems, query, sort],
  )
  const localPage = paginatePickerItems(filtered, page, ASSET_PICKER_PAGE_SIZE)
  const pages = catalogRemote
    ? Math.max(1, Math.ceil(remoteTotal / ASSET_PICKER_PAGE_SIZE) || 1)
    : localPage.pages
  const safePage = catalogRemote ? Math.min(page, pages - 1) : localPage.safePage
  const visible = catalogRemote ? remoteItems : localPage.visible
  const galleryStatus = catalogRemote ? remoteStatus : status
  const compatibility = selected && constraints ? checkCompatibility(selected, constraints, 0) : { allowed: true as const }
  const stillInCatalog = catalogRemote
    ? Boolean(selected)
    : Boolean(selected && livePickerItem(pickerItems, selected))
  const selectedStillVisible = selected
    ? visible.some(item => isSameRef(item.ref, selected.ref) && item.url === selected.url)
    : true
  const emptyLabel = (catalogRemote ? remoteTotal : pickerItems.length) && query.trim() ? t('explorer.noResults') : t('explorer.empty')
  const toolbarKinds = catalogRemote
    ? [...(constraints?.kinds?.length ? constraints.kinds : ['image', 'video', 'audio', 'model3d', 'scene'] as const)]
    : compatibleKinds(localItems, constraints)
  const confirm = (item: PickerItem | null) => {
    if (catalogRemote) {
      if (!item) {
        onChoose(null)
        onClose()
        return
      }
      const output = pickerItemToOutput(item)
      if (!output) return
      if (constraints && !checkCompatibility(item, constraints, 0).allowed) return
      onChoose(output)
      onClose()
      return
    }
    confirmOutput(items, pickerItems, item, workspaceId || '', constraints, onChoose, onClose)
  }

  return (
    <div
      data-testid="asset-explorer"
      className="flex max-h-[86vh] w-[860px] max-w-[96vw] flex-col overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-2xl"
      onMouseDown={event => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <FolderOpen size={15} className="text-accent-blue" />
          <div>
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            <p className="text-[10px] text-text-muted">{subtitle ?? t('explorer.subtitle')}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label={t('explorer.closeAria')} className="rounded border border-border p-1.5 text-text-muted hover:text-text-primary">
          <X size={13} />
        </button>
      </div>
      <ExplorerToolbar
        query={query}
        kind={kind}
        kinds={toolbarKinds}
        sort={sort}
        allowNone={allowNone}
        noneLabel={noneLabel}
        onQuery={value => { setQuery(value); setPage(0) }}
        onKind={value => { setKind(value); setPage(0) }}
        onSort={value => { setSort(value); setPage(0) }}
        onClear={() => confirm(null)}
      />
      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-h-0 overflow-y-auto">
          <ExplorerGallery
            status={galleryStatus}
            visible={visible}
            selected={selected}
            emptyLabel={emptyLabel}
            onRetry={catalogRemote ? () => setRetry(value => value + 1) : onRetry}
            onPick={item => setPicked({ workspaceId: workspaceId || '', item })}
          />
        </div>
        <aside className="flex min-h-[200px] flex-col rounded-lg border border-border bg-bg-tertiary p-2">
          <ExplorerPreview
            selected={selected}
            selectedStillVisible={selectedStillVisible}
            compatibility={compatibility}
          />
        </aside>
      </div>
      <ExplorerFooter
        shown={visible.length}
        total={catalogRemote ? remoteTotal : filtered.length}
        safePage={safePage}
        pages={pages}
        canConfirm={Boolean(selected) && compatibility.allowed && stillInCatalog}
        onCancel={onClose}
        onPage={setPage}
        onConfirm={() => selected && confirm(selected)}
      />
    </div>
  )
}

export function AssetExplorerDialog({
  open,
  title,
  onClose,
  ...body
}: BodyProps & { open: boolean }) {
  return (
    <ModalShell
      open={open}
      title={title}
      onClose={onClose}
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
    >
      {open ? (
        <AssetExplorerBody
          key={`${title}:${body.selected?.asset_id || body.selected?.url || body.selectedName || ''}`}
          title={title}
          onClose={onClose}
          {...body}
        />
      ) : null}
    </ModalShell>
  )
}
