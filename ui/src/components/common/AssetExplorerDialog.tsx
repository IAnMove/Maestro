import { useMemo, useState } from 'react'
import { Box, ChevronLeft, ChevronRight, FileAudio, FolderOpen, Image as ImageIcon, Video, X } from 'lucide-react'
import type { ApiOutput } from '../../api/outputs'
import type { AssetKind } from '../../api/assets'
import {
  ASSET_PICKER_PAGE_SIZE,
  assetRefKey,
  checkCompatibility,
  filterPickerItems,
  formatCreatedDate,
  isSameRef,
  outputToPickerItem,
  paginatePickerItems,
  sortPickerItems,
  type AssetConstraints,
  type CatalogSort,
  type PickerItem,
} from '../../features/asset-picker'
import { useUiTranslation } from '../../i18n'
import { assetPreviewUrl, formatAssetDate } from './assetExplorer.ts'
import { ModalShell } from './ModalShell'

const SORTS: CatalogSort[] = ['created_desc', 'created_asc', 'name_asc', 'name_desc']
const KIND_LABEL: Record<AssetKind, 'explorer.typeImage' | 'explorer.typeVideo' | 'explorer.typeModel' | 'explorer.typeAudio' | 'explorer.typeScene' | 'explorer.typeDocument'> = {
  image: 'explorer.typeImage',
  video: 'explorer.typeVideo',
  model3d: 'explorer.typeModel',
  audio: 'explorer.typeAudio',
  scene: 'explorer.typeScene',
  document: 'explorer.typeDocument',
  other: 'explorer.typeDocument',
}

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
          <span className="block truncate">{selected?.name ?? placeholder}</span>
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
  selectedName?: string
  allowNone?: boolean
  noneLabel?: string
  workspaceId?: string
  constraints?: AssetConstraints
  status?: 'ready' | 'loading' | 'error'
  onRetry?: () => void
  onChoose: (item: ApiOutput | null) => void
  onClose: () => void
}

function KindGlyph({ kind, size }: { kind: AssetKind; size: number }) {
  if (kind === 'model3d') return <Box size={size} className="text-cyan-200" />
  if (kind === 'video') return <Video size={size} className="text-text-muted" />
  if (kind === 'audio') return <FileAudio size={size} className="text-amber-200" />
  return <ImageIcon size={size} className="text-text-muted" />
}

function AssetExplorerBody({
  title,
  subtitle,
  items,
  selectedName,
  allowNone,
  noneLabel,
  workspaceId,
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
  const pickerItems = useMemo(
    () => items.map(item => outputToPickerItem(item, workspaceId || '')),
    [items, workspaceId],
  )
  const [picked, setPicked] = useState<PickerItem | null>(null)
  const selected = picked
    ?? (selectedName ? pickerItems.find(item => item.filename === selectedName) ?? null : null)
  const kinds = useMemo(() => {
    const allowed = constraints?.kinds
    const present = [...new Set(pickerItems.map(item => item.kind))]
    return allowed?.length ? present.filter(value => allowed.includes(value)) : present
  }, [constraints, pickerItems])
  const filtered = useMemo(() => {
    const kindList = kind ? [kind] : constraints?.kinds
    return sortPickerItems(filterPickerItems(pickerItems, query, kindList), sort)
  }, [constraints, kind, pickerItems, query, sort])
  const { pages, safePage, visible } = paginatePickerItems(filtered, page, ASSET_PICKER_PAGE_SIZE)
  const selectedStillVisible = selected ? filtered.some(item => isSameRef(item.ref, selected.ref)) : true
  const preview = selected?.thumbnailUrl || ''
  const compatibility = selected && constraints
    ? checkCompatibility(selected, constraints, 0)
    : { allowed: true as const }
  const stillInCatalog = selected ? pickerItems.some(item => isSameRef(item.ref, selected.ref)) : false
  const canConfirm = Boolean(selected) && compatibility.allowed && stillInCatalog

  const closeWithoutChoosing = () => onClose()
  const confirm = (item: PickerItem | null) => {
    if (item) {
      const output = items.find(entry => entry.name === item.filename)
      if (!output) return
      onChoose(output)
    } else {
      onChoose(null)
    }
    onClose()
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
        <button type="button" onClick={closeWithoutChoosing} aria-label={t('explorer.closeAria')} className="rounded border border-border p-1.5 text-text-muted hover:text-text-primary">
          <X size={13} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <input
          type="search"
          value={query}
          onChange={event => { setQuery(event.target.value); setPage(0) }}
          placeholder={t('explorer.search')}
          className="min-w-48 flex-1 rounded border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-primary"
        />
        {kinds.length > 1 && (
          <label className="flex items-center gap-1 text-[10px] text-text-muted">
            {t('explorer.kindFilter')}
            <select
              aria-label={t('explorer.kindFilter')}
              value={kind}
              onChange={event => { setKind(event.target.value as AssetKind | ''); setPage(0) }}
              className="rounded border border-border bg-bg-primary px-1 py-1 text-[10px] text-text-primary"
            >
              <option value="">{t('explorer.kindAll')}</option>
              {kinds.map(value => <option key={value} value={value}>{t(KIND_LABEL[value])}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1 text-[10px] text-text-muted">
          {t('explorer.sortLabel')}
          <select
            aria-label={t('explorer.sortLabel')}
            value={sort}
            onChange={event => { setSort(event.target.value as CatalogSort); setPage(0) }}
            className="rounded border border-border bg-bg-primary px-1 py-1 text-[10px] text-text-primary"
          >
            {SORTS.map(value => (
              <option key={value} value={value}>
                {t(value === 'created_desc' ? 'explorer.sortCreatedDesc'
                  : value === 'created_asc' ? 'explorer.sortCreatedAsc'
                    : value === 'name_asc' ? 'explorer.sortNameAsc'
                      : 'explorer.sortNameDesc')}
              </option>
            ))}
          </select>
        </label>
        {allowNone && (
          <button type="button" onClick={() => confirm(null)} className="rounded border border-border px-2 py-1 text-[10px] text-text-secondary">
            {noneLabel ?? t('explorer.none')}
          </button>
        )}
      </div>
      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-h-0 overflow-y-auto">
          {status === 'loading' ? (
            <p className="py-16 text-center text-[11px] text-text-muted">{t('explorer.loading')}</p>
          ) : status === 'error' ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="text-[11px] text-text-muted">{t('explorer.loadFailed')}</p>
              {onRetry && <button type="button" onClick={onRetry} className="rounded border border-border px-2 py-1 text-[10px]">{t('explorer.retry')}</button>}
            </div>
          ) : visible.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map(item => {
                const active = selected ? isSameRef(selected.ref, item.ref) : false
                return (
                  <button
                    key={assetRefKey(item.ref)}
                    type="button"
                    title={item.filename}
                    aria-pressed={active}
                    onClick={() => setPicked(item)}
                    className={`overflow-hidden rounded-lg border text-left ${active ? 'border-accent-blue ring-1 ring-accent-blue/40' : 'border-border hover:border-accent-blue/50'}`}
                  >
                    <div className="flex aspect-square items-center justify-center bg-black/40">
                      {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <KindGlyph kind={item.kind} size={22} />
                      )}
                    </div>
                    <div className="truncate px-1.5 pt-1 text-[9px] text-text-secondary">{item.title}</div>
                    <div className="truncate px-1.5 pb-1 text-[8px] text-text-muted">{formatCreatedDate(item.createdAt)}</div>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="py-16 text-center text-[11px] text-text-muted">
              {pickerItems.length && query.trim() ? t('explorer.noResults') : t('explorer.empty')}
            </p>
          )}
        </div>
        <aside className="flex min-h-[200px] flex-col rounded-lg border border-border bg-bg-tertiary p-2">
          {selected ? (
            <>
              <div className="flex aspect-video items-center justify-center overflow-hidden rounded bg-black/50">
                {preview ? (
                  <img src={preview} alt={t('explorer.previewAria', { name: selected.filename })} className="h-full w-full object-contain" />
                ) : (
                  <KindGlyph kind={selected.kind} size={36} />
                )}
              </div>
              <div className="mt-2 break-all text-[11px] font-medium text-text-primary" title={selected.filename}>{selected.title}</div>
              <div className="mt-0.5 break-all text-[9px] text-text-muted">{selected.filename}</div>
              <div className="mt-0.5 text-[9px] text-text-muted">
                {t(KIND_LABEL[selected.kind])} · {t('explorer.created', { date: formatCreatedDate(selected.createdAt) })}
              </div>
              {!selectedStillVisible && <p className="mt-1 text-[9px] text-amber-200">{t('explorer.filteredHidden')}</p>}
              {!compatibility.allowed && <p className="mt-1 text-[9px] text-red-300">{t(compatibility.reasonKey)}</p>}
            </>
          ) : (
            <p className="m-auto text-center text-[10px] text-text-muted">{t('explorer.selectHint')}</p>
          )}
        </aside>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
        <span className="text-[10px] text-text-muted">{t('explorer.page', { shown: visible.length, total: filtered.length })}</span>
        <div className="flex gap-1">
          <button type="button" onClick={closeWithoutChoosing} className="rounded border border-border px-2 py-1 text-[10px] text-text-secondary">{t('actions.cancel')}</button>
          <button type="button" aria-label={t('explorer.previousPage')} disabled={safePage <= 0} onClick={() => setPage(value => Math.max(0, value - 1))} className="rounded border border-border p-1.5 disabled:opacity-30"><ChevronLeft size={13} /></button>
          <button type="button" aria-label={t('explorer.nextPage')} disabled={safePage + 1 >= pages} onClick={() => setPage(value => value + 1)} className="rounded border border-border p-1.5 disabled:opacity-30"><ChevronRight size={13} /></button>
          <button type="button" disabled={!canConfirm} onClick={() => selected && confirm(selected)} className="rounded bg-accent-blue px-2 py-1.5 text-[10px] text-white disabled:opacity-40">
            {t('explorer.choose')}
          </button>
        </div>
      </div>
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
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
    >
      {open ? (
        <AssetExplorerBody
          key={`${title}:${body.selectedName ?? ''}`}
          title={title}
          onClose={onClose}
          {...body}
        />
      ) : null}
    </ModalShell>
  )
}
