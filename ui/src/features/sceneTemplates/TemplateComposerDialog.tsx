import { useEffect, useRef, useState } from 'react'
import { ModalShell } from '../../components/common/ModalShell'
import { useUiTranslation } from '../../i18n'
import type { Scene } from '../../types'
import { ALL_SCENE_TEMPLATES, getCandidateSceneTemplate, type SceneTemplateDefinition, type TemplateSlotName } from './catalog'
import { catalogBindingIssue, resolveCatalogBindings, type CatalogSelections } from './catalogBindings'
import { compileCandidateScene } from './compile'
import { TemplateAssetPicker } from './TemplateAssetPicker'
import { importApprovedReference } from './referenceImport'
import { TemplateReferencePanel } from './TemplateReferencePanel'
import { TemplateComponentHelp } from './TemplateComponentHelp'

const SLOT_COPY = {
  hero: 'composer.slot.hero',
  plate: 'composer.slot.plate',
  prop: 'composer.slot.prop',
  foreground: 'composer.slot.foreground',
  subject_1: 'composer.slot.subject_1',
  subject_2: 'composer.slot.subject_2',
  background: 'composer.slot.background',
  prop_1: 'composer.slot.prop_1',
} as const

const PULSE_IDS = new Set(['music-pulse', 'music-duet', 'music-chorus', 'music-orbit', 'music-stage', 'music-finale'])
const inputClass = 'mt-1 w-full rounded border border-border bg-bg-primary p-2 text-xs'

interface Props {
  workspace: string
  onClose: () => void
  onApply: (scene: Scene) => boolean
}

/** Mounted only while open: changing template/workspace discards stale bindings
 * and cancels pending catalog lookups, never a background generation request. */
export function TemplateComposerDialog({ workspace, onClose, onApply }: Props) {
  const { t } = useUiTranslation('scene3d')
  const [id, setId] = useState(ALL_SCENE_TEMPLATES[0].id)
  const template = getCandidateSceneTemplate(id)
  return <ModalShell open title={t('composer.title')} onClose={onClose} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
    <div className="max-h-[90vh] w-[880px] max-w-full space-y-4 overflow-y-auto rounded-xl border border-border bg-bg-secondary p-4 text-text-primary">
      <header className="flex items-center justify-between gap-4"><h2 className="font-semibold">{t('composer.heading')}</h2><button type="button" onClick={onClose} className="rounded border border-border px-3 py-1">{t('composer.close')}</button></header>
      <p className="text-xs text-text-secondary">{t('composer.intro', { count: ALL_SCENE_TEMPLATES.length })}</p>
      <label className="block text-xs">{t('composer.action')}
        <select aria-label={t('composer.action')} value={id} onChange={event => setId(event.target.value)} className={inputClass}>
          {ALL_SCENE_TEMPLATES.map(item => <option key={item.id} value={item.id}>{item.family} · {item.title}</option>)}
        </select>
      </label>
      <TemplateComposerForm key={`${workspace}:${id}`} template={template} workspace={workspace} onClose={onClose} onApply={onApply} />
    </div>
  </ModalShell>
}

function TemplateComposerForm({ template, workspace, onClose, onApply }: Props & { template: SceneTemplateDefinition }) {
  const { t } = useUiTranslation('scene3d')
  const [selections, setSelections] = useState<CatalogSelections>({})
  const [activeSlot, setActiveSlot] = useState<TemplateSlotName>(template.slots[0].id)
  const [duration, setDuration] = useState(template.defaultDuration)
  const [bpm, setBpm] = useState(120)
  const [intensity, setIntensity] = useState(.6)
  const [replaceConfirmed, setReplaceConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const slot = template.slots.find(item => item.id === activeSlot)!
  const rhythmic = PULSE_IDS.has(template.id)
  const missing = template.slots.some(item => item.required && !selections[item.id])

  const apply = async () => {
    if (busy || missing || !replaceConfirmed) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    try {
      const bindings = await resolveCatalogBindings(template, selections, workspace, controller.signal)
      if (controller.signal.aborted) return
      const scene = compileCandidateScene(template.id, bindings, { duration, bpm, intensity })
      if (onApply(scene)) onClose()
      else setError(t('composer.reject'))
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t('composer.createFailed'))
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  const openOriginal = async (file: File) => {
    if (busy || !replaceConfirmed) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    try {
      const scene = await importApprovedReference(file, template)
      if (!controller.signal.aborted && onApply(scene)) onClose()
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t('composer.openOriginalFailed'))
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return <div className="space-y-4">
    <p className="text-xs">{template.description}</p>
    <TemplateReferencePanel templateId={template.id} disabled={busy || !replaceConfirmed} onOpen={file => void openOriginal(file)} />
    <TemplateComponentHelp templateId={template.id} />
    <ul className="list-disc pl-5 text-xs text-text-muted">{template.limits.map(limit => <li key={limit}>{limit}</li>)}</ul>
    <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
      <legend className="mb-2 text-xs">{t('composer.assetsOf', { workspace })}</legend>
      <div className="grid gap-2 sm:grid-cols-2">{template.slots.map(item => <div key={item.id} className={`rounded border p-2 text-xs ${activeSlot === item.id ? 'border-cyan-400' : 'border-border'}`}>
        <button type="button" aria-pressed={activeSlot === item.id} onClick={() => setActiveSlot(item.id)} className="block w-full text-left font-medium">{t(SLOT_COPY[item.id])} {item.required ? t('composer.required') : t('composer.optional')}</button>
        <p className="mt-1 font-mono text-cyan-200">{item.id} · {item.kinds.join(', ')}</p>
        <p className="mt-1 text-text-muted">{item.description}</p>
        <p className="mt-1 break-all">{selections[item.id]?.filename || t('composer.unassigned')}</p>
        {selections[item.id] && <><p className="break-all text-[10px] text-text-muted">ID: {selections[item.id]!.id}</p><button type="button" aria-label={t('composer.removeAria', { slot: t(SLOT_COPY[item.id]) })} onClick={() => setSelections(current => ({ ...current, [item.id]: undefined }))} className="mt-1 text-rose-200">{t('composer.remove')}</button></>}
      </div>)}</div>
      <p className="text-xs">{t('composer.assignHelp', { slot: t(SLOT_COPY[slot.id]) })}</p>
      <TemplateAssetPicker key={slot.id} workspace={workspace} kinds={slot.kinds} selected={selections[slot.id]} selectedId={selections[slot.id]?.id} optional={!slot.required} disabledReason={item => catalogBindingIssue(item, workspace, slot)} onPick={item => { setSelections(current => ({ ...current, [slot.id]: item })); setError('') }} onClear={() => setSelections(current => ({ ...current, [slot.id]: undefined }))} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">{t('composer.duration')}<input aria-label={t('composer.duration')} type="number" min={3} max={12} step={1} value={duration} onChange={event => setDuration(Number(event.target.value))} className={inputClass} /></label>
        <label className="text-xs">{t('composer.visualBpm')} {!rhythmic && '×'}<input aria-label={t('composer.visualBpm')} disabled={!rhythmic} type="number" min={40} max={220} value={bpm} onChange={event => setBpm(Number(event.target.value))} className={inputClass} /></label>
        <label className="text-xs">{t('composer.pulseIntensity')} {!rhythmic && '×'}<input aria-label={t('composer.pulseIntensity')} disabled={!rhythmic} type="number" min={0} max={1} step={.1} value={intensity} onChange={event => setIntensity(Number(event.target.value))} className={inputClass} /></label>
      </div>
      <p className="text-xs text-text-muted">{rhythmic ? t('composer.pulseHelp') : t('composer.noPulseHelp')}</p>
      <p className="text-xs text-amber-100">{t('composer.stillWarning')}</p>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={replaceConfirmed} onChange={event => setReplaceConfirmed(event.target.checked)} />{t('composer.replaceConfirm')}</label>
    </fieldset>
    {error && <p role="alert" className="text-xs text-rose-200">{error}</p>}
    <button type="button" onClick={() => void apply()} disabled={busy || missing || !replaceConfirmed} className="rounded border border-cyan-300/50 bg-cyan-400/10 px-4 py-2 text-sm disabled:opacity-40">{busy ? t('composer.checking') : t('composer.createOpen')}</button>
  </div>
}
