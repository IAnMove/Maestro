import { useMemo, useState } from 'react'
import { Box, ChevronLeft, ChevronRight, FileAudio, FolderOpen, Image as ImageIcon, Video, X } from 'lucide-react'
import type { ApiOutput } from '../../api/outputs'
import { useUiTranslation } from '../../i18n'
import { assetPreviewUrl, formatAssetDate } from './assetExplorer.ts'
import { ModalShell } from './ModalShell'

const PAGE_SIZE = 12

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
  onChoose: (item: ApiOutput | null) => void
  onClose: () => void
}

function explorerTypeKey(type: ApiOutput['type']) {
  if (type === 'model3d') return 'explorer.typeModel' as const
  if (type === 'video') return 'explorer.typeVideo' as const
  if (type === 'audio') return 'explorer.typeAudio' as const
  if (type === 'scene') return 'explorer.typeScene' as const
  if (type === 'comic') return 'explorer.typeComic' as const
  return 'explorer.typeImage' as const
}

function AssetExplorerBody({
  title,
  subtitle,
  items,
  selectedName,
  allowNone,
  noneLabel,
  onChoose,
  onClose,
}: BodyProps) {
  const { t } = useUiTranslation('common')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<ApiOutput | null>(
    () => items.find(item => item.name === selectedName) ?? items[0] ?? null,
  )
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter(item => item.name.toLowerCase().includes(needle) || item.type.includes(needle))
  }, [items, query])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pages - 1)
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const preview = selected ? assetPreviewUrl(selected) : ''

  const choose = (item: ApiOutput | null) => {
    onChoose(item)
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
        <button type="button" onClick={onClose} aria-label={t('explorer.closeAria')} className="rounded border border-border p-1.5 text-text-muted hover:text-text-primary">
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
        {allowNone && (
          <button type="button" onClick={() => choose(null)} className="rounded border border-border px-2 py-1 text-[10px] text-text-secondary">
            {noneLabel ?? t('explorer.none')}
          </button>
        )}
      </div>
      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-h-0 overflow-y-auto">
          {visible.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map(item => {
                const thumb = assetPreviewUrl(item)
                return (
                  <button
                    key={item.name}
                    type="button"
                    title={item.name}
                    onClick={() => setSelected(item)}
                    onDoubleClick={() => choose(item)}
                    className={`overflow-hidden rounded-lg border text-left ${selected?.name === item.name ? 'border-accent-blue ring-1 ring-accent-blue/40' : 'border-border hover:border-accent-blue/50'}`}
                  >
                    <div className="flex aspect-square items-center justify-center bg-black/40">
                      {thumb ? (
                        <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : item.type === 'model3d' ? (
                        <Box size={22} className="text-cyan-200" />
                      ) : item.type === 'video' ? (
                        <Video size={22} className="text-text-muted" />
                      ) : item.type === 'audio' ? (
                        <FileAudio size={22} className="text-amber-200" />
                      ) : (
                        <ImageIcon size={22} className="text-text-muted" />
                      )}
                    </div>
                    <div className="truncate px-1.5 pt-1 text-[9px] text-text-secondary">{item.name}</div>
                    <div className="truncate px-1.5 pb-1 text-[8px] text-text-muted">{formatAssetDate(item)}</div>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="py-16 text-center text-[11px] text-text-muted">{t('explorer.empty')}</p>
          )}
        </div>
        <aside className="flex min-h-[200px] flex-col rounded-lg border border-border bg-bg-tertiary p-2">
          {selected ? (
            <>
              <div className="flex aspect-video items-center justify-center overflow-hidden rounded bg-black/50">
                {preview ? (
                  <img src={preview} alt={t('explorer.previewAria', { name: selected.name })} className="h-full w-full object-contain" />
                ) : selected.type === 'model3d' ? (
                  <Box size={36} className="text-cyan-200" />
                ) : selected.type === 'audio' ? (
                  <FileAudio size={36} className="text-amber-200" />
                ) : (
                  <Video size={36} className="text-text-muted" />
                )}
              </div>
              <div className="mt-2 break-all text-[11px] font-medium text-text-primary">{selected.name}</div>
              <div className="mt-0.5 text-[9px] text-text-muted">
                {t(explorerTypeKey(selected.type))} · {t('explorer.created', { date: formatAssetDate(selected) || '—' })}
              </div>
              <button type="button" onClick={() => choose(selected)} className="mt-auto rounded bg-accent-blue px-2 py-1.5 text-[10px] text-white">
                {t('explorer.choose')}
              </button>
            </>
          ) : (
            <p className="m-auto text-center text-[10px] text-text-muted">{t('explorer.selectHint')}</p>
          )}
        </aside>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
        <span className="text-[10px] text-text-muted">{t('explorer.page', { shown: visible.length, total: filtered.length })}</span>
        <div className="flex gap-1">
          <button type="button" onClick={onClose} className="rounded border border-border px-2 py-1 text-[10px] text-text-secondary">{t('actions.cancel')}</button>
          <button type="button" aria-label={t('explorer.previousPage')} disabled={safePage <= 0} onClick={() => setPage(value => Math.max(0, value - 1))} className="rounded border border-border p-1.5 disabled:opacity-30"><ChevronLeft size={13} /></button>
          <button type="button" aria-label={t('explorer.nextPage')} disabled={safePage + 1 >= pages} onClick={() => setPage(value => value + 1)} className="rounded border border-border p-1.5 disabled:opacity-30"><ChevronRight size={13} /></button>
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
      {open ? <AssetExplorerBody key={`${title}:${body.selectedName ?? ''}:${body.items.length}`} title={title} onClose={onClose} {...body} /> : null}
    </ModalShell>
  )
}
