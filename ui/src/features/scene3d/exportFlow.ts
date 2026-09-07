import { encodeWorld3DFrames, world3dExportSize } from './exportMp4.ts'
import { publishWorld3DRecording } from './publish.ts'
import type { Scene3DStageHandle } from './Scene3DStage.tsx'
import type { Scene3DDocument } from './types.ts'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function waitForWorld3DAssets(
  handle: Scene3DStageHandle,
  document: Scene3DDocument,
  timeoutMs = 25000,
) {
  const deadline = Date.now() + timeoutMs
  while (!handle.ready(document.slots)) {
    if (Date.now() > deadline) throw new Error('The 3D assets did not finish loading.')
    await sleep(200)
  }
}

export async function exportWorld3DDocument(
  handle: Scene3DStageHandle,
  document: Scene3DDocument,
  workspace?: string,
  onProgress?: (index: number, count: number) => void,
) {
  await waitForWorld3DAssets(handle, document)
  const size = world3dExportSize(document.width, document.height)
  handle.setExportSize(size.width, size.height)
  try {
    const blob = await encodeWorld3DFrames({
      width: size.width,
      height: size.height,
      fps: document.fps,
      duration: document.duration,
      paint: seconds => {
        const canvas = handle.paint(seconds)
        if (!canvas) throw new Error('The 3D stage is not ready to export.')
        return canvas
      },
      onProgress,
    })
    try {
      const saved = await publishWorld3DRecording(blob, document, workspace)
      return { blob, saved }
    } catch (error) {
      return { blob, saved: null, error: error instanceof Error ? error : new Error(String(error)) }
    }
  } finally {
    handle.restoreSize()
  }
}
