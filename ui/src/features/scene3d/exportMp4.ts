import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { scene3dFrameCount, scene3dFrameTime } from './clock.ts'

export function evenDim(value: number): number {
  const n = Math.round(Number.isFinite(value) ? value : 0)
  return Math.max(2, n - (n % 2))
}

export function world3dExportSize(width: number, height: number) {
  const maxW = 1280
  const maxH = 720
  const scale = Math.min(1, maxW / Math.max(1, width), maxH / Math.max(1, height))
  return {
    width: evenDim(width * scale),
    height: evenDim(height * scale),
  }
}

export function world3dExportPlan(duration: number, fps: number) {
  const count = scene3dFrameCount(duration, fps)
  const times = Array.from({ length: count }, (_, index) => scene3dFrameTime(index, duration, fps))
  return { count, fps: fps === 60 ? 60 : 30, times }
}

function nextPaint(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

export async function encodeWorld3DFrames(options: {
  width: number
  height: number
  fps: number
  duration: number
  paint: (seconds: number) => HTMLCanvasElement
  onProgress?: (index: number, count: number) => void
}): Promise<Blob> {
  if (!('VideoEncoder' in window) || typeof VideoEncoder.isConfigSupported !== 'function') {
    throw new Error('This browser cannot encode a deterministic H.264 MP4.')
  }
  const size = world3dExportSize(options.width, options.height)
  const plan = world3dExportPlan(options.duration, options.fps)
  const bitrate = Math.round(Math.max(4_000_000, Math.min(24_000_000, size.width * size.height * plan.fps * 0.18)))
  const supported = await VideoEncoder.isConfigSupported({
    codec: 'avc1.640028',
    width: size.width,
    height: size.height,
    bitrate,
    framerate: plan.fps,
    avc: { format: 'avc' },
  })
  if (!supported.supported || !supported.config) {
    throw new Error('This browser cannot encode a deterministic H.264 MP4 at the selected resolution.')
  }
  const copy = document.createElement('canvas')
  copy.width = size.width
  copy.height = size.height
  const context = copy.getContext('2d')
  if (!context) throw new Error('Could not create an export canvas.')
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: size.width, height: size.height, frameRate: plan.fps },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'strict',
  })
  let encoderError: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
    error: error => { encoderError = error instanceof Error ? error : new Error(String(error)) },
  })
  encoder.configure(supported.config)
  const frameDurationUs = Math.round(1_000_000 / plan.fps)
  try {
    for (let index = 0; index < plan.count; index += 1) {
      if (encoderError) throw encoderError
      const source = options.paint(plan.times[index] ?? 0)
      context.drawImage(source, 0, 0, size.width, size.height)
      await nextPaint()
      const frame = new VideoFrame(copy, { timestamp: index * frameDurationUs, duration: frameDurationUs })
      encoder.encode(frame, { keyFrame: index % Math.max(1, plan.fps * 2) === 0 })
      frame.close()
      if (encoder.encodeQueueSize > 8) await encoder.flush()
      options.onProgress?.(index + 1, plan.count)
    }
    await encoder.flush()
    if (encoderError) throw encoderError
    muxer.finalize()
    return new Blob([target.buffer], { type: 'video/mp4' })
  } finally {
    encoder.close()
  }
}
