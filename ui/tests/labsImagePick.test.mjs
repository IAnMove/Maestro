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

const catalogItem = {
  name: 'shot.png',
  type: 'image',
  mode: 'image',
  size: 20,
  created_at: 2,
  url: '/api/v1/file/shot.png?workspace=default',
  thumbnail_url: '/api/v1/file/shot.png?workspace=default',
}

function mockUploadFetch(expectedUrl) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input, init) => {
    const url = String(input)
    if (url.includes(expectedUrl) && !init?.method) {
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })
    }
    if (url.includes('/api/v1/upload') && init?.method === 'POST') {
      return new Response(JSON.stringify({
        filename: 'copied.png',
        path: '/abs/uploads/copied.png',
        url: '/api/v1/uploads/copied.png',
      }), { headers: { 'content-type': 'application/json' } })
    }
    throw new Error(`unexpected fetch ${url}`)
  })
  return () => { globalThis.fetch = original }
}

test('upload catalog URLs still copy through /api/v1/upload so callers get an absolute path', async () => {
  assert.equal(isUploadOutput(uploadItem), true)
  const restore = mockUploadFetch('/api/v1/uploads/hero.png')
  try {
    const ensured = await ensureUploadsPath(uploadItem)
    assert.deepEqual(ensured, {
      path: '/abs/uploads/copied.png',
      name: 'copied.png',
      url: '/api/v1/uploads/copied.png',
    })
  } finally {
    restore()
  }
})

test('workspace catalog picks are fetched from their file URL and copied into uploads/', async () => {
  assert.equal(isUploadOutput(catalogItem), false)
  const restore = mockUploadFetch('/api/v1/file/shot.png?workspace=default')
  try {
    const ensured = await ensureUploadsPath(catalogItem)
    assert.equal(ensured.path, '/abs/uploads/copied.png')
    assert.equal(ensured.name, 'copied.png')
  } finally {
    restore()
  }
})
