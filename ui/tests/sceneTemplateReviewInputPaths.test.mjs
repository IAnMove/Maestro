import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { startReviewServer } from '../scripts/sceneTemplateReview/server.mjs'

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hocus-review-input-paths-'))
  const uiDist = path.join(root, 'ui')
  await fs.mkdir(uiDist)
  await fs.writeFile(path.join(uiDist, 'index.html'), '<!doctype html><title>Input path test</title>')
  return { root, uiDist }
}

test('allows a regular inputs directory reached through an aliased parent path', async () => {
  const paths = await fixture()
  const realParent = path.join(paths.root, 'real-parent')
  const aliasParent = path.join(paths.root, 'alias-parent')
  const outputName = 'output'
  await fs.mkdir(path.join(realParent, outputName), { recursive: true })
  await fs.symlink(realParent, aliasParent, 'dir')

  const server = await startReviewServer({
    uiDist: paths.uiDist,
    outputDir: path.join(aliasParent, outputName),
    host: '127.0.0.1',
    port: 0,
  })
  try {
    const inputName = 'hero.png'
    const inputBytes = Buffer.from('aliased parent input')
    await fs.writeFile(path.join(server.inputsDir, inputName), inputBytes, { flag: 'wx' })
    const registered = await server.registerInput(inputName)
    assert.deepEqual(registered, {
      name: inputName,
      size: inputBytes.length,
      url: `/api/v1/file/${encodeURIComponent(inputName)}?workspace=default`,
    })
    const response = await fetch(`${server.localOrigin}${registered.url}`)
    assert.equal(response.status, 200)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), inputBytes)
  } finally {
    await server.close()
    await fs.rm(paths.root, { recursive: true, force: true })
  }
})

test('rejects an inputs directory that is itself a symlink', async () => {
  const paths = await fixture()
  const outputDir = path.join(paths.root, 'output')
  const outside = path.join(paths.root, 'outside-inputs')
  await fs.mkdir(outputDir)
  await fs.mkdir(outside)
  const server = await startReviewServer({ uiDist: paths.uiDist, outputDir, host: '127.0.0.1', port: 0 })
  try {
    await fs.rm(server.inputsDir, { recursive: true, force: true })
    await fs.symlink(outside, server.inputsDir, 'dir')
    await fs.writeFile(path.join(outside, 'hero.png'), Buffer.from('outside input'))
    await assert.rejects(() => server.registerInput('hero.png'), /symlink|directory|outside/i)
  } finally {
    await server.close()
    await fs.rm(paths.root, { recursive: true, force: true })
  }
})
