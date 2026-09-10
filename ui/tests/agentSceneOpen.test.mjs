import assert from 'node:assert/strict'
import test from 'node:test'
import { loadAgentLibraryScene } from '../src/lib/agentSceneOpen.ts'

const scene = {
  version: 1,
  name: 'Concierto arcano',
  width: 1280,
  height: 720,
  duration: 8,
  layers: [{
    id: 'hero',
    name: 'Mago',
    type: 'image',
    source: '/api/v1/file/hero.png',
    visible: true,
    z: 0,
    transform: { x: 50, y: 50, scale: 1, opacity: 1 },
    animation: { start: { x: 50, y: 50, scale: 1 }, end: { x: 50, y: 50, scale: 1 }, duration: 8, curve: 'linear' },
  }],
}
const file = {
  name: '2026-08-30-14h05m02s_Concierto-arcano_a1b2c3.scene.json',
  url: '/api/v1/file/concert.scene.json',
  type: 'scene',
}
const originalFetch = globalThis.fetch

test.afterEach(() => { globalThis.fetch = originalFetch })

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('a late Wizard open must not return a scene after the workspace moves', async () => {
  let releaseList
  let sceneFetches = 0
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('/api/v1/outputs')) {
      return new Promise(resolve => { releaseList = resolve })
    }
    sceneFetches += 1
    return jsonResponse(scene)
  }
  let current = true
  const opening = loadAgentLibraryScene('Concierto arcano', 'one', () => current)
  await new Promise(resolve => { const wait = () => { if (releaseList) resolve(undefined); else setTimeout(wait, 0) }; wait() })
  current = false
  releaseList(jsonResponse({ outputs: [file], total: 1 }))
  assert.deepEqual(await opening, { ok: false, reason: 'stale' })
  assert.equal(sceneFetches, 0)
})

test('a late scene payload must not import after the workspace moves', async () => {
  let releaseScene
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('/api/v1/outputs')) return jsonResponse({ outputs: [file], total: 1 })
    return new Promise(resolve => { releaseScene = resolve })
  }
  let current = true
  const opening = loadAgentLibraryScene('Concierto arcano', 'one', () => current)
  await new Promise(resolve => { const wait = () => { if (releaseScene) resolve(undefined); else setTimeout(wait, 0) }; wait() })
  current = false
  releaseScene(jsonResponse(scene))
  assert.deepEqual(await opening, { ok: false, reason: 'stale' })
})

test('a current Wizard open still returns the saved compositor scene', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('/api/v1/outputs')) return jsonResponse({ outputs: [file], total: 1 })
    return jsonResponse(scene)
  }
  const loaded = await loadAgentLibraryScene('Concierto arcano', 'one', () => true)
  assert.equal(loaded.ok, true)
  if (!loaded.ok) return
  assert.equal(loaded.scene.name, 'Concierto arcano')
  assert.equal(loaded.label, 'Concierto arcano')
  assert.equal(loaded.file.name, file.name)
})

test('missing and ambiguous saved names stay fail-closed', async () => {
  globalThis.fetch = async () => jsonResponse({ outputs: [], total: 0 })
  assert.deepEqual(await loadAgentLibraryScene('Missing', 'one', () => true), {
    ok: false,
    reason: 'missing',
    availableTitles: [],
  })

  globalThis.fetch = async () => jsonResponse({
    outputs: [
      { ...file, name: '2026-08-30-14h05m02s_Concierto-arcano_aaaaaa.scene.json' },
      { ...file, name: '2026-08-30-14h05m02s_Concierto-arcano_bbbbbb.scene.json' },
    ],
    total: 2,
  })
  assert.deepEqual(await loadAgentLibraryScene('Concierto arcano', 'one', () => true), { ok: false, reason: 'ambiguous' })
})
