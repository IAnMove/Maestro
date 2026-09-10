import { durableScene3DSourceUrl, parseScene3DSourceRef } from './slotSource.ts'
import type { Scene3DSourceRef } from './types.ts'

export type MediaScreen = {
  sourceUrl: string
  sourceRef?: Scene3DSourceRef
  media: 'image' | 'video'
  mode: 'mesh' | 'plane'
  targetMesh: string
  anchor: string
  offset: [number, number, number]
  yaw: number
  width: number
  height: number
  style: 'monitor' | 'billboard' | 'frameless'
  fit: 'contain' | 'cover'
  start: number
  speed: number
  loop: boolean
  flipY: boolean
}

export const defaultMediaScreen = (): MediaScreen => ({
  sourceUrl: '', media: 'image', mode: 'mesh', targetMesh: 'SCREEN_CONTENT', anchor: '',
  offset: [0, 0, 0], yaw: 0, width: 4, height: 3, style: 'monitor', fit: 'contain',
  start: 0, speed: 1, loop: true, flipY: false,
})

const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback

function parseOffset(value: unknown): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return [0, 0, 0]
  return value.map(item => bounded(item, 0, -2, 2)) as [number, number, number]
}

const ANCHOR_PRIORITY = ['headfront', 'screen_content', 'tv_screen', 'head_screen', 'display', 'screen']

export function pickScreenAnchor(names: readonly string[]): string {
  const lower = names.map(name => name.toLowerCase())
  for (const candidate of ANCHOR_PRIORITY) {
    const index = lower.indexOf(candidate)
    if (index >= 0) return names[index]
  }
  return names.find(name => /headfront|screen|display|monitor|tv/i.test(name)) ?? ''
}

export function defaultModelScreen(nodeNames: readonly string[] = []): MediaScreen {
  const anchor = pickScreenAnchor(nodeNames)
  if (anchor) {
    return {
      ...defaultMediaScreen(), mode: 'plane', targetMesh: 'HOCUS_SCREEN_PLANE', anchor,
      width: 0.32, height: 0.22,
    }
  }
  return { ...defaultMediaScreen(), mode: 'mesh', targetMesh: nodeNames[0] || 'SCREEN_CONTENT' }
}

export function parseMediaScreen(raw: unknown): MediaScreen | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Partial<MediaScreen>, defaults = defaultMediaScreen()
  const sourceUrl = durableScene3DSourceUrl(value.sourceUrl ?? '')
  const mode = value.mode === 'plane' ? 'plane' : 'mesh'
  const plane = mode === 'plane'
  return {
    sourceUrl, sourceRef: sourceUrl ? parseScene3DSourceRef(value.sourceRef) : undefined,
    media: value.media === 'video' ? 'video' : 'image', mode,
    targetMesh: typeof value.targetMesh === 'string' ? value.targetMesh : defaults.targetMesh,
    anchor: typeof value.anchor === 'string' ? value.anchor.slice(0, 120) : '',
    offset: parseOffset(value.offset), yaw: bounded(value.yaw, 0, -Math.PI, Math.PI),
    width: bounded(value.width, plane ? 0.32 : 4, 0.02, 80),
    height: bounded(value.height, plane ? 0.22 : 3, 0.02, 80),
    style: value.style === 'billboard' || value.style === 'frameless' ? value.style : 'monitor',
    fit: value.fit === 'cover' ? 'cover' : 'contain',
    start: bounded(value.start, 0, 0, 86400), speed: bounded(value.speed, 1, 0.05, 8),
    loop: value.loop !== false, flipY: value.flipY === true,
  }
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
  return JSON.stringify([
    screen.sourceUrl, screen.media, screen.mode, screen.targetMesh, screen.anchor,
    screen.offset, screen.yaw, screen.width, screen.height, screen.style, screen.fit, screen.flipY,
  ])
}
