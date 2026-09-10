import type { ApiOutput } from '../../api/client'
import { AssetInput } from '../asset-picker/AssetInput'
import { useUiTranslation } from '../../i18n'
import { defaultMediaScreen, type MediaScreen } from './mediaScreen'
import { pickerOutputFromSlot } from './slotSource'
import type { Scene3DSlot } from './types'

export function Scene3DScreenControls({ slot, meshes, items, disabled, onChange, onChoose, onRemove }: {
  slot: Scene3DSlot; meshes: string[]; items: ApiOutput[]; disabled: boolean
  onChange: (screen: MediaScreen | undefined) => void; onChoose: (item: ApiOutput | null) => void; onRemove: () => void
}) {
  const { t } = useUiTranslation('scene3dEditor')
  if (slot.media === 'image') return null
  const screen = slot.screen
  const patch = (value: Partial<MediaScreen>) => onChange({ ...defaultMediaScreen(), ...screen, ...value })
  const field = (key: 'width' | 'height' | 'start' | 'speed', min: number, max: number) => <label className="flex items-center justify-between gap-2 text-xs">{t(`screens.${key}`)}
    <input type="number" aria-label={t(`screens.${key}`)} min={min} max={max} step="0.1" disabled={disabled} value={screen?.[key] ?? defaultMediaScreen()[key]}
      onChange={event => { const value = Number(event.target.value); if (event.target.value && Number.isFinite(value)) patch({ [key]: Math.max(min, Math.min(max, value)) }) }} className="min-h-9 w-20 rounded border border-border bg-bg-primary p-1" /></label>
  return <section className="mt-3 space-y-3 rounded-lg border border-border p-3" data-testid="scene3d-screen-controls">
    {slot.media === 'model3d' ? <label className="flex min-h-9 items-center gap-2"><input type="checkbox" disabled={disabled} checked={Boolean(screen)} onChange={event => onChange(event.target.checked ? defaultMediaScreen() : undefined)} />{t('screens.attach')}</label> : <strong>{t('screens.title')}</strong>}
    {screen && <>
      {slot.media === 'model3d' && <label className="block text-xs">{t('screens.mesh')}<select aria-label={t('screens.mesh')} disabled={disabled} value={screen.targetMesh} onChange={event => patch({ targetMesh: event.target.value })} className="mt-1 min-h-10 w-full rounded border border-border bg-bg-primary px-2">
        {[...new Set([screen.targetMesh, ...meshes])].map(name => <option key={name} value={name}>{name || t('screens.chooseMesh')}</option>)}
      </select></label>}
      <AssetInput label={t('screens.content')} placeholder={t('screens.chooseContent')} items={items}
        value={pickerOutputFromSlot(screen.sourceUrl, screen.media, screen.sourceRef)} accept="image/*,video/*" optional disabled={disabled}
        constraints={{ kinds: ['image', 'video'], maxCount: 1, optional: true }} onChoose={onChoose} />
      <label className="flex items-center justify-between gap-2">{t('screens.fit')}<select aria-label={t('screens.fit')} value={screen.fit} disabled={disabled} onChange={event => patch({ fit: event.target.value as MediaScreen['fit'] })} className="min-h-9 rounded border border-border bg-bg-primary px-2">
        <option value="contain">{t('screens.contain')}</option><option value="cover">{t('screens.cover')}</option></select></label>
      {slot.media === 'screen' && <label className="flex items-center justify-between gap-2">{t('screens.style')}<select aria-label={t('screens.style')} disabled={disabled} value={screen.style} onChange={event => patch({ style: event.target.value as MediaScreen['style'] })} className="min-h-9 rounded border border-border bg-bg-primary px-2">
        {(['monitor', 'billboard', 'frameless'] as const).map(style => <option key={style} value={style}>{t(`screens.${style}`)}</option>)}</select></label>}
      <div className="grid grid-cols-2 gap-3">{field('width', .1, 80)}{field('height', .1, 80)}</div>
      <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={screen.flipY} disabled={disabled} onChange={event => patch({ flipY: event.target.checked })} />{t('screens.flipY')}</label>
      {screen.media === 'video' && <><div className="grid grid-cols-2 gap-3">{field('start', 0, 86400)}{field('speed', .05, 8)}</div>
        <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={screen.loop} disabled={disabled} onChange={event => patch({ loop: event.target.checked })} />{t('screens.loop')}</label><p className="text-xs text-text-muted">{t('screens.clockHelp')}</p></>}
    </>}
    {slot.media === 'screen' && <button type="button" disabled={disabled} onClick={onRemove} className="min-h-9 rounded border border-border px-3">{t('screens.remove')}</button>}
  </section>
}
