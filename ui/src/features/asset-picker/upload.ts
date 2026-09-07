import { uploadAudio } from '../../api/director'
import { uploadImage } from '../../api/generation'
import type { AssetKind } from '../../api/assets'

export type LocalUploadResult = {
  filename: string
  url: string
  path: string
  kind: AssetKind
}

const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/ogg', 'audio/flac', 'audio/webm'])
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
const MODEL_EXT = /\.(glb|gltf|obj|usdz|stl|ply)$/i

export function inferUploadKind(file: File): AssetKind {
  if (file.type.startsWith('image/')) return 'image'
  if (AUDIO_TYPES.has(file.type) || file.type.startsWith('audio/')) return 'audio'
  if (VIDEO_TYPES.has(file.type) || file.type.startsWith('video/')) return 'video'
  if (MODEL_EXT.test(file.name)) return 'model3d'
  return 'other'
}

export async function uploadLocalAsset(file: File, signal?: AbortSignal): Promise<LocalUploadResult> {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  const kind = inferUploadKind(file)
  const uploaded = kind === 'audio' ? await uploadAudio(file) : await uploadImage(file)
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  return {
    filename: uploaded.filename,
    url: uploaded.url,
    path: uploaded.path,
    kind,
  }
}

export function fileMatchesConstraints(file: File, kinds?: readonly AssetKind[]): boolean {
  if (!kinds?.length) return true
  return kinds.includes(inferUploadKind(file))
}

export function createUploadSession() {
  let controller: AbortController | null = null
  return {
    abort() { controller?.abort() },
    async run(file: File) {
      controller?.abort()
      controller = new AbortController()
      const signal = controller.signal
      try {
        return await uploadLocalAsset(file, signal)
      } catch (error) {
        if (signal.aborted) {
          const abort = new DOMException('The operation was aborted.', 'AbortError')
          throw abort
        }
        throw error
      }
    },
  }
}
