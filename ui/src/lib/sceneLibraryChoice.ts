import type { ApiOutput } from '../api/outputs'
import { isCompositorVideo } from './sceneLibrary.ts'

export type LibraryPurpose = 'open-scene' | 'recover-recipe'

export type LibraryCapture = {
  generation: number
  workspaceId: string
  purpose: LibraryPurpose
}

export type LibraryLive = {
  generation: number
  workspaceId: string
  purpose: LibraryPurpose
  /** Current dialog visibility. Must not be hardcoded true after an await. */
  open: boolean
}

export type LibraryCommit =
  | { action: 'ignore' }
  | { action: 'open-scene'; item: ApiOutput }
  | { action: 'recover-recipe'; item: ApiOutput }

export function purposeFromTab(tab: 'scenes' | 'videos'): LibraryPurpose {
  return tab === 'videos' ? 'recover-recipe' : 'open-scene'
}

export function commitLibraryChoice(
  live: LibraryLive,
  capture: LibraryCapture,
  item: ApiOutput | null,
): LibraryCommit {
  if (!live.open) return { action: 'ignore' }
  if (live.generation !== capture.generation) return { action: 'ignore' }
  if (live.workspaceId !== capture.workspaceId) return { action: 'ignore' }
  if (live.purpose !== capture.purpose) return { action: 'ignore' }
  if (!item) return { action: 'ignore' }
  if (capture.purpose === 'open-scene') {
    if (item.type !== 'scene') return { action: 'ignore' }
    return { action: 'open-scene', item }
  }
  if (item.type !== 'video' || !isCompositorVideo(item)) return { action: 'ignore' }
  return { action: 'recover-recipe', item }
}
