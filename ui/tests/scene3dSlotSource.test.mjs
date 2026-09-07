import assert from 'node:assert/strict'
import test from 'node:test'
import { applyScene3DTemplate } from '../src/features/scene3d/templates.ts'
import { parseScene3DDocument } from '../src/features/scene3d/document.ts'
import {
  commitSlotSourceChoice,
  durableScene3DSourceUrl,
  pickerOutputFromSlot,
} from '../src/features/scene3d/slotSource.ts'

const live = {
  generation: 3,
  slotId: 'subject_1',
  templateId: 'two-shot',
  workspaceId: 'film',
  exporting: false,
}

const capture = {
  generation: 3,
  slotId: 'subject_1',
  templateId: 'two-shot',
  workspaceId: 'film',
}

const catalog = {
  name: 'hero.glb',
  type: 'model3d',
  mode: null,
  size: 12,
  created_at: 1,
  url: '/api/v1/file/hero.glb?workspace=film',
}

test('catalog choice stores a durable url and workspace filename, not a blob', () => {
  const result = commitSlotSourceChoice(live, capture, catalog)
  assert.equal(result.action, 'apply')
  if (result.action !== 'apply') return
  assert.equal(result.sourceUrl.startsWith('blob:'), false)
  assert.equal(result.sourceRef.filename, 'hero.glb')
  assert.equal(result.sourceRef.workspaceId, 'film')
  assert.equal(result.clip, null)
})

test('blob urls are not committed as a scene source', () => {
  const result = commitSlotSourceChoice(live, capture, {
    ...catalog,
    url: 'blob:http://localhost/abc',
  })
  assert.equal(result.action, 'ignore')
  assert.equal(durableScene3DSourceUrl('blob:http://localhost/abc'), '')
})

test('cancel clears; export, template, workspace or generation mismatch is ignored', () => {
  assert.equal(commitSlotSourceChoice(live, capture, null).action, 'clear')
  assert.equal(commitSlotSourceChoice({ ...live, exporting: true }, capture, catalog).action, 'ignore')
  assert.equal(commitSlotSourceChoice({ ...live, generation: 9 }, capture, catalog).action, 'ignore')
  assert.equal(commitSlotSourceChoice({ ...live, templateId: 'cafe-dance' }, capture, catalog).action, 'ignore')
  assert.equal(commitSlotSourceChoice({ ...live, workspaceId: 'other' }, capture, catalog).action, 'ignore')
  assert.equal(commitSlotSourceChoice({ ...live, slotId: 'subject_2' }, capture, catalog).action, 'ignore')
})

test('save and reopen keeps sourceRef and drops blob urls', () => {
  const document = applyScene3DTemplate('two-shot')
  document.slots[0].sourceUrl = '/api/v1/file/hero.glb?workspace=film'
  document.slots[0].sourceRef = {
    workspaceId: 'film',
    filename: 'hero.glb',
    url: '/api/v1/file/hero.glb?workspace=film',
  }
  document.slots[1].sourceUrl = 'blob:http://localhost/stale'
  const restored = parseScene3DDocument(JSON.parse(JSON.stringify(document)))
  assert.ok(restored)
  assert.equal(restored.slots[0].sourceRef?.filename, 'hero.glb')
  assert.equal(restored.slots[0].sourceUrl, '/api/v1/file/hero.glb?workspace=film')
  assert.equal(restored.slots[1].sourceUrl, '')
  assert.equal(restored.slots[1].sourceRef, undefined)
  assert.equal(pickerOutputFromSlot(restored.slots[0].sourceUrl, 'model3d', restored.slots[0].sourceRef)?.name, 'hero.glb')
})

test('drive and cafe templates still expose only the documented slot roles', () => {
  const cafe = applyScene3DTemplate('cafe-dance')
  assert.deepEqual(cafe.slots.map(slot => slot.slot), ['subject_1'])
  const chase = applyScene3DTemplate('drive-chase')
  assert.deepEqual(chase.slots.map(slot => slot.slot), ['background'])
  const hero = applyScene3DTemplate('drive-hero')
  assert.deepEqual(hero.slots.map(slot => slot.slot), ['subject_1', 'background'])
})
