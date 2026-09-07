import type { ApiOutput } from '../../api/outputs'
import type { Scene3DSlotMedia, Scene3DSourceRef } from './types.ts'

export type { Scene3DSourceRef }

export type SlotSourceCapture = {
  generation: number
  slotId: string
  templateId: string
  workspaceId: string
}

export type SlotSourceLive = {
  generation: number
  slotId: string
  templateId: string
  workspaceId: string
  exporting: boolean
}

export type SlotSourceCommit =
  | { action: 'ignore' }
  | { action: 'clear' }
  | {
    action: 'apply'
    sourceUrl: string
    sourceRef: Scene3DSourceRef
    media: Scene3DSlotMedia
    clip: null
  }

export function isTransientSourceUrl(url: string): boolean {
  return url.startsWith('blob:') || url.startsWith('filesystem:')
}

export function parseScene3DSourceRef(raw: unknown): Scene3DSourceRef | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Partial<Scene3DSourceRef>
  if (typeof value.workspaceId !== 'string' || !value.workspaceId) return undefined
  if (typeof value.filename !== 'string' || !value.filename) return undefined
  if (typeof value.url !== 'string' || !value.url || isTransientSourceUrl(value.url)) return undefined
  const assetId = typeof value.assetId === 'string' && value.assetId ? value.assetId : undefined
  return { workspaceId: value.workspaceId, filename: value.filename, url: value.url, assetId }
}

export function durableScene3DSourceUrl(url: string): string {
  return typeof url === 'string' && url && !isTransientSourceUrl(url) ? url : ''
}

export function sourceRefFromOutput(item: ApiOutput, workspaceId: string): Scene3DSourceRef {
  const extra = item as ApiOutput & { id?: string }
  return {
    workspaceId,
    filename: item.name,
    url: item.url,
    assetId: typeof extra.id === 'string' && extra.id ? extra.id : undefined,
  }
}

export function pickerOutputFromSlot(sourceUrl: string, media: Scene3DSlotMedia, sourceRef?: Scene3DSourceRef): ApiOutput | undefined {
  const url = durableScene3DSourceUrl(sourceUrl)
  if (!url) return undefined
  return {
    name: sourceRef?.filename || url.split('/').pop() || url,
    type: media === 'image' ? 'image' : 'model3d',
    mode: null,
    size: 0,
    created_at: 0,
    url,
    thumbnail_url: media === 'image' ? url : '',
  }
}

export function commitSlotSourceChoice(
  live: SlotSourceLive,
  capture: SlotSourceCapture,
  item: ApiOutput | null,
): SlotSourceCommit {
  if (live.exporting) return { action: 'ignore' }
  if (live.generation !== capture.generation) return { action: 'ignore' }
  if (live.slotId !== capture.slotId) return { action: 'ignore' }
  if (live.templateId !== capture.templateId) return { action: 'ignore' }
  if (live.workspaceId !== capture.workspaceId) return { action: 'ignore' }
  if (!item) return { action: 'clear' }
  if (isTransientSourceUrl(item.url) || !item.url || !item.name) return { action: 'ignore' }
  const media: Scene3DSlotMedia = item.type === 'image' ? 'image' : 'model3d'
  return {
    action: 'apply',
    sourceUrl: item.url,
    sourceRef: sourceRefFromOutput(item, capture.workspaceId),
    media,
    clip: null,
  }
}
