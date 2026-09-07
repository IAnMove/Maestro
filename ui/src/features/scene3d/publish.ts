import { saveSceneRecording } from '../../api/video3d.ts'
import type { Scene3DDocument } from './types.ts'
import { world3dExportSize } from './exportMp4.ts'

export function world3dRecordingStub(document: Scene3DDocument) {
  const size = world3dExportSize(document.width, document.height)
  return {
    version: 1 as const,
    name: `world3d-${document.templateId || 'scene'}`,
    width: size.width,
    height: size.height,
    fps: document.fps === 60 ? 60 : 30,
    duration: document.duration,
    layers: [] as unknown[],
  }
}

export async function publishWorld3DRecording(
  blob: Blob,
  document: Scene3DDocument,
  workspace?: string,
) {
  return saveSceneRecording(blob, {
    scene: world3dRecordingStub(document) as import('../../types').Scene,
    prompt: '',
    recipe: {
      engine: 'world3d',
      templateId: document.templateId,
      slots: document.slots.map(slot => ({
        id: slot.id,
        slot: slot.slot,
        media: slot.media,
        clip: slot.clip,
        loop: slot.loop ?? null,
      })),
    },
    workspace,
  })
}
