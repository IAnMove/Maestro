import assert from 'node:assert/strict'
import test from 'node:test'
import { commitLibraryChoice, purposeFromTab } from '../src/lib/sceneLibraryChoice.ts'

const scene = {
  name: 'shot.scene.json',
  type: 'scene',
  mode: null,
  size: 1,
  created_at: 1,
  url: '/api/v1/file/shot.scene.json',
}

const clip = {
  name: 'shot_3d_abcdef.mp4',
  type: 'video',
  mode: '3d-scene-compositor',
  size: 1,
  created_at: 1,
  url: '/api/v1/file/shot_3d_abcdef.mp4',
}

const live = {
  generation: 1,
  workspaceId: 'ws',
  purpose: 'open-scene',
  open: true,
}

const capture = {
  generation: 1,
  workspaceId: 'ws',
  purpose: 'open-scene',
}

test('saved scenes and compositor clips are different purposes', () => {
  assert.equal(purposeFromTab('scenes'), 'open-scene')
  assert.equal(purposeFromTab('videos'), 'recover-recipe')
  assert.equal(commitLibraryChoice(live, capture, scene).action, 'open-scene')
  assert.equal(commitLibraryChoice({ ...live, purpose: 'recover-recipe' }, { ...capture, purpose: 'recover-recipe' }, clip).action, 'recover-recipe')
  assert.equal(commitLibraryChoice(live, capture, clip).action, 'ignore')
  assert.equal(commitLibraryChoice({ ...live, purpose: 'recover-recipe' }, { ...capture, purpose: 'recover-recipe' }, scene).action, 'ignore')
})

test('cancel, closed dialog, tab or workspace change do not open a scene', () => {
  assert.equal(commitLibraryChoice(live, capture, null).action, 'ignore')
  assert.equal(commitLibraryChoice({ ...live, open: false }, capture, scene).action, 'ignore')
  assert.equal(commitLibraryChoice({ ...live, generation: 4 }, capture, scene).action, 'ignore')
  assert.equal(commitLibraryChoice({ ...live, workspaceId: 'other' }, capture, scene).action, 'ignore')
  assert.equal(commitLibraryChoice({ ...live, purpose: 'recover-recipe' }, capture, scene).action, 'ignore')
})
