import assert from 'node:assert/strict'
import test from 'node:test'
import {
  effectiveSceneGenerationPolicy, parseSceneGenerationPolicy, SCENE_GENERATION_POLICIES,
  SceneGenerationPolicyError, withSceneGenerationPolicy,
} from '../src/lib/sceneGenerationPolicy.ts'
import { compileRecipeShot, compileSceneRecipe, parseSceneRecipe, SCENE_RECIPE_JSON_SCHEMA, withResolvedSources } from '../src/lib/sceneRecipe.ts'
import { resolveRecipeAssets } from '../src/lib/sceneRecipeAssets.ts'
import { parseSceneFile, serializeSceneFile } from '../src/lib/sceneFile.ts'
import { sceneToRecipe } from '../src/lib/sceneToRecipe.ts'
import { createVideo3dProductionFixture, fixtureFileUrl } from './fixtures/video3dProduction.mjs'

const recipeWith = (assets = [], audio = []) => parseSceneRecipe({
  version: 1, name: 'policy-test', assets, audio,
  scene: { width: 320, height: 256, duration: 2, layers: [
    { id: 'camera', type: 'camera' },
    { id: 'plate', type: 'image', source: 'fixture-plate.svg' },
  ] },
})

const denyNetwork = t => t.mock.method(globalThis, 'fetch', async () => {
  throw new Error('Unexpected network request in a policy contract test.')
})

test('policy composition cannot relax restrictions and rejects malformed values, including falsy ones', () => {
  assert.equal(parseSceneGenerationPolicy(undefined), undefined)
  assert.deepEqual(SCENE_RECIPE_JSON_SCHEMA.properties.generationPolicy.enum, SCENE_GENERATION_POLICIES)
  for (const [leftRank, left] of SCENE_GENERATION_POLICIES.entries()) {
    for (const [rightRank, right] of SCENE_GENERATION_POLICIES.entries()) {
      assert.equal(effectiveSceneGenerationPolicy(left, right), SCENE_GENERATION_POLICIES[Math.max(leftRank, rightRank)])
    }
  }
  for (const value of [null, false, 0, '', {}, [], 'provided-onli', 'AUTO']) {
    assert.throws(() => effectiveSceneGenerationPolicy('provided_only', value), SceneGenerationPolicyError)
    assert.throws(() => parseSceneRecipe({ ...recipeWith(), generationPolicy: value }), SceneGenerationPolicyError)
  }
  const source = withSceneGenerationPolicy(recipeWith(), 'provided_only')
  const next = withSceneGenerationPolicy(source, 'auto')
  assert.notEqual(source, next)
  assert.equal(next.generationPolicy, 'provided_only')
})

test('preflight blocks a late video request before earlier allowed image/audio/model work or callbacks', async t => {
  const fetch = denyNetwork(t)
  const input = recipeWith([
    { id: 'image', kind: 'image', prompt: 'earlier image' },
    { id: 'mesh', kind: 'model3d', prompt: 'earlier mesh' },
    { id: 'video', kind: 'video', prompt: 'forbidden video' },
  ], [{ id: 'voice', kind: 'speech', prompt: 'earlier voice' }])
  const statuses = []
  await assert.rejects(resolveRecipeAssets(input, {
    workspace: 'fixture', policy: 'no_video_generation', onStatus: status => statuses.push(status),
  }), error => error.code === 'generation_forbidden' && error.assetId === 'video' && error.kind === 'video')
  assert.equal(fetch.mock.callCount(), 0)
  assert.deepEqual(statuses, [])
})

test('provided_only and legacy manual reuse rigged sources without polling, rigging or any generation', async t => {
  const fetch = denyNetwork(t)
  const input = recipeWith([
    { id: 'mesh', kind: 'model3d', source: 'rigged.glb', rig_profile: 'humanoid', animations: ['idle'] },
    { id: 'plate', kind: 'image', source: 'plate.png' },
    { id: 'clip', kind: 'video', source: 'imported.mp4' },
  ], [{ id: 'voice', kind: 'speech', source: 'spoken.wav' }])
  const before = structuredClone(input)
  for (const options of [{ policy: 'provided_only' }, { policy: 'auto', generateMissing: false }]) {
    assert.deepEqual(await resolveRecipeAssets(input, { workspace: 'fixture', ...options }), {
      mesh: 'rigged.glb', plate: 'plate.png', clip: 'imported.mp4', voice: 'spoken.wav',
    })
  }
  assert.equal(fetch.mock.callCount(), 0)
  assert.deepEqual(input, before)
})

test('provided_only rejects every missing media kind and recipe restrictions survive caller auto', async t => {
  const fetch = denyNetwork(t)
  for (const kind of ['image', 'video', 'model3d', 'audio']) {
    const asset = { id: 'missing', kind, prompt: 'fixture only' }
    const input = kind === 'audio' ? recipeWith([], [asset]) : recipeWith([asset])
    input.generationPolicy = 'provided_only'
    await assert.rejects(resolveRecipeAssets(input, { workspace: 'fixture', policy: 'auto' }), error => (
      error.code === 'generation_forbidden' && error.assetId === 'missing'
    ))
  }
  const blank = recipeWith([{ id: 'blank', kind: 'video', source: 'supplied.mp4' }])
  blank.assets[0].source = '   '
  await assert.rejects(resolveRecipeAssets(blank, { workspace: 'fixture', policy: 'no_video_generation' }), SceneGenerationPolicyError)
  for (const policy of [null, '', false, 'invalid']) {
    await assert.rejects(resolveRecipeAssets(recipeWith(), { workspace: 'fixture', policy }), SceneGenerationPolicyError)
  }
  assert.equal(fetch.mock.callCount(), 0)
})

test('no_video_generation allows imported clips and snapshots input before async resolution', async t => {
  const fetch = denyNetwork(t)
  const input = recipeWith([
    { id: 'plate', kind: 'image', source: 'plate.png' },
    { id: 'clip', kind: 'video', source: 'existing.mp4' },
  ])
  const pending = resolveRecipeAssets(input, { workspace: 'fixture', policy: 'no_video_generation' })
  input.assets[1].source = undefined
  input.assets[1].prompt = 'mutated while awaiting the image'
  input.assets.push({ id: 'injected', kind: 'video', prompt: 'must not execute' })
  assert.deepEqual(await pending, { plate: 'plate.png', clip: 'existing.mp4' })
  assert.equal(fetch.mock.callCount(), 0)
})

test('policy survives resolved recipes, both compilers, scene JSON and scene-to-recipe conversion', () => {
  const fixture = createVideo3dProductionFixture()
  const fileUrl = fixtureFileUrl(fixture.sourceByFilename)
  for (const generationPolicy of SCENE_GENERATION_POLICIES) {
    const recipe = parseSceneRecipe({ ...fixture.recipe, generationPolicy })
    const resolved = Object.fromEntries(recipe.assets.map(asset => [asset.id, asset.source]))
    const stored = withResolvedSources(recipe, resolved)
    const custom = compileRecipeShot(stored, stored.shots[1], resolved, fileUrl)
    const template = compileRecipeShot(stored, {
      name: 'template', template: 'cutout-talking-head', duration: 2,
      audioTrackIds: [], dialogueBeatIds: [],
      slots: { hero: 'luma-base', plate: 'plate-aurora', prop: 'luma-mouth-wide', foreground: 'luma-mouth-closed' },
    }, resolved, fileUrl)
    for (const scene of [custom, template]) {
      assert.equal(scene.generationPolicy, generationPolicy)
      const loaded = parseSceneFile(serializeSceneFile(scene))
      assert.equal(loaded.generationPolicy, generationPolicy)
      assert.equal(sceneToRecipe(loaded).generationPolicy, generationPolicy)
    }
  }
  const legacy = compileSceneRecipe(recipeWith(), {}, fileUrl)
  assert.equal(Object.hasOwn(legacy, 'generationPolicy'), false)
  for (const generationPolicy of [null, false, '', 'invalid']) {
    assert.throws(() => parseSceneFile(JSON.stringify({ ...legacy, generationPolicy })), SceneGenerationPolicyError)
    assert.throws(() => serializeSceneFile({ ...legacy, generationPolicy }), SceneGenerationPolicyError)
    assert.throws(() => sceneToRecipe({ ...legacy, generationPolicy }), SceneGenerationPolicyError)
    assert.throws(() => compileSceneRecipe({ ...recipeWith(), generationPolicy }, {}, fileUrl), SceneGenerationPolicyError)
  }
})

test('legacy auto still submits video through a fake API, never a live provider', async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} }, dispatchEvent() {},
  } })
  t.after(() => previousWindow
    ? Object.defineProperty(globalThis, 'window', previousWindow)
    : Reflect.deleteProperty(globalThis, 'window'))
  const submissions = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url === '/api/v1/jobs') return Response.json({ jobs: [] })
    if (url === '/api/v1/model3d/capabilities') return Response.json({ active_jobs: 0 })
    if (url === '/api/v1/generate') {
      submissions.push(JSON.parse(init.body))
      return Response.json({ job_id: 'fake-video', status: 'queued' })
    }
    if (url === '/api/v1/status/fake-video') return Response.json({ status: 'completed', output_files: ['fake.mp4'] })
    throw new Error(`Unexpected fake API route: ${url}`)
  })
  const result = await resolveRecipeAssets(recipeWith([{ id: 'clip', kind: 'video', prompt: 'fixture' }]), { workspace: 'fixture' })
  assert.deepEqual(result, { clip: 'fake.mp4' })
  assert.equal(submissions.length, 1)
  assert.equal(submissions[0].generation_mode, 'video')
})
