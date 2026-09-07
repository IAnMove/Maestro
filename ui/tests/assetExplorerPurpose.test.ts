import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyExplorerChoice,
  assetsForExplorer,
  explorerAllowsNone,
  explorerSelectedName,
  explorerTitleKey,
} from '../src/components/common/assetExplorer.ts'
import type { ApiOutput } from '../src/api/outputs'

const item = (name: string, type: ApiOutput['type'] = 'image'): ApiOutput => ({
  name,
  type,
  mode: null,
  size: 1,
  created_at: 1,
  url: `/api/v1/file/${name}`,
  thumbnail_url: `/api/v1/file/${name}.png`,
})

test('explorer helpers pick the catalog, title and optional-none flag', () => {
  const models = [item('hero.glb', 'model3d')]
  const media = [item('plate.png')]
  const visuals = [...models, ...media]
  const audio = [item('score.wav', 'audio')]
  assert.equal(explorerTitleKey('layer-model'), 'animator.generatedModels')
  assert.equal(explorerTitleKey('scene-audio'), 'animator.chooseAudio')
  assert.deepEqual(assetsForExplorer('layer-model', models, media, visuals, audio), models)
  assert.deepEqual(assetsForExplorer('narrative-plate', models, media, visuals, audio), media)
  assert.equal(explorerSelectedName('narrative-hero', { hero: 'hero.glb', plate: '', prop: '', foreground: '' }), 'hero.glb')
  assert.equal(explorerAllowsNone('narrative-prop'), true)
  assert.equal(explorerAllowsNone('layer-media'), false)
})

test('applyExplorerChoice routes a pick to the matching scene slot', () => {
  const calls: string[] = []
  const handlers = {
    addLayer: (type: 'model3d' | 'video' | 'image', url: string, name: string) => { calls.push(`layer:${type}:${name}:${url}`) },
    setHero: (name: string) => { calls.push(`hero:${name}`) },
    setPlate: (name: string) => { calls.push(`plate:${name}`) },
    setProp: (name: string) => { calls.push(`prop:${name}`) },
    setForeground: (name: string) => { calls.push(`foreground:${name}`) },
    attachAudio: (filename: string, title: string) => { calls.push(`audio:${filename}:${title}`) },
  }
  applyExplorerChoice('layer-model', item('hero.glb', 'model3d'), handlers)
  applyExplorerChoice('layer-media', item('clip.mp4', 'video'), handlers)
  applyExplorerChoice('narrative-hero', item('hero.glb', 'model3d'), handlers)
  applyExplorerChoice('narrative-plate', null, handlers)
  applyExplorerChoice('scene-audio', item('score.wav', 'audio'), handlers)
  assert.deepEqual(calls, [
    'layer:model3d:hero.glb:/api/v1/file/hero.glb',
    'layer:video:clip.mp4:/api/v1/file/clip.mp4',
    'hero:hero.glb',
    'plate:',
    'audio:score.wav:score',
  ])
})
