import { FX_CATALOG, fxRandom, type SceneFx } from './types'

/** Small procedural Foley palette; these sounds are synthesized locally, not AI output. */
export function fxSamples(cue: SceneFx, sampleRate: number, offset = 0, duration = cue.end - cue.start - offset): Float32Array<ArrayBuffer> {
  const seconds = cue.end - cue.start
  const sound = FX_CATALOG.find(item => item.id === cue.kind)?.sound
  const data = new Float32Array(Math.ceil(duration * sampleRate))
  for (let i = 0; i < data.length; i++) {
    const t = offset + i / sampleRate, p = t / seconds, noise = fxRandom(cue.seed, Math.round(offset * sampleRate) + i) * 2 - 1
    const edge = Math.min(1, t * 50, (seconds - t) * 20)
    let value = 0
    switch (sound) {
      case 'impact': value = (Math.sin(2 * Math.PI * (65 * t - 8 * t * t)) + noise * .5) * Math.exp(-t * 7); break
      case 'crackle': value = noise * Math.pow(Math.max(0, Math.sin(t * 73)), 18) * .65; break
      case 'rain': value = noise * .22; break
      case 'wind': value = noise * (.08 + .08 * Math.sin(t * 3)); break
      case 'pop': value = Math.sin(2 * Math.PI * 350 * t) * Math.exp(-(t % .4) * 80) * .6; break
      case 'chime': value = (Math.sin(t * 2 * Math.PI * 880) + Math.sin(t * 2 * Math.PI * 1320) * .3) * Math.exp(-t * 2) * .5; break
      case 'rise': value = Math.sin(2 * Math.PI * (120 * t + 100 * t * t / seconds)) * Math.sin(p * Math.PI) * .35; break
      case 'whoosh': value = noise * Math.pow(Math.sin(p * Math.PI), 3) * .6; break
      case 'scan': value = Math.sin(2 * Math.PI * (400 * t + 80 * t * t)) * .15; break
      case 'laser': value = Math.sin(2 * Math.PI * (900 * t - 300 * t * t / seconds)) * Math.exp(-t * 3) * .5; break
      case 'magic': value = (Math.sin(TAU * (520 * t + 60 * t * t)) + Math.sin(TAU * 780 * t) * .4) * (.2 + .12 * Math.sin(t * 18)) * Math.sin(p * Math.PI); break
      case 'power': value = (Math.sin(TAU * (55 * t + 70 * t * t / seconds)) * .45 + noise * .16) * Math.sin(p * Math.PI); break
      case 'thunder': value = (noise * .55 + Math.sin(TAU * 42 * t) * .35) * Math.exp(-(t % .7) * 5); break
      case 'slash': value = (noise * .55 + Math.sin(TAU * (1600 * t - 600 * t * t / seconds)) * .2) * Math.pow(Math.sin(p * Math.PI), 4); break
    }
    data[i] = value * edge * cue.volume
  }
  return data
}
const TAU = Math.PI * 2

/** Mix into ONE timeline buffer, avoiding 64 retained full-length audio buffers. */
export function scheduleFx(context: BaseAudioContext, cues: readonly SceneFx[], duration: number, speed = 1, offset = 0) {
  const audible = cues.filter(cue => cue.sound && cue.volume && Math.min(duration, cue.end) > Math.max(offset, cue.start))
  if (!audible.length) return []
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600 || !Number.isFinite(offset) || offset < 0 || offset >= duration) throw new Error('Invalid SFX timeline.')
  const buffer = context.createBuffer(1, Math.ceil((duration - offset) * context.sampleRate), context.sampleRate)
  const mixed = buffer.getChannelData(0)
  for (const cue of audible) {
    // One short work block at a time, even for long ambient effects.
    const from = Math.max(offset, cue.start), end = Math.min(duration, cue.end)
    for (let at = from; at < end; at += 1) {
      const samples = fxSamples(cue, context.sampleRate, at - cue.start, Math.min(1, end - at))
      const target = Math.round((at - offset) * context.sampleRate)
      const count = Math.min(samples.length, mixed.length - target)
      for (let i = 0; i < count; i++) mixed[target + i] += samples[i]
    }
  }
  for (let i = 0; i < mixed.length; i++) mixed[i] = Math.max(-1, Math.min(1, mixed[i]))
  const source = context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = speed
  source.connect(context.destination); source.start(context.currentTime)
  return [source]
}
