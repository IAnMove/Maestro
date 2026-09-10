import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptForSlotKinds, commitTemplateSlotChoice } from '../src/features/sceneTemplates/templateSlotPick.ts'

const live = { generation: 1, workspaceId: 'ws', slotId: 'hero' }
const capture = { generation: 1, workspaceId: 'ws', slotId: 'hero' }
const catalog = {
  id: 'asset-hero',
  kind: 'image',
  filename: 'hero.png',
  metadata_status: 'canonical',
}

const output = {
  name: 'hero.png',
  type: 'image',
  mode: null,
  size: 1,
  created_at: 1,
  url: '/api/v1/file/hero.png?workspace=ws',
  asset_id: 'asset-hero',
  workspace_id: 'ws',
}

test('catalog pick loads the durable id and applies when the slot still matches', async () => {
  const result = await commitTemplateSlotChoice(live, capture, output, async id => {
    assert.equal(id, 'asset-hero')
    return catalog
  }, () => undefined)
  assert.equal(result.action, 'apply')
  if (result.action === 'apply') assert.equal(result.item.id, 'asset-hero')
})

test('local uploads without asset_id are not treated as library bindings', async () => {
  const result = await commitTemplateSlotChoice(live, capture, { ...output, asset_id: undefined }, async () => catalog, () => undefined)
  assert.equal(result.action, 'reject')
  if (result.action === 'reject') assert.equal(result.reasonKey, 'missing-id')
})

test('cancel clears; workspace, slot or generation mismatch is ignored', async () => {
  assert.equal((await commitTemplateSlotChoice(live, capture, null, async () => catalog, () => undefined)).action, 'clear')
  assert.equal((await commitTemplateSlotChoice({ ...live, generation: 4 }, capture, output, async () => catalog, () => undefined)).action, 'ignore')
  assert.equal((await commitTemplateSlotChoice({ ...live, workspaceId: 'other' }, capture, output, async () => catalog, () => undefined)).action, 'ignore')
  assert.equal((await commitTemplateSlotChoice({ ...live, slotId: 'plate' }, capture, output, async () => catalog, () => undefined)).action, 'ignore')
})

test('bindingIssue blocks a catalog item that the slot cannot use', async () => {
  const result = await commitTemplateSlotChoice(live, capture, output, async () => catalog, () => 'El slot hero no admite image.')
  assert.equal(result.action, 'reject')
  if (result.action === 'reject') {
    assert.equal(result.reasonKey, 'incompatible')
    assert.equal(result.message, 'El slot hero no admite image.')
  }
})

test('accept lists images and glb only for the slot kinds', () => {
  assert.equal(acceptForSlotKinds(['image']), 'image/*')
  assert.match(acceptForSlotKinds(['image', 'model3d']), /glb/)
})
