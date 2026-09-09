export interface ViggleFrameDimensions {
  width: number
  height: number
  frameWidth: number
  frameHeight: number
}

const MEDIA_TIMEOUT_MS = 15_000

function validSize(width: number, height: number) {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
}

/** Match the server's aspect tolerance; this does not verify pose or visual alignment. */
export function viggleFrameProblem(dimensions: ViggleFrameDimensions): 'aspect' | null {
  const { width, height, frameWidth, frameHeight } = dimensions
  if (!validSize(width, height) || !validSize(frameWidth, frameHeight)) return 'aspect'
  return Math.abs(frameWidth / frameHeight - width / height) > 0.02 ? 'aspect' : null
}

function readSize(url: string, kind: 'video' | 'image', signal: AbortSignal): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(kind === 'video' ? 'video' : 'img')
    const video = kind === 'video' ? element as HTMLVideoElement : null
    const image = kind === 'image' ? element as HTMLImageElement : null
    const readyEvent = video ? 'loadedmetadata' : 'load'
    let settled = false
    let started = false

    const finish = (size?: { width: number; height: number }, error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      element.removeEventListener(readyEvent, ready)
      element.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
      element.removeAttribute('src')
      // Reset the resource selection to stop a pending browser media request.
      // These URLs belong to the caller; object URLs must not be revoked here.
      if (video && started) {
        try { video.load() } catch { /* The source and listeners are already detached. */ }
      }
      if (error) reject(error)
      else if (size) resolve(size)
    }
    const ready = () => {
      const width = video ? video.videoWidth : image!.naturalWidth
      const height = video ? video.videoHeight : image!.naturalHeight
      if (!validSize(width, height)) finish(undefined, new Error('Media dimensions are unavailable'))
      else finish({ width, height })
    }
    const failed = () => finish(undefined, new Error('Media could not be read'))
    const aborted = () => finish(undefined, new DOMException('Media inspection cancelled', 'AbortError'))
    const timer = setTimeout(() => finish(undefined, new Error('Media inspection timed out')), MEDIA_TIMEOUT_MS)

    if (signal.aborted) { aborted(); return }
    element.addEventListener(readyEvent, ready)
    element.addEventListener('error', failed)
    signal.addEventListener('abort', aborted, { once: true })
    if (video) { video.preload = 'metadata'; video.muted = true }
    started = true
    element.src = url
  })
}

/** Inspect intrinsic dimensions without changing either source or retaining media elements. */
export async function inspectViggleFrame(videoUrl: string, frameUrl: string, signal?: AbortSignal): Promise<ViggleFrameDimensions> {
  if (!videoUrl || !frameUrl) throw new Error('Both Viggle media sources are required')
  if (signal?.aborted) throw new DOMException('Media inspection cancelled', 'AbortError')
  const controller = new AbortController()
  const aborted = () => controller.abort()
  signal?.addEventListener('abort', aborted, { once: true })
  try {
    const [video, frame] = await Promise.all([
      readSize(videoUrl, 'video', controller.signal),
      readSize(frameUrl, 'image', controller.signal),
    ])
    return { ...video, frameWidth: frame.width, frameHeight: frame.height }
  } finally {
    // If one decoder failed, also release the other immediately.
    controller.abort()
    signal?.removeEventListener('abort', aborted)
  }
}
