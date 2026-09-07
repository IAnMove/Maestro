import assert from 'node:assert/strict'
import test from 'node:test'
import type { AssetCatalogItem } from '../src/api/assets'
import { catalogOutputsFor, fileFromStudioOutput, studioMediaPath } from '../src/lib/studioInputsPick.ts'

const hero: AssetCatalogItem = {
  id: 'asset-hero',
  kind: 'image',
  filename: 'hero.png',
  size_bytes: 12,
  created_at: 1,
  completed_at: 2,
  metadata_status: 'canonical',
  workspace_ids: ['default'],
  locations: [{ workspace_id: 'default', filename: 'hero.png', url: '/api/v1/file/hero.png?workspace=default' }],
  url: '/api/v1/file/hero.png?workspace=default',
  origin: { tool: 'studio' },
  execution: {},
  model: { provider: 'local', id: 'flux' },
  prompt_preview: 'hero',
}

test('studioMediaPath keeps catalog filenames and prefixes uploads', () => {
  assert.equal(studioMediaPath({
    name: 'hero.png', type: 'image', mode: null, size: 1, created_at: 1,
    url: '/api/v1/file/hero.png', thumbnail_url: '',
  }), 'hero.png')
  assert.equal(studioMediaPath({
    name: 'clip.mp4', type: 'video', mode: null, size: 1, created_at: 1,
    url: '/api/v1/uploads/clip.mp4', thumbnail_url: '',
  }), 'uploads/clip.mp4')
})

test('catalogOutputsFor keeps only requested kinds', () => {
  const clip: AssetCatalogItem = { ...hero, id: 'asset-clip', kind: 'video', filename: 'clip.mp4', url: '/api/v1/file/clip.mp4', locations: [{ workspace_id: 'default', filename: 'clip.mp4', url: '/api/v1/file/clip.mp4' }] }
  const images = catalogOutputsFor([hero, clip], 'default', ['image'])
  assert.deepEqual(images.map(item => item.name), ['hero.png'])
  const mixed = catalogOutputsFor([hero, clip], 'default', ['image', 'video'])
  assert.deepEqual(mixed.map(item => item.name), ['hero.png', 'clip.mp4'])
})

test('fileFromStudioOutput reads the chosen url as a File', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = async () => new Response(new Blob(['abc'], { type: 'image/png' }), { status: 200 })
  try {
    const file = await fileFromStudioOutput({
      name: 'hero.png', type: 'image', mode: null, size: 3, created_at: 1,
      url: '/api/v1/file/hero.png', thumbnail_url: '',
    })
    assert.equal(file.name, 'hero.png')
    assert.equal(file.type, 'image/png')
    assert.equal(await file.text(), 'abc')
  } finally {
    globalThis.fetch = previous
  }
})
