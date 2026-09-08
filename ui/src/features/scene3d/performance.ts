import type { Scene3DClipPlayback, Scene3DMotion, Scene3DSlot, Vec3 } from './types.ts'

export function parseClipPlayback(raw: unknown): Scene3DClipPlayback | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Scene3DClipPlayback
  return {
    speed: typeof value.speed === 'number' && Number.isFinite(value.speed) ? Math.max(0.1, Math.min(4, value.speed)) : 1,
    start: typeof value.start === 'number' && Number.isFinite(value.start) ? Math.max(0, value.start) : 0,
    loop: value.loop !== false,
  }
}

export function parseMotion(raw: unknown): Scene3DMotion | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Scene3DMotion
  if (!Array.isArray(value.to) || value.to.length !== 3 || !value.to.every(Number.isFinite)) return undefined
  return {
    to: [...value.to] as unknown as Vec3,
    turnTo: typeof value.turnTo === 'number' && Number.isFinite(value.turnTo) ? value.turnTo : undefined,
    easing: value.easing === 'smooth' ? 'smooth' : 'linear',
  }
}

export function slotPoseAtTime(slot: Scene3DSlot, seconds: number, duration: number) {
  if (!slot.motion) return { position: slot.position, rotationY: slot.rotationY }
  const progress = Math.max(0, Math.min(1, seconds / Math.max(0.001, duration)))
  const t = slot.motion.easing === 'smooth' ? progress * progress * (3 - 2 * progress) : progress
  return {
    position: slot.position.map((v, i) => v + (slot.motion!.to[i] - v) * t) as unknown as Vec3,
    rotationY: slot.rotationY + ((slot.motion.turnTo ?? slot.rotationY) - slot.rotationY) * t,
  }
}

/** Start is a source-clip seek, independent of the scene's clock and speed. */
export function performanceClipTime(seconds: number, duration: number | null, raw?: Scene3DClipPlayback): number | null {
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return null
  const playback = parseClipPlayback(raw)
  const time = (playback?.start ?? 0) + Math.max(0, seconds) * (playback?.speed ?? 1)
  return playback?.loop === false ? Math.min(duration, time) : time % duration
}

export function reviewClipNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

export function paintClipNumber(context: CanvasRenderingContext2D, width: number, height: number, number?: number) {
  if (!reviewClipNumber(number)) return
  const unit = height / 720
  const text = `CLIP ${String(number).padStart(2, '0')}`
  context.save()
  context.font = `600 ${Math.round(19 * unit)}px monospace`
  const boxWidth = context.measureText(text).width + 28 * unit
  const x = width - boxWidth - 24 * unit
  context.fillStyle = 'rgba(5, 10, 18, 0.82)'
  context.fillRect(x, 22 * unit, boxWidth, 38 * unit)
  context.fillStyle = '#e7faff'
  context.textBaseline = 'middle'
  context.fillText(text, x + 14 * unit, 41 * unit)
  context.restore()
}
