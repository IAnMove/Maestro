import type { useStore } from '../stores/useStore'
import { fetchEditingRestoreAsset } from './wangpUi'

type State = ReturnType<typeof useStore.getState>
let restoreRevision = 0

export function restoredGenericImageRefs(params: Record<string, unknown>, refs: string[] | undefined) {
  return params.model_type === 'viggle_animate' ? [] : refs || []
}

export function legacyEditingPath(params: Record<string, unknown>, field: string, fallback = ''): string {
  return params.model_type === 'viggle_animate' ? '' : String(params[field] || fallback)
}

/** Media restoration owns a snapshot; missing files and late responses cannot reuse an older job's inputs. */
export function beginWangpRestore(params: Record<string, unknown>, get: () => State, set: (state: Partial<State>) => void) {
  const revision = ++restoreRevision
  const workspace = get().activeWorkspace
  const metadata = get().selectedOutputMeta
  const current = () => revision === restoreRevision && workspace === get().activeWorkspace
    && metadata === get().selectedOutputMeta && get().params.model_type === 'viggle_animate'
  return async () => {
    if (params.model_type !== 'viggle_animate' || !current()) return
    get().clearEditVideo()
    get().setEditRecastRef(null, '', '', false)
    set({ wangpRestoreError: '' })
    const restore = async (kind: 'video' | 'reference') => {
      const field = kind === 'video' ? 'edit_video_url' : 'edit_recast_ref_url'
      const path = String(params[field] || params[kind === 'video' ? 'edit_video_path' : 'edit_recast_ref_path'] || '')
      try {
        const response = await fetchEditingRestoreAsset(params, field, path, fetch)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const blob = await response.blob()
        if (!current()) return
        const file = new File([blob], path.split('/').pop() || kind, { type: blob.type })
        const url = URL.createObjectURL(file)
        if (kind === 'video') {
          get().setEditVideo(file, path, url, 0, '')
          set({ editStartTime: Number(params.edit_start_time || 0), editEndTime: Number(params.edit_end_time || 0) })
        } else {
          get().setEditRecastRef(file, path, url, true)
        }
      } catch (error) {
        if (current()) set({ wangpRestoreError: `Viggle: ${kind} unavailable (${String(error)}).` })
      }
    }
    await Promise.all([restore('video'), restore('reference')])
  }
}
