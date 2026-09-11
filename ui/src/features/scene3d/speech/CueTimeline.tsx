import { useEffect, useRef, useState } from 'react'
import { useUiTranslation } from '../../../i18n'
import { VISEMES, type Scene3DSpeech, type Viseme } from './types'
import { decodeVoice } from './audio'
import { safeMediaUrl } from './track'
import { SpeechNumber, speechInput } from './FaceControls'
import { addSilence, clipInterval, moveCueBound, setCueViseme, sourceToScene, waveformPeaks, type CueInterval } from './cueEdit'

export function CueTimeline({ speech, disabled, onChange, onReanalyze, analyzing }: {
  speech: Scene3DSpeech
  disabled: boolean
  onChange: (speech: Scene3DSpeech) => void
  onReanalyze?: (from: number, to: number) => void
  analyzing?: boolean
}) {
  const { t } = useUiTranslation('scene3dEditor')
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ from: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [loop, setLoop] = useState(false)
  const [selection, setSelection] = useState<CueInterval>()
  const [selected, setSelected] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [peaks, setPeaks] = useState<number[]>([])
  const [playhead, setPlayhead] = useState(0)
  const url = speech.audio && safeMediaUrl(speech.audio.url) ? speech.audio.url : ''
  const span = Math.max(url ? audioDuration : 0, speech.cues.at(-1)?.end ?? 0, speech.offset + .1, .1)
  const cue = speech.cues[Math.min(selected, Math.max(0, speech.cues.length - 1))]
  const source = selection?.start ?? playhead
  const clock = Number.isFinite(source) ? source : 0
  const bars = url ? peaks : []
  useEffect(() => {
    if (!url) return
    let live = true
    void decodeVoice(url).then(buffer => {
      if (!live) return
      setAudioDuration(buffer.duration)
      setPeaks(waveformPeaks(buffer.getChannelData(0), 80))
    }).catch(() => { if (live) setPeaks([]) })
    return () => { live = false }
  }, [url])
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !loop || !selection) return
    const tick = () => {
      if (audio.currentTime < selection.start || audio.currentTime >= selection.end - .02) audio.currentTime = selection.start
    }
    tick(); audio.addEventListener('timeupdate', tick)
    return () => audio.removeEventListener('timeupdate', tick)
  }, [loop, selection])
  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || !Number.isFinite(clientX)) return 0
    return Math.min(span, Math.max(0, ((clientX - rect.left) / rect.width) * span))
  }
  const chooseSelection = (start: number, end: number) => {
    const next = clipInterval(start, end, 0, span)
    if (next) setSelection(next)
  }
  const percent = (time: number) => `${(time / span) * 100}%`
  const locked = disabled || Boolean(analyzing)
  return <section data-testid="speech-cue-timeline" className="space-y-2 rounded-lg border border-border p-2">
    <fieldset disabled={locked} className="space-y-2 disabled:opacity-60">
    <h4 className="text-xs font-semibold text-text-primary">{t('speech.timeline.title')}</h4>
    <p className="text-xs leading-5">{t('speech.timeline.clocks')}</p>
    <p className="text-xs text-cyan-200" role="status" data-testid="speech-cue-clocks">
      {t('speech.timeline.sourceTime', { seconds: clock.toFixed(2) })} · {t('speech.timeline.offsetTime', { seconds: speech.offset.toFixed(2) })} · {t('speech.timeline.sceneTime', { seconds: sourceToScene(clock, speech).toFixed(2) })}
    </p>
    <div className="overflow-x-auto">
      <div ref={trackRef} data-testid="speech-cue-track" className="relative min-h-24" style={{ width: `${Math.max(100, zoom * 100)}%` }}
        onPointerDown={event => {
          if (locked) return
          drag.current = { from: timeAt(event.clientX) }
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={event => { if (!drag.current) return; chooseSelection(drag.current.from, timeAt(event.clientX)) }}
        onPointerUp={() => { drag.current = null }}>
        <div className="flex h-12 items-end gap-px rounded bg-slate-900 px-px" aria-label={t('speech.timeline.waveform')} data-testid="speech-cue-waveform">
          {(bars.length ? bars : [0]).map((peak, i) => <span key={i} className="flex-1 bg-cyan-300/80" style={{ height: `${Math.max(6, peak * 100)}%` }} />)}
        </div>
        <div className="relative h-10">
          {speech.cues.map((item, index) => <button key={index} type="button" data-testid={`speech-cue-${index}`} data-manual={item.manual ? 'true' : 'false'}
            disabled={locked} aria-pressed={item === cue} aria-label={`${item.viseme} ${item.start.toFixed(2)}–${item.end.toFixed(2)}`}
            className={`absolute top-1 h-8 overflow-hidden rounded border px-1 text-[10px] ${item.manual ? 'border-amber-300 bg-amber-300/20 text-amber-100' : 'border-cyan-400/70 bg-cyan-400/10 text-cyan-100'} ${item === cue ? 'ring-1 ring-white' : ''}`}
            style={{ left: percent(item.start), width: percent(item.end - item.start) }}
            onClick={() => setSelected(index)}>{item.viseme}{item.manual ? ` · ${t('speech.timeline.manual')}` : ''}</button>)}
          {selection && selection.end > selection.start && <div data-testid="speech-cue-selection" className="pointer-events-none absolute inset-y-0 border border-dashed border-white/70 bg-white/10"
            style={{ left: percent(selection.start), width: percent(selection.end - selection.start) }} />}
          <div className="pointer-events-none absolute inset-y-0 w-px bg-lime-300" style={{ left: percent(speech.offset) }} title={t('speech.offset')} />
          <div className="pointer-events-none absolute inset-y-0 w-px bg-white/80" style={{ left: percent(playhead) }} />
        </div>
      </div>
    </div>
    <label className="flex items-center gap-2 text-xs">{t('speech.timeline.zoom')}
      <input className="w-32" type="range" min={1} max={8} step={.5} value={zoom} disabled={locked} aria-label={t('speech.timeline.zoom')}
        onChange={event => setZoom(Number(event.target.value))} />
    </label>
    {url && <audio ref={audioRef} controls src={url} preload="metadata" className="w-full min-w-0" aria-label={t('speech.voicePreview')}
      onTimeUpdate={event => setPlayhead(event.currentTarget.currentTime)} />}
    {!url && <p className="text-xs text-text-muted">{t('speech.timeline.noAudio')}</p>}
    <div className="flex flex-wrap gap-3">
      <SpeechNumber label={t('speech.timeline.selectStart')} value={selection?.start ?? 0} min={0} max={span} step={.01}
        onChange={start => chooseSelection(start, selection?.end ?? start + .1)} />
      <SpeechNumber label={t('speech.timeline.selectEnd')} value={selection?.end ?? 0} min={0} max={span} step={.01}
        onChange={end => chooseSelection(selection?.start ?? 0, end)} />
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={speechInput} disabled={locked || !selection || !url} aria-pressed={loop}
        onClick={() => { setLoop(value => !value); const audio = audioRef.current; if (audio && selection) { audio.currentTime = selection.start; void audio.play?.().catch(() => {}) } }}>{t('speech.timeline.loop')}</button>
      <button type="button" className={speechInput} disabled={locked || !selection} onClick={() => selection && onChange({ ...speech, cues: addSilence(speech.cues, selection.start, selection.end) })}>{t('speech.timeline.addSilence')}</button>
      <button type="button" className={speechInput} disabled={locked || !selection || !onReanalyze} onClick={() => selection && onReanalyze(selection.start, selection.end)}>{t('speech.timeline.reanalyze')}</button>
    </div>
    {selection && <p className="text-xs">{t('speech.timeline.selection', { start: selection.start.toFixed(2), end: selection.end.toFixed(2) })}</p>}
    {cue && <div className="flex flex-wrap gap-3">
      <label className="flex items-center gap-2 text-xs">{t('speech.timeline.viseme')}
        <select className={speechInput} aria-label={t('speech.timeline.viseme')} disabled={locked} value={cue.viseme}
          onChange={event => onChange({ ...speech, cues: setCueViseme(speech.cues, speech.cues.indexOf(cue), event.target.value as Viseme) })}>
          {VISEMES.map(viseme => <option key={viseme} value={viseme}>{viseme}</option>)}
        </select>
      </label>
      <SpeechNumber label={t('speech.timeline.cueStart')} value={cue.start} min={0} max={cue.end} step={.01}
        onChange={start => onChange({ ...speech, cues: moveCueBound(speech.cues, speech.cues.indexOf(cue), 'start', start) })} />
      <SpeechNumber label={t('speech.timeline.cueEnd')} value={cue.end} min={cue.start} max={600} step={.01}
        onChange={end => onChange({ ...speech, cues: moveCueBound(speech.cues, speech.cues.indexOf(cue), 'end', end) })} />
      {cue.manual && <p className="text-xs text-amber-200">{t('speech.timeline.manual')}</p>}
    </div>}
    </fieldset>
  </section>
}
