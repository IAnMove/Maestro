import { durableScene3DSourceUrl, parseScene3DSourceRef } from './slotSource.ts'
import type { Scene3DSourceRef } from './types.ts'

export type MediaScreen = {
  sourceUrl: string
  sourceRef?: Scene3DSourceRef
  media: 'image' | 'video'
  targetMesh: string
  width: number
  height: number
  style: 'monitor' | 'billboard' | 'frameless'
  fit: 'contain' | 'cover'
  start: number
  speed: number
  loop: boolean
  flipY: boolean
}

export const defaultMediaScreen = (): MediaScreen => ({ sourceUrl: '', media: 'image', targetMesh: 'SCREEN_CONTENT', width: 4, height: 3,
  style: 'monitor', fit: 'contain', start: 0, speed: 1, loop: true, flipY: false })

const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback

export function parseMediaScreen(raw: unknown): MediaScreen | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Partial<MediaScreen>, defaults = defaultMediaScreen()
  const sourceUrl = durableScene3DSourceUrl(value.sourceUrl ?? '')
  return { sourceUrl, sourceRef: sourceUrl ? parseScene3DSourceRef(value.sourceRef) : undefined,
    media: value.media === 'video' ? 'video' : 'image', targetMesh: typeof value.targetMesh === 'string' ? value.targetMesh : defaults.targetMesh,
    width: bounded(value.width, 4, .1, 80), height: bounded(value.height, 3, .1, 80),
    style: value.style === 'billboard' || value.style === 'frameless' ? value.style : 'monitor', fit: value.fit === 'cover' ? 'cover' : 'contain',
    start: bounded(value.start, 0, 0, 86400), speed: bounded(value.speed, 1, .05, 8), loop: value.loop !== false, flipY: value.flipY === true }
}

export function mediaScreenTime(seconds: number, duration: number, screen: Pick<MediaScreen, 'start' | 'speed' | 'loop'>) {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  const time = screen.start + Math.max(0, seconds) * screen.speed
  return screen.loop ? ((time % duration) + duration) % duration : Math.min(time, Math.max(0, duration - .001))
}

export function mediaScreenRect(width: number, height: number, sourceWidth: number, sourceHeight: number, fit: MediaScreen['fit']) {
  const scale = (fit === 'cover' ? Math.max : Math.min)(width / sourceWidth, height / sourceHeight)
  return { x: (width - sourceWidth * scale) / 2, y: (height - sourceHeight * scale) / 2, width: sourceWidth * scale, height: sourceHeight * scale }
}

export function mediaScreenMountKey(screen?: MediaScreen) {
  if (!screen) return ''
  return JSON.stringify([screen.sourceUrl, screen.media, screen.targetMesh, screen.width, screen.height, screen.style, screen.fit, screen.flipY])
}
