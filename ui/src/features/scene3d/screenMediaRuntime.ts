import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, SRGBColorSpace, type Object3D } from 'three'
import { mediaScreenRect, mediaScreenTime, type MediaScreen } from './mediaScreen.ts'

export type ScreenMediaRuntime = {
  ready: boolean
  error: Error | null
  seek: (seconds: number, screen: MediaScreen) => Promise<void>
  dispose: () => void
}

function waitMedia(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer); video.removeEventListener(event, done); video.removeEventListener('error', failed); signal.removeEventListener('abort', aborted)
      if (error) reject(error); else resolve()
    }
    const done = () => finish(), failed = () => finish(new Error('screen-media-load-failed')), aborted = () => finish(new Error('screen-media-disposed'))
    const timer = setTimeout(() => finish(new Error('screen-media-timeout')), 15000)
    video.addEventListener(event, done, { once: true }); video.addEventListener('error', failed, { once: true }); signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
  })
}

/** Video is paused and sought from the scene clock, including during export. */
export async function bindScreenMedia(root: Object3D, screen: MediaScreen, standalone: boolean, signal: AbortSignal, onFrame: () => void = () => {}): Promise<ScreenMediaRuntime> {
  const targets: Mesh[] = []
  root.traverse(child => { if (child instanceof Mesh && child.name === (standalone ? 'SCREEN_CONTENT' : screen.targetMesh)) targets.push(child) })
  if (targets.length !== 1) throw new Error(targets.length ? 'screen-mesh-ambiguous' : 'screen-mesh-missing')
  const canvas = document.createElement('canvas')
  const aspect = screen.width / screen.height
  canvas.width = Math.max(2, Math.round(Math.min(1920, 1080 * aspect))); canvas.height = Math.max(2, Math.round(canvas.width / aspect))
  const context = canvas.getContext('2d')!
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.flipY = standalone ? !screen.flipY : screen.flipY
  const material = new MeshBasicMaterial({ map: texture, toneMapped: false, side: DoubleSide })
  const target = targets[0], previous = target.material
  const video = screen.media === 'video' ? document.createElement('video') : null
  const image = video ? null : new Image()
  const abort = new AbortController()
  const runtime: ScreenMediaRuntime = { ready: false, error: null, seek: async () => {}, dispose: () => {
    abort.abort(); if (video) { video.pause(); video.removeAttribute('src'); video.load() }
    if (image) image.src = ''; target.material = previous; texture.dispose(); material.dispose()
  } }
  const disposed = () => runtime.dispose()
  signal.addEventListener('abort', disposed, { once: true })
  const paint = () => {
    const source = video ?? image!, width = video?.videoWidth ?? image!.naturalWidth, height = video?.videoHeight ?? image!.naturalHeight
    if (!width || !height || abort.signal.aborted) return
    const r = mediaScreenRect(canvas.width, canvas.height, width, height, screen.fit)
    context.fillStyle = '#080c13'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, r.x, r.y, r.width, r.height); texture.needsUpdate = true
    onFrame()
  }
  try {
    if (signal.aborted) throw new Error('screen-media-disposed')
    if (video) {
      video.crossOrigin = 'anonymous'; video.muted = true; video.playsInline = true; video.preload = 'auto'
      const loaded = waitMedia(video, 'loadeddata', abort.signal); video.src = screen.sourceUrl; video.load(); await loaded
    } else {
      image!.crossOrigin = 'anonymous'; image!.src = screen.sourceUrl; await image!.decode()
    }
    if (abort.signal.aborted) throw new Error('screen-media-disposed')
    target.material = material; paint(); runtime.ready = true
    let pending: Promise<void> | null = null, desired = 0
    runtime.seek = async (seconds, current) => {
      if (runtime.error) throw runtime.error
      if (!video || abort.signal.aborted) return
      desired = mediaScreenTime(seconds, video.duration, current)
      while (!abort.signal.aborted && (pending || Math.abs(video.currentTime - desired) > .0005)) {
        if (!pending) pending = (async () => {
          while (!abort.signal.aborted && Math.abs(video.currentTime - desired) > .0005) {
            const sought = waitMedia(video, 'seeked', abort.signal); video.currentTime = desired; await sought; paint()
          }
        })().catch(error => { runtime.error = error instanceof Error ? error : new Error(String(error)); throw runtime.error }).finally(() => { pending = null })
        await pending
      }
    }
    return runtime
  } catch (error) { runtime.dispose(); throw error }
  finally { signal.removeEventListener('abort', disposed) }
}
