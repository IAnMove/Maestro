import assert from 'node:assert/strict'
import test from 'node:test'
import { isOwnedWorkspace, liveWriteViolation } from '../e2e/helpers/liveWorkspacePolicy.ts'

test('acceptance cannot activate global state, delete evidence or write another workspace', () => {
  for (const [method, path, body] of [
    ['PUT', '/api/v1/workspaces/active', { name: 'default' }],
    ['PUT', '/api/v1/wizard/conversations', { workspace: 'default', conversation: { messages: [] } }],
    ['PUT', '/api/v1/settings', { enabled_models: [] }],
    ['DELETE', '/api/v1/models/a-model', {}],
    ['DELETE', '/api/v1/workspaces/e2e_owned', {}],
    ['POST', '/api/v1/workspaces', { name: 'normal_project' }],
    ['POST', '/api/v1/jobs/recovery/resume', {}],
    ['DELETE', '/api/v1/jobs/recovery/discard', {}],
    ['POST', '/api/v1/system/release-model', {}],
    ['POST', '/api/v1/comics/history', { project: { id: 'audit-comic' }, workspace: 'e2e_owned' }],
    ['POST', '/api/v1/comics', { workspace: 'e2e_owned' }],
    ['PUT', '/api/v1/comics/existing.comic.json', { workspace: 'e2e_owned' }],
  ]) assert.ok(liveWriteViolation(method, path, body, 'e2e_owned'), path)
})

test('live generation and conversation writes retain their real path within the owned folder', () => {
  assert.equal(liveWriteViolation('POST', '/api/v1/generate', { workspace: 'e2e_owned', prompt: 'literal' }, 'e2e_owned'), null)
  assert.equal(liveWriteViolation('PUT', '/api/v1/wizard/conversations', { workspace: 'e2e_owned_more', conversation: { messages: ['literal'] } }, 'e2e_owned'), null)
  assert.equal(liveWriteViolation('GET', '/api/v1/models', null, 'e2e_owned'), null)
  assert.equal(isOwnedWorkspace('e2e_owned_unrelated', 'e2e_owned'), true)
  assert.equal(isOwnedWorkspace('e2e_owned2', 'e2e_owned'), false)
})
