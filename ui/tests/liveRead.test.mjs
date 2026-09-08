import assert from 'node:assert/strict'
import test from 'node:test'
import { liveJson } from '../e2e/helpers/liveRead.ts'

test('live observations recover a dropped socket without changing the requested resource', async () => {
  const calls = []
  const request = { get: async path => {
    calls.push(path)
    if (calls.length === 1) throw Error('read ECONNRESET')
    return { ok: () => true, json: async () => ({ status: 'completed', id: 'existing-job' }) }
  } }
  assert.deepEqual(await liveJson(request, '/tasks/existing-job'), { status: 'completed', id: 'existing-job' })
  assert.deepEqual(calls, ['/tasks/existing-job', '/tasks/existing-job'])
})

test('HTTP errors are reported once even if their body mentions a transport error', async () => {
  let calls = 0
  await assert.rejects(liveJson({ get: async () => {
    calls += 1
    return { ok: () => false, status: () => 409, text: async () => 'ECONNRESET in worker' }
  } }, '/tasks/one'), /HTTP 409/)
  assert.equal(calls, 1)
})

test('persistent transport failure is bounded and is never accepted as success', async () => {
  let calls = 0
  await assert.rejects(liveJson({ get: async () => { calls += 1; throw Error('ECONNREFUSED') } }, '/tasks/one'), /ECONNREFUSED/)
  assert.equal(calls, 4)
})
