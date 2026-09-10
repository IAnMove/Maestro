import type { OutputFile, Scene } from '../types'

export const PENDING_SCENE_KEY = 'maestro_scene_animator_pending_scene'

export async function openSceneOutput(file: OutputFile) {
  const { useStore } = await import('../stores/useStore')
  if (file.name.endsWith('.world3d.scene.json')) {
    const { parseScene3DDocument } = await import('../features/scene3d/document')
    const { presentSceneDocument } = await import('../features/sceneFx/handoff')
    const response = await fetch(file.url)
    if (!response.ok) throw new Error('Could not load the saved scene')
    const document = parseScene3DDocument(await response.json())
    if (!document) throw new Error('Invalid Video3D scene')
    useStore.getState().setMediaFilter('world3d')
    await presentSceneDocument('3d', document)
  } else {
    await stageSceneForEditor(file)
    useStore.getState().setMediaFilter('scene3d')
  }
}

export async function stageSceneForEditor(file: OutputFile): Promise<Scene> {
  const response = await fetch(file.url)
  if (!response.ok) throw new Error('Could not load the saved scene')
  const scene = await response.json() as Scene
  if (scene.version !== 1 || !Array.isArray(scene.layers)) {
    throw new Error('The selected output is not a valid HocusPocus scene')
  }
  sessionStorage.setItem(PENDING_SCENE_KEY, JSON.stringify(scene))
  return scene
}
