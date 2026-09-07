import assert from 'node:assert/strict'
import test from 'node:test'
import type { ApiOutput } from '../src/api/outputs.ts'
import {
  confirmExplorerItem,
  explorerCanConfirm,
  explorerListModel,
  explorerToolbarKinds,
  remotePageCount,
  resolveExplorerSelection,
  type PickerItem,
} from '../src/features/asset-picker/index.ts'
import { ASSET_PICKER_PAGE_SIZE } from '../src/features/asset-picker/types.ts'

function catalogItem(id: string, filename: string, kind: PickerItem['kind'] = 'image'): PickerItem {
  return {
    ref: { version: 1, scheme: 'catalog', id, workspaceId: 'film', filename },
    kind,
    filename,
    title: filename,
    createdAt: 1_700_000_000,
    sizeBytes: 12,
    url: `/api/v1/file/${filename}?workspace=film`,
    thumbnailUrl: `/api/v1/file/${filename}?workspace=film`,
  }
}

function outputFrom(item: PickerItem): ApiOutput {
  return {
    name: item.filename,
    type: 'image',
    mode: null,
    size: item.sizeBytes,
    created_at: item.createdAt ?? 0,
    url: item.url,
    thumbnail_url: item.thumbnailUrl,
    asset_id: item.ref.scheme === 'catalog' ? item.ref.id : undefined,
    workspace_id: item.ref.workspaceId,
    path: item.filename,
  }
}

test('remote pages are 24 wide and never collapse to zero', () => {
  assert.equal(ASSET_PICKER_PAGE_SIZE, 24)
  assert.equal(remotePageCount(0), 1)
  assert.equal(remotePageCount(24), 1)
  assert.equal(remotePageCount(25), 2)
  assert.equal(remotePageCount(120), 5)
})

test('remote toolbar uses constraint kinds; local toolbar only kinds present', () => {
  const items = [catalogItem('a', 'a.png'), catalogItem('b', 'b.mp4', 'video')]
  assert.deepEqual(
    explorerToolbarKinds(true, items, { kinds: ['image'], maxCount: 1, optional: false }),
    ['image'],
  )
  assert.deepEqual(explorerToolbarKinds(true, items), ['image', 'video', 'audio', 'model3d', 'scene'])
  assert.deepEqual(explorerToolbarKinds(false, items), ['image', 'video'])
})

test('remote list model pages by catalog total, not the in-memory outputs', () => {
  const local = Array.from({ length: 3 }, (_, index) => catalogItem(`local-${index}`, `local-${index}.png`))
  const remote = Array.from({ length: 24 }, (_, index) => catalogItem(`hit-${index}`, `hit-${index}.png`))
  const model = explorerListModel({
    remote: true,
    remoteItems: remote,
    remoteTotal: 120,
    remoteStatus: 'ready',
    localItems: local,
    query: '',
    kind: '',
    sort: 'created_desc',
    page: 4,
    fallbackStatus: 'ready',
  })
  assert.equal(model.pages, 5)
  assert.equal(model.safePage, 4)
  assert.equal(model.footerTotal, 120)
  assert.equal(model.visible.length, 24)
  assert.equal(model.pickerItems[0].ref.scheme === 'catalog' ? model.pickerItems[0].ref.id : '', 'hit-0')
})

test('resolveExplorerSelection keeps a remote catalog id that is not on the current page', () => {
  const page = [catalogItem('asset-0', 'hit-0.png')]
  const chosen = catalogItem('asset-110', 'wanted.png')
  const selected = resolveExplorerSelection({
    remote: true,
    pickerItems: page,
    scopedPicked: null,
    selectedOutput: outputFrom(chosen),
    workspaceId: 'film',
  })
  assert.equal(selected?.ref.scheme === 'catalog' ? selected.ref.id : '', 'asset-110')
})

test('filename-only reopen requires a unique match and never the first homonym', () => {
  const twins = [catalogItem('a', 'same.png'), catalogItem('b', 'same.png')]
  assert.equal(resolveExplorerSelection({
    remote: false,
    pickerItems: twins,
    scopedPicked: null,
    selectedName: 'same.png',
    workspaceId: 'film',
  }), null)
  const unique = [catalogItem('a', 'same.png'), catalogItem('b', 'other.png')]
  const selected = resolveExplorerSelection({
    remote: false,
    pickerItems: unique,
    scopedPicked: null,
    selectedName: 'same.png',
    workspaceId: 'film',
  })
  assert.equal(selected?.ref.scheme === 'catalog' ? selected.ref.id : '', 'a')
})

test('remote confirm maps picker identity onto ApiOutput without a local outputs list', () => {
  const item = catalogItem('asset-110', 'wanted.png')
  const chosen: ApiOutput[] = []
  confirmExplorerItem(true, [], [item], item, 'film', undefined, value => {
    if (value) chosen.push(value)
  }, () => undefined)
  assert.equal(chosen.length, 1)
  assert.equal(chosen[0].asset_id, 'asset-110')
  assert.equal(chosen[0].workspace_id, 'film')
  assert.equal(chosen[0].path, 'wanted.png')
})

test('local confirm stays disabled when the picked row left the catalog', () => {
  const item = catalogItem('gone', 'gone.png')
  assert.equal(explorerCanConfirm(false, [], item), false)
  assert.equal(explorerCanConfirm(true, [], item), true)
})
