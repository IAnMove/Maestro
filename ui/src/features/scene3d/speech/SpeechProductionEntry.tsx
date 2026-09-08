import { useEffect, useRef, useState } from 'react'
import { useUiTranslation } from '../../../i18n'
import { useStore } from '../../../stores/useStore'
import { fetchOutputs, type ApiOutput } from '../../../api/client'
import { AssetInput } from '../../asset-picker/AssetInput'
import { sourceRefFromOutput } from '../slotSource'
import type { Scene3DSourceRef } from '../types'
import type { SpeechProductionInput } from './production'
import { speechInput, SpeechNumber } from './FaceControls'

type ProductionEntryProps = {
  kind: SpeechProductionInput['kind']; title: string; sourceId?: string; audio?: Scene3DSourceRef
  cast?: { id: string; name: string }[]; lines?: SpeechProductionInput['lines']; workspace?: string
}
export function SpeechProductionEntry(props: ProductionEntryProps) {
  const active = useStore(s => s.activeWorkspace), workspace = props.workspace ?? active
  return <ScopedSpeechProductionEntry key={workspace + '/' + (props.sourceId ?? props.title)} {...props} workspace={workspace} />
}
function ScopedSpeechProductionEntry({ kind, title, sourceId, audio, cast = [{ id: 'speaker', name: '' }], lines, workspace }: ProductionEntryProps & { workspace: string }) {
  const { t } = useUiTranslation('scene3dEditor')
  const [open, setOpen] = useState(false), [items, setItems] = useState<ApiOutput[]>([])
  const [models, setModels] = useState<Record<string, ApiOutput | undefined>>({})
  const [voice, setVoice] = useState<ApiOutput | undefined>()
  const [offset, setOffset] = useState(0), [duration, setDuration] = useState(8)
  const [phonetic, setPhonetic] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const job = useRef<AbortController | null>(null)
  useEffect(() => {
    let live = true
    if (open) void Promise.all([fetchOutputs(200, 0, { mediaType: 'model3d', workspace }), fetchOutputs(200, 0, { mediaType: 'audio', workspace })])
      .then(results => { if (live) setItems(results.flatMap(r => r.outputs)) }).catch(() => {})
    return () => { live = false; job.current?.abort() }
  }, [workspace, open])
  const source = voice ? sourceRefFromOutput(voice, workspace) : audio
  const value: ApiOutput | undefined = voice ?? (audio ? { name: audio.filename, url: audio.url, type: 'audio', mode: null, size: 0, created_at: 0, thumbnail_url: '', workspace_id: audio.workspaceId } : undefined)
  return <details className="my-3 rounded-xl border border-border bg-bg-secondary p-3" onToggle={e => {
    setOpen(e.currentTarget.open)
    if (!e.currentTarget.open) { job.current?.abort(); setBusy(false) }
  }}>
    <summary className="cursor-pointer text-sm font-medium text-text-primary">{t('speech.productionEntry')}</summary>
    {open && <fieldset disabled={busy} className="mt-3 space-y-3 text-xs">
      <p>{t('speech.productionHint')}</p>
      {cast.length > 2 ? <p role="alert">{t('speech.twoSpeakers')}</p> : cast.map(character => <AssetInput key={character.id}
        label={character.name || t('speech.character')} placeholder={t('speech.chooseModel')} items={items.filter(i => i.type === 'model3d')} value={models[character.id]}
        accept=".glb,model/gltf-binary" workspaceId={workspace} disabled={busy} constraints={{ kinds: ['model3d'], maxCount: 1, optional: false }}
        onChoose={item => setModels(previous => ({ ...previous, [character.id]: item ?? undefined }))} />)}
      <AssetInput label={t('speech.voice')} placeholder={t('speech.pickVoice')} items={items.filter(i => i.type === 'audio')} value={value} accept="audio/*"
        workspaceId={workspace} disabled={busy} constraints={{ kinds: ['audio'], maxCount: 1, optional: false }} onChoose={item => setVoice(item ?? undefined)} />
      <SpeechNumber label={t('speech.offset')} value={offset} min={0} max={599} step={.1} onChange={setOffset} />
      <SpeechNumber label={t('duration')} value={duration} min={.1} max={90} step={.1} onChange={setDuration} />
      <label className="flex items-center gap-2"><input type="checkbox" checked={phonetic} onChange={e => setPhonetic(e.target.checked)} />{t('speech.analyze')}</label>
      <p className="text-text-muted">{t('speech.phoneticHint')}</p>
      {!phonetic && <p className="text-amber-200">{t('speech.amplitudeHint')}</p>}
      <button type="button" className={speechInput} disabled={busy || !source || !cast.length || cast.length > 2 || cast.some(c => !models[c.id])}
        onClick={() => {
          if (!source) return
          setBusy(true); setError(''); job.current = new AbortController()
          const captured = job.current
          void import('./prepareProduction').then(async ({ prepareSpeechProduction, openSpeechProduction }) => {
            const document = await prepareSpeechProduction({ kind, title, sourceId, workspace, audio: source, duration, offset, lines,
              cast: cast.map(c => ({ ...c, model: sourceRefFromOutput(models[c.id]!, workspace) })) }, phonetic, captured.signal)
            if (!captured.signal.aborted) openSpeechProduction(document)
          }).catch(reason => { if (!captured.signal.aborted) setError(reason.message) }).finally(() => { if (!captured.signal.aborted) setBusy(false) })
        }}>{busy ? t('speech.busy') : t('speech.openProduction')}</button>
      {error && <p role="alert" className="text-red-300">{error}</p>}
    </fieldset>}
  </details>
}
