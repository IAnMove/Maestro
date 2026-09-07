import { useEffect, useMemo, useState } from 'react'
import { fetchAssets, type AssetCatalogItem } from '../../api/assets'
import { useUiTranslation } from '../../i18n'
import { catalogLocation } from './catalogLocation'

const PAGE_SIZE = 12
const TABS = [
  { id: 'image', labelKey: 'composer.tabImages' },
  { id: 'model3d', labelKey: 'composer.tabGlb' },
] as const
type PickerKind = (typeof TABS)[number]['id']

export interface TemplateAssetPickerProps {
  workspace: string
  kinds: readonly PickerKind[]
  selectedId?: string
  onPick: (asset: AssetCatalogItem) => void
  disabledReason?: (asset: AssetCatalogItem) => string | undefined
}

function previewUrlFor(asset: AssetCatalogItem, workspace: string): string | null {
  if (asset.kind !== 'image') return null
  try { return catalogLocation(asset, workspace).url }
  catch { return null }
}

export function TemplateAssetPicker({
  workspace,
  kinds,
  selectedId,
  onPick,
  disabledReason,
}: TemplateAssetPickerProps) {
  const { t } = useUiTranslation('scene3d')
  const allowedKinds = useMemo(() => new Set(kinds), [kinds])
  const [kind, setKind] = useState<PickerKind>(kinds[0] || 'image')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [previewErrors, setPreviewErrors] = useState<Record<string, boolean>>({})
  const [result, setResult] = useState<{ query: string; assets: AssetCatalogItem[]; total: number; error: string }>({ query: '', assets: [], total: 0, error: '' })

  const activeKind = allowedKinds.has(kind) ? kind : (kinds[0] || 'image')
  const queryKey = `${workspace}\u0000${activeKind}\u0000${search}\u0000${offset}\u0000${retry}`

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    fetchAssets({
      workspace,
      kind: activeKind,
      search: search.trim() || undefined,
      limit: PAGE_SIZE,
      offset,
      signal: controller.signal,
    }).then(result => {
      if (!active || controller.signal.aborted) return
      setResult({ query: queryKey, assets: result.assets, total: result.total, error: '' })
    }).catch(reason => {
      if (!active || controller.signal.aborted) return
      setResult({ query: queryKey, assets: [], total: 0, error: reason instanceof Error ? reason.message : t('composer.loadAssetsFailed') })
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [activeKind, offset, queryKey, search, t, workspace])

  const loading = result.query !== queryKey
  const error = result.query === queryKey ? result.error : ''
  const visibleAssets = result.query === queryKey && !error ? result.assets : []
  const total = result.query === queryKey && !error ? result.total : 0
  const hasPrevious = offset > 0
  const hasNext = offset + PAGE_SIZE < total

  const reasonFor = (asset: AssetCatalogItem): string | undefined => {
    if (asset.kind !== activeKind) return t('composer.incompatibleKind')
    return disabledReason?.(asset)
  }

  return (
    <section aria-label={t('composer.pickerAria')} className="space-y-3 rounded-xl border border-border bg-bg-secondary/60 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 text-[10px] font-medium text-text-secondary">
          {t('composer.searchLibrary')}
          <input
            type="search"
            value={search}
            onChange={event => { setSearch(event.target.value); setOffset(0) }}
            placeholder={t('composer.searchPlaceholder')}
            className="mt-1 w-full rounded-md border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent-blue"
            aria-label={t('composer.searchAria')}
          />
        </label>
        <div role="tablist" aria-label={t('composer.assetType')} className="flex rounded-md border border-border bg-bg-tertiary p-0.5">
          {TABS.map(tab => {
            const enabled = allowedKinds.has(tab.id)
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeKind === tab.id}
                disabled={!enabled}
                title={enabled ? undefined : t('composer.typeUnavailable')}
                onClick={() => { setKind(tab.id); setOffset(0) }}
                className={`rounded px-2.5 py-1.5 text-[10px] ${activeKind === tab.id ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-muted hover:bg-bg-hover'} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {t(tab.labelKey)}
                {!enabled && <span className="ml-1 text-[9px]">{t('composer.unavailableSuffix')}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {loading && <p role="status" className="py-4 text-center text-xs text-text-muted">{t('composer.loadingAssets')}</p>}
      {error && !loading && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          <span>{t('composer.libraryLoadFailed', { error })}</span>
          <button type="button" onClick={() => setRetry(value => value + 1)} className="rounded border border-red-300/40 px-2 py-1 text-[10px] hover:bg-red-400/10">{t('composer.retry')}</button>
        </div>
      )}

      {!loading && !error && result.query === queryKey && visibleAssets.length === 0 && (
        <p className="py-4 text-center text-xs text-text-muted">{t('composer.noAssets')}</p>
      )}

      {visibleAssets.length > 0 && (
        <ul aria-label={t('composer.assetsKind', { kind: activeKind })} className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
          {visibleAssets.map(asset => {
            const disabled = reasonFor(asset)
            const previewUrl = previewUrlFor(asset, workspace)
            const previewKey = `${queryKey}|${asset.id}`
            const previewFailed = previewErrors[previewKey] === true
            return (
              <li key={asset.id}>
                <button
                  type="button"
                  aria-label={t('composer.selectAria', { name: asset.filename })}
                  aria-pressed={selectedId === asset.id}
                  disabled={Boolean(disabled)}
                  title={disabled}
                  onClick={() => onPick(asset)}
                  className={`w-full rounded-lg border p-2 text-left transition-colors ${selectedId === asset.id ? 'border-accent-blue bg-accent-blue/10' : 'border-border bg-bg-tertiary hover:border-accent-blue/60'} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <div className="flex h-20 items-center justify-center overflow-hidden rounded bg-black/20">
                    {asset.kind === 'model3d' ? (
                      <span className="text-[10px] text-text-muted">{t('composer.glbPreview')}</span>
                    ) : previewFailed ? (
                      <span className="px-2 text-center text-[10px] text-amber-200">{t('composer.previewUnavailable')}</span>
                    ) : previewUrl ? (
                      <img src={previewUrl} alt={t('composer.previewAria', { name: asset.filename })} className="h-full w-full object-contain" onError={() => setPreviewErrors(current => ({ ...current, [previewKey]: true }))} />
                    ) : (
                      <span className="px-2 text-center text-[10px] text-text-muted">{t('composer.previewUnavailableWorkspace')}</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-medium text-text-primary" title={asset.filename}>{asset.filename}</span>
                    <span className="shrink-0 text-[9px] text-text-muted">{asset.kind === 'model3d' ? t('composer.kindGlb') : t('composer.kindImage')}</span>
                  </div>
                  <span className="mt-1 block text-[9px] text-text-muted">{
                    asset.metadata_status === 'canonical' ? t('composer.metaCanonical')
                      : asset.metadata_status === 'missing' ? t('composer.metaMissing')
                        : asset.metadata_status === 'invalid' ? t('composer.metaInvalid')
                          : asset.metadata_status === 'unreadable' ? t('composer.metaUnreadable')
                            : t('composer.metaLegacy')
                  }</span>
                  {disabled && <span className="mt-1 block text-[10px] text-amber-200">{disabled}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 text-[10px] text-text-muted">
        <span>{total ? t('composer.pageRange', { from: offset + 1, to: Math.min(offset + PAGE_SIZE, total), total }) : t('composer.noResults')}</span>
        <div className="flex gap-1">
          <button type="button" disabled={!hasPrevious || loading} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))} className="rounded border border-border px-2 py-1 disabled:opacity-40">{t('composer.previous')}</button>
          <button type="button" disabled={!hasNext || loading} onClick={() => setOffset(value => value + PAGE_SIZE)} className="rounded border border-border px-2 py-1 disabled:opacity-40">{t('composer.next')}</button>
        </div>
      </div>
    </section>
  )
}
