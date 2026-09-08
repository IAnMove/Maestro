import { useEffect, useRef, useState } from 'react'
import type { Scene3DDocument } from '../types'
import { scene3dPlaybackSpeed } from '../clock'
import { useUiTranslation } from '../../../i18n'

export function SceneSpeechAudio({ document, seconds, playing }: { document: Scene3DDocument; seconds: number; playing: boolean }) {
  const { t } = useUiTranslation('scene3dEditor')
  const players = useRef(new Map<string, HTMLAudioElement>())
  const [failed, setFailed] = useState(false)
  useEffect(() => () => { for (const audio of players.current.values()) { audio.pause(); audio.removeAttribute('src'); audio.load() } players.current.clear() }, [])
  useEffect(() => {
    const wanted = new Set<string>()
    for (const slot of document.slots) {
      const voice = slot.speech
      if (!voice?.enabled || !voice.audio) continue
      wanted.add(slot.id)
      let audio = players.current.get(slot.id)
      if (!audio || audio.dataset.source !== voice.audio.url) {
        audio?.pause(); audio = new Audio(voice.audio.url); audio.dataset.source = voice.audio.url; audio.preload = 'auto'
        // Match offline export: changing scene speed changes voice pitch, too.
        audio.preservesPitch = false
        players.current.set(slot.id, audio)
      }
      const local = seconds - voice.start + voice.offset, active = playing && seconds >= voice.start && (!Number.isFinite(audio.duration) || local < audio.duration)
      audio.volume = Math.min(1, voice.gain); audio.playbackRate = scene3dPlaybackSpeed(document.playbackSpeed)
      if (!active) audio.pause()
      if (audio.readyState > 0 && Math.abs(audio.currentTime - Math.max(0, local)) > .12) audio.currentTime = Math.max(0, local)
      if (active && audio.paused) void audio.play().catch(() => setFailed(true))
    }
    for (const [id, audio] of players.current) if (!wanted.has(id)) { audio.pause(); audio.removeAttribute('src'); audio.load(); players.current.delete(id) }
  }, [document, seconds, playing])
  return failed ? <p role="alert" className="text-xs text-amber-300">{t('speech.audioBlocked')}</p> : null
}
