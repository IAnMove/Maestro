import { useEffect, useRef, useState } from 'react'
import { useUiTranslation } from '../../i18n'
import { paintSceneFx } from './paint'
import { scheduleFx } from './audio'
import type { SceneFx } from './types'

export function SceneFxOverlay({ cues, seconds, width, height, playing = false, speed = 1, duration }: {
  cues?: SceneFx[]; seconds: number; width: number; height: number; playing?: boolean; speed?: number; duration: number
}) {
  const ref = useRef<HTMLCanvasElement>(null), audio = useRef<AudioContext | null>(null)
  const transport = useRef({ seconds, playing })
  const [blocked, setBlocked] = useState(false)
  const { t } = useUiTranslation('sceneFx')
  useEffect(() => { transport.current = { seconds, playing } }, [seconds, playing])
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height); paintSceneFx(ctx, width, height, seconds, cues)
  }, [cues, seconds, width, height])
  useEffect(() => {
    if (!playing || !cues?.some(cue => cue.sound && cue.volume)) return
    const context = new AudioContext(); audio.current = context
    let stopped = false, sources: AudioBufferSourceNode[] = []
    void context.resume().then(() => {
      if (!stopped) sources = scheduleFx(context, cues, duration, speed, transport.current.seconds)
    }).catch(() => { if (!stopped) setBlocked(true) })
    return () => { stopped = true; sources.forEach(source => source.stop()); void context.close(); audio.current = null }
  }, [cues, duration, playing, speed])
  return <>
    <canvas ref={ref} width={width} height={height} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" data-testid="scene-fx-overlay" />
    {blocked && <p role="alert">{t('audioBlocked')}</p>}
  </>
}
