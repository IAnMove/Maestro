import type { OutputFile } from '../types'
import { useStore } from '../stores/useStore'
import { galleryWorkspaceEpoch, galleryWorkspaceName } from '../stores/gallerySlice'
import { parseScene3DDocument } from '../features/scene3d/document'
import { presentSceneDocument } from '../features/sceneFx/handoff'
import { parseSceneFile } from './sceneFile'

let opening: AbortController | undefined

/** A late response or editor mount must not import into a different workspace. */
export async function openSavedScene(file: OutputFile, source: { epoch: number; workspace: string }) {
  opening?.abort()
  const controller = new AbortController()
  opening = controller
  const { epoch, workspace } = source
  const current = () => !controller.signal.aborted && epoch === galleryWorkspaceEpoch()
    && workspace === galleryWorkspaceName(useStore.getState())
  const unsubscribe = useStore.subscribe(() => { if (!current()) controller.abort() })
  try {
    if (!current()) throw new Error('Workspace changed before loading the scene.')
    const response = await fetch(file.url, { signal: controller.signal })
    if (!response.ok) throw new Error('Could not load the saved scene')
    const raw = await response.text()
    const world = file.name.endsWith('.world3d.scene.json')
    const document = world ? parseScene3DDocument(JSON.parse(raw)) : parseSceneFile(raw)
    if (!document) throw new Error('Invalid saved scene')
    if (!current()) throw new Error('Workspace changed while opening the scene. Open it again in its folder.')
    useStore.getState().setMediaFilter(world ? 'world3d' : 'scene3d')
    await presentSceneDocument(world ? '3d' : '2d', document, current, controller.signal)
  } finally {
    unsubscribe()
    if (opening === controller) opening = undefined
  }
}
