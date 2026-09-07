/** Match compositor export: frameCount = Math.round(duration * fps). */
export function scene3dFrameCount(duration: number, fps: number): number {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30
  return Math.max(1, Math.round(safeDuration * safeFps))
}

/** Frame i is t = min(duration, i / fps) for i = 0 .. frameCount-1. */
export function scene3dFrameTime(index: number, duration: number, fps: number): number {
  const count = scene3dFrameCount(duration, fps)
  const i = Math.max(0, Math.min(count - 1, Math.trunc(index)))
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  return Math.min(safeDuration, i / safeFps)
}

export function scene3dClipLocalTime(
  sceneSeconds: number,
  clipDuration: number | null,
  options: { offset?: number; speed?: number; loop?: boolean } = {},
): number | null {
  if (clipDuration == null || !Number.isFinite(clipDuration) || clipDuration <= 0) return null
  const offset = Number.isFinite(options.offset) ? Math.max(0, options.offset!) : 0
  const speed = Number.isFinite(options.speed) && options.speed! > 0 ? options.speed! : 1
  const elapsed = Math.max(0, sceneSeconds - offset) * speed
  if (options.loop === false) return Math.min(clipDuration, elapsed)
  return elapsed % clipDuration
}
