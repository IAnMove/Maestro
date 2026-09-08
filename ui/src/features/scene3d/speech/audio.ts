import type { Scene3DDocument } from '../types'
import { scene3dOutputDuration, scene3dPlaybackSpeed } from '../clock'
import { safeMediaUrl } from './track'

export const MAX_VOICE_SECONDS = 90
export async function decodeVoice(url: string): Promise<AudioBuffer> {
  if (!safeMediaUrl(url)) throw new Error('Invalid voice URL.')
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error('Voice could not be loaded.')
  if (Number(response.headers.get('content-length')) > 32 * 1024 * 1024) throw new Error('Voice file exceeds 32 MB.')
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > 32 * 1024 * 1024) throw new Error('Voice file exceeds 32 MB.')
  const context = new OfflineAudioContext(1, 1, 48000)
  const decoded = await context.decodeAudioData(bytes)
  if (decoded.duration > MAX_VOICE_SECONDS) throw new Error('Use a voice clip up to 90 seconds.')
  return decoded
}
export async function voiceWav(buffer: AudioBuffer): Promise<ArrayBuffer> {
  const context = new OfflineAudioContext(1, Math.ceil(buffer.duration * 16000), 16000)
  const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination); source.start()
  const samples = (await context.startRendering()).getChannelData(0)
  const bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes)
  const str = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  str(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  str(36, 'data'); view.setUint32(40, samples.length * 2, true)
  samples.forEach((value, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true))
  return bytes
}
export function voiceSchedule(start: number, offset: number, audioDuration: number, sceneDuration: number, speed: number) {
  return { when: start / speed, offset, rate: speed, duration: Math.max(0, Math.min(audioDuration - offset, sceneDuration - start)) }
}
export async function mixSceneSpeech(document: Scene3DDocument): Promise<AudioBuffer | undefined> {
  const tracks = document.slots.flatMap(slot => slot.speech?.enabled && slot.speech.audio ? [slot.speech] : [])
  if (!tracks.length) return undefined
  const duration = scene3dOutputDuration(document), speed = scene3dPlaybackSpeed(document.playbackSpeed)
  // Bound memory explicitly; silent scenes retain the existing 600 s export contract.
  if (duration > 180) throw new Error('Voice exports support up to 180 output seconds per scene.')
  const context = new OfflineAudioContext(1, Math.ceil(duration * 48000), 48000)
  const buffers = new Map<string, Promise<AudioBuffer>>()
  for (const track of tracks) {
    const url = track.audio!.url
    if (!buffers.has(url)) buffers.set(url, decodeVoice(url))
    const buffer = await buffers.get(url)!
    const schedule = voiceSchedule(track.start, track.offset, buffer.duration, document.duration, speed)
    if (schedule.duration <= 0) continue
    const source = context.createBufferSource(), gain = context.createGain()
    source.buffer = buffer; source.playbackRate.value = schedule.rate; gain.gain.value = track.gain
    source.connect(gain); gain.connect(context.destination)
    source.start(schedule.when, schedule.offset, schedule.duration)
  }
  return context.startRendering()
}
