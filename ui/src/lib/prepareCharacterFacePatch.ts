import type { CharacterFaceAnchor } from './characterKit'
import { cropCharacterFacePatch, facePatchRegionFromAnchor, validateFacePatchFrame, type FacePatchMetadata } from './characterFacePatch'

const MAX_BYTES = 8 * 1024 * 1024
const mimeAllowed = (mime: string) => ['image/png', 'image/jpeg', 'image/webp'].includes(mime)
const hash = async (blob: Blob): Promise<string> => {
  const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function readPose(source: string): Promise<Blob> {
  const url = new URL(source, window.location.origin)
  if (url.origin !== window.location.origin || !/^\/api\/v1\/(?:file|uploads)\/.+/.test(url.pathname) || url.hash) {
    throw new Error('Choose a saved HocusPocus pose before preparing a facial patch.')
  }
  const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!response.ok || !response.body) throw new Error('The saved pose is not available.')
  const mime = response.headers.get('content-type')?.split(';')[0] ?? ''
  if (!mimeAllowed(mime)) throw new Error('Choose a PNG, JPEG or WebP pose.')
  const reader = response.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new Error('Face patch inputs are limited to 8 MiB each.')
      chunks.push(new Uint8Array(value))
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  return new Blob(chunks, { type: mime })
}

function encodePatch(variant: ImageBitmap, anchor: CharacterFaceAnchor): { canvas: HTMLCanvasElement; region: FacePatchMetadata['region'] } {
  const canvas = document.createElement('canvas')
  canvas.width = variant.width
  canvas.height = variant.height
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas is unavailable.')
    context.drawImage(variant, 0, 0)
    const region = facePatchRegionFromAnchor(anchor, variant.width, variant.height)
    const pixels = cropCharacterFacePatch(context.getImageData(0, 0, variant.width, variant.height).data,
      variant.width, variant.height, region)
    canvas.width = region.size
    canvas.height = region.size
    const result = context.createImageData(region.size, region.size)
    result.data.set(pixels)
    context.putImageData(result, 0, 0)
    return { canvas, region }
  } catch (error) { canvas.width = canvas.height = 0; throw error }
}

/** Local preparation only. No uploads, provider calls, or mutation of either source. */
export async function prepareCharacterFacePatch(poseSource: string, variant: File, anchor: CharacterFaceAnchor): Promise<{
  blob: Blob; metadata: Omit<FacePatchMetadata, 'poseId' | 'variantSource'>
}> {
  if (!globalThis.crypto?.subtle) throw new Error('Use localhost or HTTPS to record the source image hashes.')
  if (!mimeAllowed(variant.type) || !Number.isInteger(variant.size) || variant.size <= 0 || variant.size > MAX_BYTES) throw new Error('Choose a PNG, JPEG or WebP variant up to 8 MiB.')
  const original = await readPose(poseSource)
  const poseBitmap = await createImageBitmap(original)
  try {
    validateFacePatchFrame(poseBitmap.width, poseBitmap.height)
    const variantBitmap = await createImageBitmap(variant)
    try {
      validateFacePatchFrame(variantBitmap.width, variantBitmap.height)
      if (poseBitmap.width !== variantBitmap.width || poseBitmap.height !== variantBitmap.height) {
        throw new Error('The variant must have exactly the same pixel dimensions as the pose. Align it first; no automatic stretching is applied.')
      }
      const { canvas, region } = encodePatch(variantBitmap, anchor)
      try {
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value
          ? resolve(value) : reject(new Error('Could not encode the facial patch.')), 'image/png'))
        return { blob, metadata: { version: 1, poseSource, sourceWidth: poseBitmap.width, sourceHeight: poseBitmap.height,
          region, feather: .08, poseSha256: await hash(original), variantSha256: await hash(variant), outputSha256: await hash(blob) } }
      } finally { canvas.width = canvas.height = 0 }
    } finally { variantBitmap.close() }
  } finally { poseBitmap.close() }
}
