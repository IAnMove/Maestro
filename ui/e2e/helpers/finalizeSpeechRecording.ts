import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Request } from '@playwright/test'

/** Simulated HTTP service, real media mux: Linux exercises PCM fallback, Windows native AAC. */
export async function finalizeSpeechRecording(request: Request): Promise<Buffer> {
  const form = await new Response(new Uint8Array(request.postDataBuffer()!), {
    headers: { 'Content-Type': request.headers()['content-type'] },
  }).formData()
  const file = form.get('file') as File, audio = form.get('audio') as File | null
  if (!audio) return Buffer.from(await file.arrayBuffer())
  const folder = await mkdtemp(join(tmpdir(), 'hocus-speech-e2e-'))
  try {
    const video = join(folder, 'video.mp4'), wav = join(folder, 'mix.wav'), output = join(folder, 'result.mp4')
    await writeFile(video, Buffer.from(await file.arrayBuffer())); await writeFile(wav, Buffer.from(await audio.arrayBuffer()))
    execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-i', wav, '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', output], { timeout: 30000, stdio: 'pipe' })
    return await readFile(output)
  } finally { await rm(folder, { recursive: true, force: true }) }
}
