import { paintKineticTexts } from '../../lib/kineticText.ts'
import { scene3dOutputDuration, scene3dPlaybackSpeed } from './clock.ts'
import { scene3dCopy } from './copy.ts'
import { paintClipNumber } from './performance.ts'
import { finishWorld3DExport, paintWorld3DExportFrame, startWorld3DExport } from './exportLock.ts'
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
    if (Date.now() > deadline) throw new Error(scene3dCopy('stage.assetsNotReady'))
    await sleep(200)
  }
}

export async function exportWorld3DDocument(
  handle: Scene3DStageHandle,
  document: Scene3DDocument,
  workspace?: string,
  onProgress?: (index: number, count: number) => void,
) {
  const size = world3dExportSize(document.width, document.height)
  const snapshot = startWorld3DExport(handle, document, size)
  try {
    await waitForWorld3DAssets(handle, snapshot)
    const blob = await encodeWorld3DFrames({
      width: size.width,
      height: size.height,
      fps: snapshot.fps,
      duration: scene3dOutputDuration(snapshot),
      paint: async seconds => {
        const time = seconds * scene3dPlaybackSpeed(snapshot.playbackSpeed)
        await handle.prepareFrame?.(time, snapshot)
        return paintWorld3DExportFrame(handle, snapshot, time)
      },
      overlay: (context, width, height, seconds) => {
        paintKineticTexts(context, width, height, seconds * scene3dPlaybackSpeed(snapshot.playbackSpeed), snapshot.texts)
        paintClipNumber(context, width, height, snapshot.clipNumber)
      },
      onProgress,
    })
    try {
      const saved = await publishWorld3DRecording(blob, snapshot, workspace)
      return { blob, saved }
    } catch (error) {
      return { blob, saved: null, error: error instanceof Error ? error : new Error(String(error)) }
    }
  } finally {
    finishWorld3DExport(handle)
  }
}
