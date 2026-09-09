import { useEffect, useRef, useState } from 'react'
import type { ApiOutput } from '../../../api/outputs'
import { fetchOutputs } from '../../../api/client'
import { analyzeSceneSpeech } from '../../../api/scene3dSpeech'
import { AssetInput } from '../../asset-picker/AssetInput'
import { useUiTranslation } from '../../../i18n'
import type { Scene3DSlot } from '../types'
import { sourceRefFromOutput } from '../slotSource'
import { FACE_PROFILES, type FaceProfile } from './calibration'
import { defaultSpeech, type FacePlacement, type Scene3DSpeech } from './types'
import { amplitudeCues, parseMouthCues } from './track'
import { decodeVoice, voiceWav } from './audio'
import { importSpeechKit } from './kit'
import { FaceControls, SpeechNumber, speechInput } from './FaceControls'

export type SpeechControlsProps = {
  slot: Scene3DSlot; workspace: string; disabled: boolean
  calibrate: (profile: FaceProfile) => FacePlacement | undefined
  onChange: (speech: Scene3DSpeech) => void
  onImport: (patch: Partial<Scene3DSlot>) => void
  onFit: (duration: number) => void
  onBusyChange?: (busy: boolean) => void
}
export function Scene3DSpeechControls({ slot, workspace, disabled, calibrate, onChange, onImport, onFit, onBusyChange }: SpeechControlsProps) {
  const { t } = useUiTranslation('scene3dEditor')
  const { t: sceneT } = useUiTranslation('scene3d')
  const speech = slot.speech ?? defaultSpeech()
  const [items, setItems] = useState<ApiOutput[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [profile, setProfile] = useState<FaceProfile>('generic')
  const [jobs] = useState(() => ({ serial: 0, controller: null as AbortController | null }))
  const jsonInput = useRef<HTMLInputElement>(null), kitInput = useRef<HTMLInputElement>(null)
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false) }, [busy, onBusyChange])
  useEffect(() => {
    let alive = true
    void fetchOutputs(200, 0, { mediaType: 'audio', workspace }).then(result => { if (alive) setItems(result.outputs.filter(item => item.type === 'audio')) }).catch(() => {})
    return () => { alive = false; jobs.serial++; jobs.controller?.abort() }
  }, [workspace, jobs])
  const run = async (task: (signal: AbortSignal) => Promise<() => void>) => {
    const generation = ++jobs.serial
    jobs.controller?.abort(); jobs.controller = new AbortController()
    setBusy(true); setError('')
    try {
      const commit = await task(jobs.controller.signal)
      if (generation === jobs.serial && !jobs.controller.signal.aborted) commit()
    } catch (caught) {
      if (generation === jobs.serial && !jobs.controller.signal.aborted) setError(caught instanceof Error ? caught.message : String(caught))
    } finally { if (generation === jobs.serial) setBusy(false) }
  }
  const chooseVoice = (item: ApiOutput | null) => {
    if (disabled) return
    if (!item) { jobs.serial++; jobs.controller?.abort(); setBusy(false); onChange({ ...speech, audio: undefined, cues: [] }); return }
    if (item.type !== 'audio') return
    void run(async () => {
      const buffer = await decodeVoice(item.url)
      return () => onChange({ ...speech, audio: sourceRefFromOutput(item, workspace), cues: amplitudeCues(buffer), driver: 'amplitude' })
    })
  }
  const audioValue = speechAudioOutput(speech)
  return <section data-testid="scene3d-speech" className="space-y-3 rounded-xl border border-border bg-bg-secondary p-3 text-text-secondary">
    <h3 className="text-sm font-semibold text-text-primary">{t('speech.option')} · {slot.character?.name || sceneT(`stage.slot.${slot.slot}`)}</h3>
    <p className="text-xs leading-5">{t('speech.intro')}</p>
    {!slot.sourceUrl && <p className="text-xs text-text-muted">{t('speech.chooseModel')}</p>}
    <fieldset disabled={disabled || busy} className="space-y-3 disabled:opacity-60">
      <div className="flex flex-wrap items-center gap-3">
        {slot.sourceUrl && <label className="text-xs"><input type="checkbox" checked={Boolean(slot.speech?.enabled)} onChange={e => onChange({ ...speech, enabled: e.target.checked })} /> {t('speech.enabled')}</label>}
        <select aria-label={t('speech.profile')} className={speechInput} value={profile} onChange={e => setProfile(e.target.value as FaceProfile)}>
          {FACE_PROFILES.map(item => <option key={item} value={item}>{item === 'generic' ? t('speech.generic') : item}</option>)}</select>
        <button type="button" disabled={!slot.sourceUrl} className={speechInput} onClick={() => {
          const face = calibrate(profile)
          if (face) { onChange({ ...speech, face }); setError('') } else setError(t('speech.noFace'))
        }}>{t('speech.calibrate')}</button>
      </div>
      <AssetInput label={t('speech.voice')} placeholder={t('speech.pickVoice')} items={items} value={audioValue} optional
        disabled={disabled || busy || !slot.sourceUrl} workspaceId={workspace} accept="audio/*" constraints={{ kinds: ['audio'], maxCount: 1, optional: true }} onChoose={chooseVoice} />
      <div className="flex flex-wrap gap-3">
        <button type="button" className={speechInput} disabled={!speech.audio} onClick={() => void run(async signal => {
          const buffer = await decodeVoice(speech.audio!.url)
          const duration = Math.min(buffer.duration - speech.offset, (speech.end ?? speech.start + buffer.duration - speech.offset) - speech.start)
          const localCues = await analyzeSceneSpeech(await voiceWav(buffer, speech.offset, duration), signal)
          const cues = localCues.map(cue => ({ ...cue, start: cue.start + speech.offset, end: cue.end + speech.offset }))
          return () => onChange({ ...speech, cues, driver: 'rhubarb' })
        })}>{t('speech.analyze')}</button>
        <button type="button" className={speechInput} disabled={!speech.cues.length} onClick={() => onFit(Math.max(.1, speech.start + (speech.cues.at(-1)?.end ?? 0) - speech.offset))}>{t('speech.fit')}</button>
      </div>
      <p className="text-xs text-cyan-200" role="status">{t(`speech.driver.${speech.driver}`)} · {t('speech.cues', { count: speech.cues.length })}</p>
      {speech.driver === 'amplitude' && <p className="text-xs text-amber-200">{t('speech.amplitudeHint')}</p>}
      <div className="flex flex-wrap gap-3">
        <SpeechNumber label={t('speech.start')} value={speech.start} min={0} max={600} step={.1} onChange={start => onChange({ ...speech, start })} />
        <SpeechNumber label={t('speech.offset')} value={speech.offset} min={0} max={600} step={.1} onChange={offset => onChange({ ...speech, offset })} />
        <SpeechNumber label={t('speech.gain')} value={speech.gain} min={0} max={1} step={.05} onChange={gain => onChange({ ...speech, gain })} />
      </div>
      <FaceControls speech={speech} onChange={onChange} />
      <details className="rounded-lg border border-border p-2">
        <summary className="cursor-pointer text-xs">{t('speech.advancedImport')}</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={speechInput} onClick={() => kitInput.current?.click()}>{t('speech.importKit')}</button>
          <button type="button" className={speechInput} onClick={() => jsonInput.current?.click()}>{t('speech.importCues')}</button>
        </div>
      </details>
      <input ref={jsonInput} type="file" accept=".json,application/json" className="hidden" data-testid="speech-cues-file" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''
        if (file) void run(async () => {
          if (file.size > 2 * 1024 * 1024) throw new Error('Cues JSON exceeds 2 MB.')
          const cues = parseMouthCues(JSON.parse(await file.text()))
          return () => onChange({ ...speech, cues, driver: 'imported' })
        })
      }} />
      <input ref={kitInput} type="file" accept=".zip,application/zip" className="hidden" data-testid="speech-kit-file" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''
        if (file) void run(async signal => {
          const patch = await importSpeechKit(file, workspace, signal)
          return () => onImport(patch)
        })
      }} />
    </fieldset>
    {!speech.face && <p className="text-xs text-amber-200">{t('speech.needsPlacement')}</p>}
    {busy && <p role="status" className="text-xs">{t('speech.busy')}</p>}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </section>
}

function speechAudioOutput(speech: Scene3DSpeech): ApiOutput | undefined {
  return speech.audio ? { name: speech.audio.filename, url: speech.audio.url, type: 'audio', mode: null, size: 0,
    created_at: 0, thumbnail_url: '', workspace_id: speech.audio.workspaceId, asset_id: speech.audio.assetId } : undefined
}
