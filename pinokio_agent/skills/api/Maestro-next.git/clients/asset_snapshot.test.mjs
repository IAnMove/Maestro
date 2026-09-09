import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { MAX_DOWNLOAD_BYTES, snapshotAsset, snapshotAssets } from './asset_snapshot.mjs'

const workspace = 'default'

function canonicalManifest(id, kind, filename, overrides = {}) {
  return {
    schema: 'hocuspocus.asset-manifest',
    schema_version: 1,
    asset: { id, kind, filename, uri: filename, media: {} },
    origin: { tool: 'snapshot-test', actor: 'system', workspace_id: workspace },
    execution: { status: 'completed', mode: 'real' },
    generation: {
      prompts: { original: 'Texto original literal', effective: `${id} prompt literal` },
      model: { provider: 'local', id: 'fixture-model' },
      parameters: {},
      inputs: [],
    },
    timing: { created_at: 1, completed_at: 2, total_ms: 1 },
    lineage: { parents: [], transformations: [] },
    technical: {},
    ...overrides,
  }
}

function assetRecord(id, kind, filename, overrides = {}) {
  return {
    id,
    kind,
    filename,
    size_bytes: 0,
    created_at: 1,
    completed_at: 2,
    metadata_status: 'canonical',
    workspace_ids: [workspace],
    locations: [{
      workspace_id: workspace,
      filename,
      url: `/api/v1/file/${encodeURIComponent(filename)}?workspace=${workspace}`,
    }],
    url: `/api/v1/file/${encodeURIComponent(filename)}?workspace=${workspace}`,
    origin: { tool: 'snapshot-test', workspace_id: workspace },
    execution: { run_id: 'run-1', task_id: 'task-1' },
    model: { provider: 'local', id: 'fixture-model' },
    prompt_preview: `${id} prompt preview`,
    manifest: canonicalManifest(id, kind, filename, { custom: { preserve: true } }),
    ...overrides,
  }
}

async function fakeServer(assets, files = {}) {
  const requests = []
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url })
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    if (request.method !== 'GET') {
      response.writeHead(405).end()
      return
    }
    if (url.pathname.startsWith('/api/v1/assets/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/v1/assets/'.length))
      const value = assets[id]
      if (!value) {
        response.writeHead(404).end('missing')
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(value))
      return
    }
    if (url.pathname.startsWith('/api/v1/file/')) {
      const key = `${url.pathname}${url.search}`
      const file = files[key]
      if (!file) {
        response.writeHead(404).end('missing file')
        return
      }
      if (file.redirect) {
        response.writeHead(302, { location: file.redirect }).end()
        return
      }
      response.writeHead(file.status || 200, { 'content-type': file.contentType || 'application/octet-stream' }).end(file.body)
      return
    }
    response.writeHead(404).end('not found')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  }
}

test('downloads canonical audio/image snapshots with exact manifest, prompt and hashes', async () => {
  const audioBody = Buffer.from('audio-fixture-bytes')
  const imageBody = Buffer.from('image-fixture-bytes')
  const audio = assetRecord('asset-song-1', 'audio', 'song.wav', { size_bytes: audioBody.length })
  const image = assetRecord('asset-cover-1', 'image', 'cover.png', { size_bytes: imageBody.length })
  const server = await fakeServer(
    { [audio.id]: audio, [image.id]: image },
    {
      '/api/v1/file/song.wav?workspace=default': { body: audioBody, contentType: 'audio/wav' },
      '/api/v1/file/cover.png?workspace=default': { body: imageBody, contentType: 'image/png' },
    },
  )
  const outputDir = await mkdtemp(path.join(tmpdir(), 'asset-snapshot-'))
  try {
    const results = await snapshotAssets({ baseUrl: server.baseUrl, assetIds: [audio.id, image.id], workspace, outputDir })
    assert.equal(results.length, 2)
    for (const result of results) {
      const metadata = JSON.parse(await readFile(result.metadataPath, 'utf8'))
      const original = result.assetId === audio.id ? audio : image
      assert.equal(metadata.asset_id, original.id)
      assert.equal(metadata.workspace, workspace)
      assert.equal(metadata.kind, original.kind)
      assert.deepEqual(metadata.manifest, original.manifest)
      assert.equal(metadata.prompt_literal, original.manifest.generation.prompts.effective)
      assert.equal(metadata.prompt_preview, original.prompt_preview)
      assert.equal(metadata.bytes, result.bytes)
      assert.equal(metadata.sha256, result.sha256)
      assert.deepEqual(metadata.catalog, original)
      assert.equal((await readFile(result.mediaPath)).length, result.bytes)
      assert.ok(path.basename(result.mediaPath).startsWith(`${original.id}-`))
      assert.ok(!path.isAbsolute(metadata.media_file))
    }
    assert.deepEqual(server.requests.map(item => item.url), [
      `/api/v1/assets/${audio.id}`,
      '/api/v1/file/song.wav?workspace=default',
      `/api/v1/assets/${image.id}`,
      '/api/v1/file/cover.png?workspace=default',
    ])
  } finally {
    await server.close()
    await rm(outputDir, { recursive: true, force: true })
  }
})

test('requires a canonical manifest with coherent asset identity, kind and filename', async () => {
  const valid = canonicalManifest('asset-canonical', 'audio', 'canonical.wav')
  const cases = [
    ['missing manifest', { manifest: undefined }, /manifest/i],
    ['wrong manifest schema', { manifest: { ...valid, schema: 'legacy.asset-manifest' } }, /canonical asset manifest/i],
    ['wrong manifest version', { manifest: { ...valid, schema_version: 2 } }, /canonical asset manifest/i],
    ['missing manifest asset', { manifest: { ...valid, asset: undefined } }, /manifest asset/i],
    ['manifest identity mismatch', { manifest: { ...valid, asset: { ...valid.asset, id: 'other-id' } } }, /manifest identity/i],
    ['manifest kind mismatch', { manifest: { ...valid, asset: { ...valid.asset, kind: 'image' } } }, /manifest kind/i],
    ['manifest filename mismatch', { manifest: { ...valid, asset: { ...valid.asset, filename: 'other.wav' } } }, /manifest filename/i],
    ['catalog filename mismatch', { filename: 'other.wav' }, /catalog filename/i],
  ]
  for (const [label, overrides, expected] of cases) {
    const record = assetRecord('asset-canonical', 'audio', 'canonical.wav', overrides)
    const server = await fakeServer({ [record.id]: record })
    const outputDir = await mkdtemp(path.join(tmpdir(), 'asset-snapshot-manifest-'))
    try {
      await assert.rejects(
        snapshotAsset({ baseUrl: server.baseUrl, assetId: record.id, workspace, outputDir }),
        expected,
        `${label} must fail closed`,
      )
      assert.equal(server.requests.some(item => item.url?.includes('/api/v1/file/')), false, `${label} must not download`)
      assert.deepEqual(await readdir(outputDir), [])
    } finally {
      await server.close()
      await rm(outputDir, { recursive: true, force: true })
    }
  }
})

test('requires HTTP 200 and a content type compatible with the catalog kind', async () => {
  const cases = [
    ['audio served as image', 'audio', 'audio.wav', 'image/png', 200, /content type/i],
    ['image served as audio', 'image', 'image.png', 'audio/wav', 200, /content type/i],
    ['partial response', 'audio', 'partial.wav', 'audio/wav', 206, /HTTP 206/i],
    ['created response', 'image', 'created.png', 'image/png', 201, /HTTP 201/i],
  ]
  for (const [label, kind, filename, contentType, status, expected] of cases) {
    const body = Buffer.from(`${label}-body`)
    const record = assetRecord(`asset-${kind}-${status}`, kind, filename, { size_bytes: body.length })
    const file = record.locations[0]
    const server = await fakeServer(
      { [record.id]: record },
      { [file.url]: { body, contentType, status } },
    )
    const outputDir = await mkdtemp(path.join(tmpdir(), 'asset-snapshot-content-'))
    try {
      await assert.rejects(
        snapshotAsset({ baseUrl: server.baseUrl, assetId: record.id, workspace, outputDir }),
        expected,
        `${label} must fail closed`,
      )
      assert.deepEqual(await readdir(outputDir), [])
    } finally {
      await server.close()
      await rm(outputDir, { recursive: true, force: true })
    }
  }
})

test('cancels a streaming body when received bytes exceed the bounded download limit', async () => {
  assert.equal(MAX_DOWNLOAD_BYTES, 256 * 1024 * 1024)
  const record = assetRecord('asset-stream-limit', 'audio', 'stream.wav')
  let fileRequests = 0
  let cancelled = false
  const fetchImpl = async (url) => {
    if (url.includes('/api/v1/assets/')) return new Response(JSON.stringify(record), { status: 200, headers: { 'content-type': 'application/json' } })
    fileRequests += 1
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.enqueue(new Uint8Array([4, 5]))
      },
      cancel() { cancelled = true },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'audio/wav' } })
  }
  const outputDir = await mkdtemp(path.join(tmpdir(), 'asset-snapshot-limit-'))
  try {
    await assert.rejects(
      snapshotAsset({ baseUrl: 'http://127.0.0.1:43210', assetId: record.id, workspace, outputDir, maxBytes: 4, fetchImpl }),
      /download limit/i,
    )
    assert.equal(fileRequests, 1)
    assert.equal(cancelled, true)
    assert.deepEqual(await readdir(outputDir), [])
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
})

test('validates identity, canonical status, type, workspace and unique safe location before downloading', async () => {
  const cases = [
    ['wrong identity', assetRecord('actual', 'audio', 'actual.wav'), 'requested'],
    ['wrong kind', assetRecord('wrong-kind', 'video', 'clip.mp4'), 'wrong-kind'],
    ['legacy metadata', assetRecord('legacy', 'audio', 'legacy.wav', { metadata_status: 'legacy' }), 'legacy'],
    ['wrong workspace', assetRecord('wrong-workspace', 'audio', 'other.wav', {
      workspace_ids: ['other'], locations: [{ workspace_id: 'other', filename: 'other.wav', url: '/api/v1/file/other.wav?workspace=other' }],
    }), 'wrong-workspace'],
    ['ambiguous workspace locations', assetRecord('ambiguous', 'audio', 'one.wav', {
      locations: [
        { workspace_id: workspace, filename: 'one.wav', url: '/api/v1/file/one.wav?workspace=default' },
        { workspace_id: workspace, filename: 'two.wav', url: '/api/v1/file/two.wav?workspace=default' },
      ],
    }), 'ambiguous'],
    ['remote origin', assetRecord('remote', 'image', 'remote.png', {
      locations: [{ workspace_id: workspace, filename: 'remote.png', url: 'https://evil.example/remote.png' }],
    }), 'remote'],
    ['strange location', assetRecord('strange', 'audio', 'strange.wav', {
      locations: [{ workspace_id: workspace, filename: 'strange.wav', url: '/api/v1/not-file/strange.wav?workspace=default' }],
    }), 'strange'],
  ]
  for (const [label, record, requestedId] of cases) {
    const server = await fakeServer({ [record.id]: record })
    const outputDir = await mkdtemp(path.join(tmpdir(), 'asset-snapshot-invalid-'))
    try {
      await assert.rejects(
        snapshotAsset({ baseUrl: server.baseUrl, assetId: requestedId, workspace, outputDir }),
        undefined,
        `${label} must fail closed`,
      )
      assert.equal(server.requests.some(item => item.url?.includes('/api/v1/file/')), false, `${label} must not download`)
      assert.deepEqual(await readdir(outputDir), [])
    } finally {
      await server.close()
      await rm(outputDir, { recursive: true, force: true })
    }
  }
})

test('rejects redirects that change origin, path, workspace, query or hash', async () => {
  const item = assetRecord('asset-redirect', 'audio', 'redirect.wav')
  const redirects = [
    'https://evil.example/escaped.wav',
    '/api/v1/file/other.wav?workspace=default',
    '/api/v1/file/redirect.wav?workspace=other',
    '/api/v1/file/redirect.wav?workspace=default&extra=1',
    '/api/v1/file/redirect.wav?workspace=default#fragment',
  ]
  for (const redirect of redirects) {
    const server = await fakeServer(
      { [item.id]: item },
      { '/api/v1/file/redirect.wav?workspace=default': { redirect } },
    )
    const outputDir = await mkdtemp(path.join(tmpdir(), 'asset-snapshot-redirect-'))
    try {
      await assert.rejects(snapshotAsset({ baseUrl: server.baseUrl, assetId: item.id, workspace, outputDir }), /redirect|path|workspace/i)
      assert.equal((await readdir(outputDir)).length, 0)
    } finally {
      await server.close()
      await rm(outputDir, { recursive: true, force: true })
    }
  }

})

test('rejects manifest identity mismatches, empty bodies and declared-size mismatches', async () => {
  const cases = [
    {
      id: 'asset-manifest-id',
      record: assetRecord('asset-manifest-id', 'audio', 'manifest.wav', {
        manifest: canonicalManifest('asset-manifest-id', 'audio', 'manifest.wav', {
          asset: { id: 'different-id', kind: 'audio', filename: 'manifest.wav' },
        }),
      }),
      body: Buffer.from('manifest'),
      expected: /manifest identity/i,
    },
    {
      id: 'asset-manifest-filename',
      record: assetRecord('asset-manifest-filename', 'audio', 'manifest.wav', {
        manifest: canonicalManifest('asset-manifest-filename', 'audio', 'manifest.wav', {
          asset: { id: 'asset-manifest-filename', kind: 'audio', filename: 'different.wav' },
        }),
      }),
      body: Buffer.from('manifest'),
      expected: /manifest filename/i,
    },
    {
      id: 'asset-empty',
      record: assetRecord('asset-empty', 'image', 'empty.png', { size_bytes: 0 }),
      body: Buffer.alloc(0),
      expected: /empty/i,
    },
    {
      id: 'asset-size',
      record: assetRecord('asset-size', 'audio', 'size.wav', { size_bytes: 99 }),
      body: Buffer.from('short'),
      expected: /size mismatch/i,
    },
  ]
  for (const item of cases) {
    const file = item.record.locations[0]
    const server = await fakeServer(
      { [item.id]: item.record },
      { [file.url]: { body: item.body } },
    )
    const outputDir = await mkdtemp(path.join(tmpdir(), 'asset-snapshot-adversarial-'))
    try {
      await assert.rejects(snapshotAsset({ baseUrl: server.baseUrl, assetId: item.id, workspace, outputDir }), item.expected)
      assert.deepEqual(await readdir(outputDir), [])
    } finally {
      await server.close()
      await rm(outputDir, { recursive: true, force: true })
    }
  }
})

test('refuses to overwrite an existing snapshot', async () => {
  const stableBody = Buffer.from('stable')
  const stable = assetRecord('asset-stable', 'image', 'stable.png', { size_bytes: stableBody.length })
  const stableServer = await fakeServer(
    { [stable.id]: stable },
    { '/api/v1/file/stable.png?workspace=default': { body: stableBody } },
  )
  const stableDir = await mkdtemp(path.join(tmpdir(), 'asset-snapshot-wx-'))
  try {
    const first = await snapshotAsset({ baseUrl: stableServer.baseUrl, assetId: stable.id, workspace, outputDir: stableDir })
    const before = await readFile(first.mediaPath)
    await assert.rejects(snapshotAsset({ baseUrl: stableServer.baseUrl, assetId: stable.id, workspace, outputDir: stableDir }), /EEXIST|exist/i)
    assert.deepEqual(await readFile(first.mediaPath), before)
  } finally {
    await stableServer.close()
    await rm(stableDir, { recursive: true, force: true })
  }
})
