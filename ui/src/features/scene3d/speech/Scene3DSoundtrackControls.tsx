import { useUiTranslation } from '../../../i18n'
import type { Scene3DSoundtrack } from './types'
import { SpeechNumber } from './FaceControls'

export function Scene3DSoundtrackControls({ tracks, disabled, onChange }: {
  tracks?: Scene3DSoundtrack[]; disabled: boolean; onChange: (tracks: Scene3DSoundtrack[]) => void
}) {
  const { t } = useUiTranslation('scene3dEditor')
  if (!tracks?.length) return null
  return <details className="rounded-lg border border-border bg-bg-secondary p-3 text-xs">
    <summary className="cursor-pointer">{t('speech.soundtrack')}</summary>
    <p className="my-2 text-text-muted">{t('speech.soundtrackHint')}</p>
    <fieldset disabled={disabled} className="space-y-2">
      {tracks.map(track => <div key={track.id} className="flex flex-wrap items-center gap-3">
        <span>{track.audio.filename} · {track.offset.toFixed(2)} s → {track.start.toFixed(2)}–{track.end?.toFixed(2) ?? '…'} s</span>
        <SpeechNumber label={t('speech.gain')} value={track.gain} min={0} max={1} step={.05}
          onChange={gain => onChange(tracks.map(item => item.id === track.id ? { ...item, gain } : item))} />
      </div>)}
    </fieldset>
  </details>
}
