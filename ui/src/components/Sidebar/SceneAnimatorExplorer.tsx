import type { ApiOutput } from '../../api/outputs'
import { useUiTranslation } from '../../i18n'
import type { AssetSuitability, NarrativeAssetRole } from '../../lib/assetSuitability'
import {
  NARRATIVE_SCENE_TEMPLATES,
  type NarrativeSceneId,
  type NarrativeSceneTemplate,
  type NarrativeTemplateInput,
} from '../../lib/sceneNarrative'
import { AssetExplorerDialog, AssetPickTrigger } from '../common/AssetExplorerDialog'
import {
  applyExplorerChoice,
  assetsForExplorer,
  explorerAllowsNone,
  explorerSelectedName,
  explorerTitleKey,
  type AssetExplorerPurpose,
  type ExplorerChoiceHandlers,
} from '../common/assetExplorer.ts'

export function SceneAnimatorExplorer({
  purpose,
  models,
  media,
  visuals,
  audio,
  names,
  handlers,
  onClose,
}: {
  purpose: AssetExplorerPurpose | null
  models: ApiOutput[]
  media: ApiOutput[]
  visuals: ApiOutput[]
  audio: ApiOutput[]
  names: { hero: string; plate: string; prop: string; foreground: string }
  handlers: ExplorerChoiceHandlers
  onClose: () => void
}) {
  const { t } = useUiTranslation('scene3d')
  return (
    <AssetExplorerDialog
      open={Boolean(purpose)}
      title={purpose ? t(explorerTitleKey(purpose)) : t('animator.chooseAsset')}
      items={purpose ? assetsForExplorer(purpose, models, media, visuals, audio) : []}
      selectedName={purpose ? explorerSelectedName(purpose, names) : undefined}
      allowNone={Boolean(purpose && explorerAllowsNone(purpose))}
      noneLabel={t('animator.none')}
      onClose={onClose}
      onChoose={item => {
        if (purpose) applyExplorerChoice(purpose, item, handlers)
        onClose()
      }}
    />
  )
}

export function SceneAnimatorNarrativeSetup({
  busy,
  templateId,
  template,
  visuals,
  media,
  hero,
  plate,
  plateLoopReady,
  prop,
  foreground,
  mood,
  intensity,
  direction,
  camera,
  palette,
  voiceSpace,
  suitability,
  onTemplateId,
  onOpenExplorer,
  onPlateLoopReady,
  onMood,
  onIntensity,
  onDirection,
  onCamera,
  onPalette,
  onVoiceSpace,
  onMount,
}: {
  busy: boolean
  templateId: NarrativeSceneId
  template: NarrativeSceneTemplate
  visuals: ApiOutput[]
  media: ApiOutput[]
  hero: string
  plate: string
  plateLoopReady: boolean
  prop: string
  foreground: string
  mood: NonNullable<NarrativeTemplateInput['controls']>['mood']
  intensity: 1 | 2 | 3
  direction: NonNullable<NarrativeTemplateInput['controls']>['direction']
  camera: NonNullable<NarrativeTemplateInput['controls']>['camera']
  palette: NonNullable<NarrativeTemplateInput['controls']>['palette']
  voiceSpace: NonNullable<NarrativeTemplateInput['controls']>['voiceSpace']
  suitability: (role: NarrativeAssetRole, name: string) => AssetSuitability
  onTemplateId: (id: NarrativeSceneId) => void
  onOpenExplorer: (purpose: AssetExplorerPurpose) => void
  onPlateLoopReady: (ready: boolean) => void
  onMood: (value: NonNullable<NarrativeTemplateInput['controls']>['mood']) => void
  onIntensity: (value: 1 | 2 | 3) => void
  onDirection: (value: NonNullable<NarrativeTemplateInput['controls']>['direction']) => void
  onCamera: (value: NonNullable<NarrativeTemplateInput['controls']>['camera']) => void
  onPalette: (value: NonNullable<NarrativeTemplateInput['controls']>['palette']) => void
  onVoiceSpace: (value: NonNullable<NarrativeTemplateInput['controls']>['voiceSpace']) => void
  onMount: () => void
}) {
  const { t } = useUiTranslation('scene3d')
  const heroFit = suitability('hero', hero)
  const plateFit = suitability('plate', plate)
  const propSlot = template.assetSlots.find(slot => slot.id === 'prop')
  const foregroundSlot = template.assetSlots.find(slot => slot.id === 'foreground')
  return (
    <div className="space-y-2 rounded border border-fuchsia-400/30 bg-fuchsia-400/[.045] p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-medium uppercase tracking-wider text-fuchsia-100">{t('animator.narrativeTitle')}</span><span className="text-[8px] text-fuchsia-200/70">{t('animator.narrativeMeta')}</span></div>
      <select value={templateId} disabled={busy} onChange={event => onTemplateId(event.target.value as NarrativeSceneId)} className="w-full rounded border border-border bg-bg-primary px-2 py-1 text-[10px]">
        {NARRATIVE_SCENE_TEMPLATES.map(item => <option key={item.id} value={item.id}>{item.experimental ? t('animator.experimental') : ''}{item.title}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-1">{NARRATIVE_SCENE_TEMPLATES.map(item => <button key={item.id} type="button" disabled={busy} onClick={() => onTemplateId(item.id)} title={item.description} className={`rounded border p-1 text-left disabled:opacity-40 ${templateId === item.id ? 'border-fuchsia-300/70 bg-fuchsia-400/15 text-fuchsia-100' : 'border-border bg-bg-primary text-text-secondary hover:border-fuchsia-300/40'}`}><span className="block truncate text-[8px] font-medium">{item.experimental ? t('animator.experimental') : ''}{item.title}</span><span className="block text-[7px] text-text-muted">{t('animator.templateMeta', { duration: item.defaultDuration, count: item.assetSlots.filter(slot => slot.required).length })}</span></button>)}</div>
      <p className="text-[8px] leading-relaxed text-text-muted">{template.description}</p>
      <AssetPickTrigger label={t('animator.character')} selected={visuals.find(asset => asset.name === hero)} placeholder={t('animator.chooseAsset')} disabled={busy} onOpen={() => onOpenExplorer('narrative-hero')} />
      {hero ? <p className={`rounded border px-1.5 py-1 text-[8px] leading-relaxed ${heroFit.level === 'warning' ? 'border-amber-300/25 bg-amber-400/[.06] text-amber-100' : 'border-emerald-300/20 bg-emerald-400/[.04] text-emerald-100'}`}>{heroFit.message}</p> : null}
      <AssetPickTrigger label={t('animator.background')} selected={media.find(asset => asset.name === plate)} placeholder={t('animator.chooseAsset')} disabled={busy} onOpen={() => onOpenExplorer('narrative-plate')} />
      {plate && plateFit.level !== 'ok' ? <p className="rounded border border-cyan-300/20 bg-cyan-400/[.04] px-1.5 py-1 text-[8px] leading-relaxed text-cyan-100">{plateFit.message}</p> : null}
      {plate ? <label className="flex items-start gap-1.5 rounded border border-amber-300/20 bg-amber-400/[.035] p-1.5 text-[8px] leading-relaxed text-amber-100"><input type="checkbox" checked={plateLoopReady} onChange={event => onPlateLoopReady(event.target.checked)} className="mt-0.5" /> <span><strong>{t('animator.loopReady')}</strong><br />{t('animator.loopReadyHelp')}</span></label> : null}
      {propSlot ? <AssetPickTrigger label={`${t('animator.objectPortal')}${propSlot.required ? '' : t('animator.optional')}`} selected={visuals.find(asset => asset.name === prop)} placeholder={t('animator.none')} disabled={busy} onOpen={() => onOpenExplorer('narrative-prop')} /> : null}
      {foregroundSlot ? <AssetPickTrigger label={t('animator.foreground')} selected={media.find(asset => asset.name === foreground)} placeholder={t('animator.none')} disabled={busy} onOpen={() => onOpenExplorer('narrative-foreground')} /> : null}
      <div className="grid grid-cols-2 gap-1 text-[9px] text-text-muted">
        {template.controls.includes('mood') ? <label>{t('animator.mood')}<select value={mood} onChange={event => onMood(event.target.value as typeof mood)} className="mt-0.5 w-full rounded border border-border bg-bg-primary px-1 py-1 text-[9px]"><option value="calm">{t('animator.moodCalm')}</option><option value="tense">{t('animator.moodTense')}</option><option value="dreamy">{t('animator.moodDreamy')}</option><option value="heroic">{t('animator.moodHeroic')}</option></select></label> : null}
        {template.controls.includes('intensity') ? <label>{t('animator.intensity')}<select value={intensity} onChange={event => onIntensity(Number(event.target.value) as 1 | 2 | 3)} className="mt-0.5 w-full rounded border border-border bg-bg-primary px-1 py-1 text-[9px]"><option value={1}>{t('animator.intensityLow')}</option><option value={2}>{t('animator.intensityMedium')}</option><option value={3}>{t('animator.intensityHigh')}</option></select></label> : null}
        {template.controls.includes('direction') ? <label>{t('animator.direction')}<select value={direction} onChange={event => onDirection(event.target.value as typeof direction)} className="mt-0.5 w-full rounded border border-border bg-bg-primary px-1 py-1 text-[9px]"><option value="right">{t('animator.right')}</option><option value="left">{t('animator.left')}</option></select></label> : null}
        {template.controls.includes('camera') ? <label>{t('animator.camera')}<select value={camera} onChange={event => onCamera(event.target.value as typeof camera)} className="mt-0.5 w-full rounded border border-border bg-bg-primary px-1 py-1 text-[9px]"><option value="restrained">{t('animator.cameraRestrained')}</option><option value="push">{t('animator.cameraPush')}</option><option value="drift">{t('animator.cameraDrift')}</option></select></label> : null}
        {template.controls.includes('palette') ? <label>{t('animator.palette')}<select value={palette} onChange={event => onPalette(event.target.value as typeof palette)} className="mt-0.5 w-full rounded border border-border bg-bg-primary px-1 py-1 text-[9px]"><option value="natural">{t('animator.paletteNatural')}</option><option value="cool">{t('animator.paletteCool')}</option><option value="warm">{t('animator.paletteWarm')}</option><option value="neon">{t('animator.paletteNeon')}</option></select></label> : null}
        {template.controls.includes('voiceSpace') ? <label>{t('animator.voiceSpace')}<select value={voiceSpace} onChange={event => onVoiceSpace(event.target.value as typeof voiceSpace)} className="mt-0.5 w-full rounded border border-border bg-bg-primary px-1 py-1 text-[9px]"><option value="center">{t('animator.center')}</option><option value="left">{t('animator.left')}</option><option value="right">{t('animator.right')}</option></select></label> : null}
      </div>
      <button type="button" disabled={busy} onClick={onMount} className="w-full rounded border border-fuchsia-300/50 bg-fuchsia-400/10 px-2 py-1.5 text-[10px] text-fuchsia-100 hover:bg-fuchsia-400/20 disabled:opacity-40">{t('animator.mountScene')}</button>
    </div>
  )
}
