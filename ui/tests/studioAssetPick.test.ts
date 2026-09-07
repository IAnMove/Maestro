import assert from 'node:assert/strict'
import test from 'node:test'
import { fileFromOutput } from '../src/lib/studioAssetPick.ts'

test('fileFromOutput reads the chosen url as a File', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = async () => new Response(new Blob(['clip'], { type: 'video/mp4' }), { status: 200 })
  try {
    const file = await fileFromOutput({
      name: 'clip.mp4', type: 'video', mode: null, size: 4, created_at: 1,
      url: '/api/v1/file/clip.mp4', thumbnail_url: '',
    })
    assert.equal(file.name, 'clip.mp4')
    assert.equal(file.type, 'video/mp4')
    assert.equal(await file.text(), 'clip')
  } finally {
    globalThis.fetch = previous
  }
})
