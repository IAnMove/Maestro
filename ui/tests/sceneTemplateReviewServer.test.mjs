import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import {
  MAX_BLOCKED_REQUESTS,
  MAX_INPUT_BYTES,
  MAX_INPUT_FILE_BYTES,
  MAX_INPUTS,
  startReviewServer,
} from '../scripts/sceneTemplateReview/server.mjs'

const scene = {
  version: 1,
  name: 'HTTP sandbox scene',
  generationPolicy: 'provided_only',
  width: 1280,
  height: 720,
  fps: 30,
  duration: 4,
  layers: [{
    id: 'hero',
    name: 'hero',
    type: 'image',
    source: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
    visible: true,
    z: 1,
  }],
  narrative: { templateId: 'http-sandbox-test', variant: 'coral' },
}
const preview = 'data:image/png;base64,iVBORw0KGgo='
// Transport fixture only: this deliberately has an ftyp header but is not a
// playable MP4. Real compositor validity is covered by the local render smoke.
const mp4TransportBytes = Buffer.from([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00,
])

let outputDir
let server

async function createSandbox(limits) {
  const sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hocus-scene-template-review-test-'))
  const uiDist = path.join(sandboxDir, 'ui')
  await fs.mkdir(uiDist)
  await fs.writeFile(path.join(uiDist, 'index.html'), '<!doctype html><title>Test fixture</title>')
  const sandbox = await startReviewServer({ uiDist, outputDir: sandboxDir, host: '127.0.0.1', port: 0, limits })
  return { directory: sandboxDir, server: sandbox }
}

before(async () => {
  const sandbox = await createSandbox()
  outputDir = sandbox.directory
  server = sandbox.server
})

after(async () => {
  await server?.close()
  if (outputDir) await fs.rm(outputDir, { recursive: true, force: true })
})

const url = pathname => `${server.localOrigin}${pathname}`

const requestWithHeaders = (pathname, headers) => new Promise((resolve, reject) => {
  const target = new URL(url(pathname))
  const request = http.request({
    hostname: target.hostname,
    port: target.port,
    path: `${target.pathname}${target.search}`,
    headers,
  }, response => {
    response.resume()
    response.once('end', () => resolve(response))
  })
  request.once('error', reject)
  request.end()
})

const postScene = (targetServer, payload) => fetch(`${targetServer.localOrigin}/api/v1/scenes`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
})

const outputCount = async targetServer => {
  const response = await fetch(`${targetServer.localOrigin}/api/v1/outputs`)
  return (await response.json()).total
}

test('publishes defensive headers and a bounded status contract without leaking its filesystem path', async () => {
  const response = await fetch(url('/api/v1/scene-template-review/status'))
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(response.headers.get('x-frame-options'), 'DENY')
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/)
  assert.equal(body.outputDir, undefined)
  assert.equal(body.storage, 'temporary; no restart recovery')
  assert.equal(body.writeScope, 'loopback-only')
  assert.equal(body.quota.maxOutputs, 128)
  assert.equal(body.quota.maxBytes, 256 * 1024 * 1024)
})

test('rejects unknown APIs with bounded blocked diagnostics', async () => {
  const first = await fetch(url('/api/v1/unknown-provider'))
  assert.equal(first.status, 403)

  for (let index = 0; index < MAX_BLOCKED_REQUESTS + 12; index += 1) {
    const response = await fetch(url(`/api/v1/unknown-provider-${index}`))
    assert.equal(response.status, 403)
  }
  const status = await fetch(url('/api/v1/scene-template-review/status'))
  const body = await status.json()
  assert.equal(status.status, 200)
  assert.ok(body.blocked.length <= MAX_BLOCKED_REQUESTS)
})

test('rejects a foreign Origin before writing outputs', async () => {
  const response = await fetch(url('/api/v1/scenes'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://foreign.example',
    },
    body: JSON.stringify({ scene, preview }),
  })
  assert.equal(response.status, 403)

  const outputs = await fetch(url('/api/v1/outputs'))
  const body = await outputs.json()
  assert.equal(outputs.status, 200)
  assert.equal(body.total, 0)
})

test('rejects malformed JSON, missing multipart recordings, invalid transport bytes and unsafe sources', async () => {
  const malformed = await fetch(url('/api/v1/scenes'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not-json',
  })
  assert.equal(malformed.status, 400)

  const missingFile = new FormData()
  missingFile.append('metadata', JSON.stringify({ scene }))
  const missing = await fetch(url('/api/v1/scenes/recordings'), { method: 'POST', body: missingFile })
  assert.equal(missing.status, 400)

  const invalidTransport = new FormData()
  invalidTransport.append('file', new Blob([Buffer.from('not-an-mp4')], { type: 'video/mp4' }), 'scene.mp4')
  invalidTransport.append('metadata', JSON.stringify({ scene }))
  const invalid = await fetch(url('/api/v1/scenes/recordings'), { method: 'POST', body: invalidTransport })
  assert.equal(invalid.status, 400)

  for (const source of [
    'blob:http://127.0.0.1/temporary',
    'https://example.com/remote.png',
    'file:///tmp/scene.png',
    '/tmp/scene.png',
  ]) {
    const unsafeScene = { ...scene, layers: [{ ...scene.layers[0], source }] }
    const response = await postScene(server, { scene: unsafeScene, preview })
    assert.equal(response.status, 400, source)
  }
  const externalPreview = await postScene(server, { scene, preview: 'https://example.com/poster.png' })
  assert.equal(externalPreview.status, 400)
  assert.equal(await outputCount(server), 0)
})

test('rejects a foreign Host header, including a loopback socket', async () => {
  const response = await requestWithHeaders('/api/v1/scene-template-review/status', { Host: 'evil.example' })
  assert.equal(response.statusCode, 403)
})

test('does not resolve traversal names through the output index', async () => {
  const response = await fetch(url('/api/v1/file/%2e%2e%2fetc%2fpasswd'))
  assert.equal(response.status, 404)
})

test('serves only indexed built UI files, with no dev source routes or backend proxy', async () => {
  const response = await fetch(url('/scene-template-review?editor=1'))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/html/)
  assert.match(await response.text(), /Test fixture/)
  assert.equal((await fetch(url('/@fs/etc/passwd'))).status, 404)
  assert.equal((await fetch(url('/@vite/client'))).status, 404)
  assert.equal((await fetch(url('/src/main.tsx'))).status, 404)
})

test('failure evidence has a safe indexed filename without overwriting a success', async () => {
  const filename = 'test.failure-12345678-abcd.json'
  await fs.writeFile(path.join(server.previewsDir, filename), JSON.stringify({ status: 'render-failed' }))
  server.registerPreview(filename)
  const response = await fetch(url(`/scene-template-previews/${filename}`))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).status, 'render-failed')
  const invalidRange = await fetch(url(`/scene-template-previews/${filename}`), { headers: { range: 'not-a-range' } })
  assert.equal(invalidRange.status, 416)
  assert.equal(invalidRange.headers.get('content-range'), 'bytes */26')
  assert.throws(() => server.registerPreview('../outside.json'), /Unsafe/)
})

test('saves an editable scene and returns exact metadata through the output endpoint', async () => {
  const response = await fetch(url('/api/v1/scenes'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scene, preview, workspace: 'default' }),
  })
  assert.equal(response.status, 200)
  const saved = await response.json()
  assert.match(saved.name, /^review-[0-9a-f-]+\.maestro-scene\.json$/)

  const metadata = await fetch(url(`/api/v1/outputs/${encodeURIComponent(saved.name)}/metadata`))
  assert.equal(metadata.status, 200)
  assert.deepEqual((await metadata.json()).params.scene, scene)

  const file = await fetch(url(`/api/v1/file/${encodeURIComponent(saved.name)}?workspace=default`))
  assert.equal(file.status, 200)
  assert.deepEqual(JSON.parse(await file.text()), scene)
})

test('enforces a lower HTTP write budget without allocating large fixtures', async () => {
  const sandbox = await createSandbox({ maxOutputs: 1, maxBytes: 8_000 })
  try {
    const first = await postScene(sandbox.server, { scene, preview })
    assert.equal(first.status, 200)
    await first.json()

    const second = await postScene(sandbox.server, { scene, preview })
    assert.equal(second.status, 400)
    assert.match((await second.json()).detail, /quota/i)
    assert.equal(await outputCount(sandbox.server), 1)

    const status = await fetch(`${sandbox.server.localOrigin}/api/v1/scene-template-review/status`)
    assert.deepEqual((await status.json()).quota, {
      outputs: 1,
      bytes: Buffer.byteLength(JSON.stringify(scene, null, 2)) + Buffer.byteLength(JSON.stringify({ scene, preview })),
      maxOutputs: 1,
      maxBytes: 8_000,
    })
  } finally {
    await sandbox.server.close()
    await fs.rm(sandbox.directory, { recursive: true, force: true })
  }
})

test('returns conflict while another loopback write is still receiving its body', async () => {
  const target = new URL(url('/api/v1/scenes'))
  const body = JSON.stringify({ scene, preview })
  let request
  const firstResponse = new Promise((resolve, reject) => {
    request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
    }, response => {
      response.resume()
      response.once('end', () => resolve(response))
    })
    request.once('error', reject)
  })
  request.write(body)
  await new Promise(resolve => setTimeout(resolve, 20))
  try {
    const concurrent = await postScene(server, { scene, preview })
    assert.equal(concurrent.status, 409)
    assert.match((await concurrent.json()).detail, /in progress/i)
  } finally {
    request.end()
  }
  assert.equal((await firstResponse).statusCode, 200)
})

test('indexed references stay relative for CSP on every served origin', async () => {
  server.registerPreview('indexed-test.png')
  const relative = '/scene-template-previews/indexed-test.png'
  const withSource = source => ({ scene: { ...scene, layers: [{ ...scene.layers[0], source }] } })
  assert.equal((await postScene(server, withSource(relative))).status, 200)
  for (const origin of [server.localOrigin, `http://localhost:${server.port}`, 'http://review.invalid']) {
    const rejected = await postScene(server, withSource(`${origin}${relative}`))
    assert.equal(rejected.status, 400)
    assert.match((await rejected.json()).detail, /inline or indexed/i)
  }
})

test('recording quota reserves the exact formatted sidecar bytes before writing', async () => {
  const params = { scene, workspace: 'default' }
  const exactBytes = mp4TransportBytes.length + Buffer.byteLength(JSON.stringify({ params }, null, 2))
  for (const allowance of [exactBytes - 1, exactBytes]) {
    const sandbox = await createSandbox({ maxBytes: allowance })
    try {
      const form = new FormData()
      form.append('file', new Blob([mp4TransportBytes], { type: 'video/mp4' }), 'scene.mp4')
      form.append('metadata', JSON.stringify(params))
      const response = await fetch(`${sandbox.server.localOrigin}/api/v1/scenes/recordings`, { method: 'POST', body: form })
      assert.equal(response.status, allowance < exactBytes ? 400 : 200)
      const names = await fs.readdir(sandbox.server.exportsDir)
      const sizes = await Promise.all(names.map(async name => (await fs.stat(path.join(sandbox.server.exportsDir, name))).size))
      assert.equal(sizes.reduce((total, size) => total + size, 0), allowance < exactBytes ? 0 : exactBytes)
    } finally {
      await sandbox.server.close()
      await fs.rm(sandbox.directory, { recursive: true, force: true })
    }
  }
})

test('records the MP4 transport contract and supports range and HEAD reads', async () => {
  const form = new FormData()
  form.append('file', new Blob([mp4TransportBytes], { type: 'video/mp4' }), 'scene.mp4')
  form.append('metadata', JSON.stringify({ scene, workspace: 'default' }))
  const response = await fetch(url('/api/v1/scenes/recordings'), { method: 'POST', body: form })
  assert.equal(response.status, 200)
  const saved = await response.json()
  assert.equal(saved.mode, '3d-scene-compositor')
  assert.equal(saved.type, 'video')

  const metadata = await fetch(url(`/api/v1/outputs/${encodeURIComponent(saved.name)}/metadata`))
  assert.equal(metadata.status, 200)
  assert.deepEqual((await metadata.json()).params.scene, scene)

  const range = await fetch(url(`/api/v1/file/${encodeURIComponent(saved.name)}`), {
    headers: { Range: 'bytes=4-7' },
  })
  assert.equal(range.status, 206)
  assert.equal(range.headers.get('content-range'), `bytes 4-7/${mp4TransportBytes.length}`)
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), Buffer.from('ftyp'))

  const head = await fetch(url(`/api/v1/file/${encodeURIComponent(saved.name)}`), { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(Number(head.headers.get('content-length')), mp4TransportBytes.length)
  assert.equal((await head.arrayBuffer()).byteLength, 0)
})

test('registers raster inputs without publishing them as generated outputs', async () => {
  const sandbox = await createSandbox()
  const inputBytes = Buffer.from('sandbox raster input')
  try {
    const inputName = 'hero.JPG'
    await fs.writeFile(path.join(sandbox.server.inputsDir, inputName), inputBytes, { flag: 'wx' })
    const registered = await sandbox.server.registerInput(inputName)
    assert.deepEqual(registered, {
      name: inputName,
      size: inputBytes.length,
      url: `/api/v1/file/${encodeURIComponent(inputName)}?workspace=default`,
    })

    const status = await fetch(`${sandbox.server.localOrigin}/api/v1/scene-template-review/status`)
    const statusBody = await status.json()
    assert.equal(statusBody.inputCount, 1)
    assert.equal(statusBody.inputBytes, inputBytes.length)
    assert.equal((await outputCount(sandbox.server)), 0)

    const file = await fetch(`${sandbox.server.localOrigin}${registered.url}`)
    assert.equal(file.status, 200)
    assert.equal(file.headers.get('content-type'), 'image/jpeg')
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), inputBytes)

    const indexed = {
      ...scene,
      layers: [{ ...scene.layers[0], source: registered.url }],
    }
    const saved = await postScene(sandbox.server, { scene: indexed, preview })
    assert.equal(saved.status, 200)
  } finally {
    await sandbox.server.close()
    await fs.rm(sandbox.directory, { recursive: true, force: true })
  }
})

test('rejects unsafe, non-raster, symlinked, oversized and duplicate inputs', async () => {
  const sandbox = await createSandbox()
  try {
    for (const unsafe of ['', '.', '..', '../hero.png', 'nested/hero.png', '..\\hero.png', 'hero.svg', '.hidden.png', 'hero.png/../x']) {
      await assert.rejects(() => sandbox.server.registerInput(unsafe), /safe JPG|basename/i, unsafe)
    }

    const directory = path.join(sandbox.server.inputsDir, 'directory.png')
    await fs.mkdir(directory)
    await assert.rejects(() => sandbox.server.registerInput('directory.png'), /regular|symlink/i)

    const target = path.join(sandbox.server.inputsDir, 'target.png')
    const symlink = path.join(sandbox.server.inputsDir, 'linked.png')
    await fs.writeFile(target, Buffer.from('target'), { flag: 'wx' })
    await fs.symlink(target, symlink)
    await assert.rejects(() => sandbox.server.registerInput('linked.png'), /regular|symlink/i)

    const emptyName = 'empty.jpg'
    await fs.writeFile(path.join(sandbox.server.inputsDir, emptyName), Buffer.alloc(0), { flag: 'wx' })
    await assert.rejects(() => sandbox.server.registerInput(emptyName), /empty/i)

    const oversizedName = 'oversized.webp'
    await fs.writeFile(path.join(sandbox.server.inputsDir, oversizedName), Buffer.alloc(MAX_INPUT_FILE_BYTES + 1), { flag: 'wx' })
    await assert.rejects(() => sandbox.server.registerInput(oversizedName), /limit/i)

    const validName = 'valid.png'
    await fs.writeFile(path.join(sandbox.server.inputsDir, validName), Buffer.from('valid'), { flag: 'wx' })
    await sandbox.server.registerInput(validName)
    await assert.rejects(() => sandbox.server.registerInput(validName), /already indexed/i)
    assert.equal(MAX_INPUTS, 64)
    assert.equal(MAX_INPUT_FILE_BYTES, 4 * 1024 * 1024)
    assert.equal(MAX_INPUT_BYTES, 128 * 1024 * 1024)
  } finally {
    await sandbox.server.close()
    await fs.rm(sandbox.directory, { recursive: true, force: true })
  }
})

test('keeps concurrent raster registration within the finite input count', async () => {
  const sandbox = await createSandbox()
  try {
    const names = Array.from({ length: MAX_INPUTS + 1 }, (_, index) => `concurrent-${index}.png`)
    await Promise.all(names.map(name => fs.writeFile(
      path.join(sandbox.server.inputsDir, name), Buffer.from('x'), { flag: 'wx' },
    )))
    const results = await Promise.allSettled(names.map(name => sandbox.server.registerInput(name)))
    assert.equal(results.filter(result => result.status === 'fulfilled').length, MAX_INPUTS)
    assert.equal(results.filter(result => result.status === 'rejected').length, 1)

    const status = await fetch(`${sandbox.server.localOrigin}/api/v1/scene-template-review/status`)
    const statusBody = await status.json()
    assert.equal(statusBody.inputCount, MAX_INPUTS)
    assert.equal(statusBody.inputBytes, MAX_INPUTS)
  } finally {
    await sandbox.server.close()
    await fs.rm(sandbox.directory, { recursive: true, force: true })
  }
})
