import assert from 'node:assert/strict'
import test from 'node:test'
import { ensureUploadsPath, isUploadOutput } from '../src/lib/labsImagePick.ts'

const uploadItem = {
  name: 'hero.png',
  type: 'image',
  mode: null,
  size: 12,
  created_at: 1,
  url: '/api/v1/uploads/hero.png',
  thumbnail_url: '/api/v1/uploads/hero.png',
}

test('upload catalog URLs stay in uploads/ without a second POST', async () => {
  assert.equal(isUploadOutput(uploadItem), true)
  const ensured = await ensureUploadsPath(uploadItem)
  assert.deepEqual(ensured, { path: 'uploads/hero.png', name: 'hero.png', url: '/api/v1/uploads/hero.png' })
})
