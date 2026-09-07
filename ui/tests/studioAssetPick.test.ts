import assert from 'node:assert/strict'
import test from 'node:test'
import { placeholderMediaFile, studioMediaPath } from '../src/lib/studioAssetPick.ts'
import { fileMatchesConstraints } from '../src/features/asset-picker/upload.ts'

test('studioMediaPath prefers explicit path then server reference', () => {
  assert.equal(studioMediaPath({
    name: 'hero.png', type: 'image', mode: null, size: 1, created_at: 1,
    url: '/api/v1/file/hero.png?workspace=default', thumbnail_url: '', workspace_id: 'default',
  }), 'hero.png')
  assert.equal(studioMediaPath({
    name: 'clip.mp4', type: 'video', mode: null, size: 1, created_at: 1,
    url: '/api/v1/uploads/clip.mp4', thumbnail_url: '', path: 'uploads/clip.mp4',
  }), 'uploads/clip.mp4')
  assert.equal(studioMediaPath({
    name: '9f2.wav', type: 'audio', mode: null, size: 1, created_at: 1,
    url: '/api/v1/uploads/audio/9f2.wav', thumbnail_url: '',
  }), 'audio/9f2.wav')
})

test('placeholder media file does not carry downloaded bytes', async () => {
  const file = placeholderMediaFile({
    name: 'clip.mp4', type: 'video', mode: null, size: 4, created_at: 1,
    url: '/api/v1/file/clip.mp4', thumbnail_url: '',
  })
  assert.equal(file.name, 'clip.mp4')
  assert.equal(file.size, 0)
})

test('drop kinds reject the wrong media without uploading', () => {
  const audio = new File(['x'], 'voice.wav', { type: 'audio/wav' })
  const image = new File(['x'], 'hero.png', { type: 'image/png' })
  assert.equal(fileMatchesConstraints(audio, ['image']), false)
  assert.equal(fileMatchesConstraints(image, ['image']), true)
})
