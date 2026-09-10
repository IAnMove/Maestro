import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const matrix = JSON.parse(
  readFileSync(new URL('../../tests/fixtures/labs_wizard_action_matrix.json', import.meta.url), 'utf8'),
)

test('every Wizard-promised action has an identified matrix function', async () => {
  const { AGENT_ACTION_TYPES } = await import('../src/features/agent/agentActionTypes.ts')
  const { listCapabilities } = await import('../src/features/agent/capabilityRegistry.ts')
  const promised = new Set(
    matrix.operations
      .map(row => row.wizard_capability)
      .filter(Boolean),
  )
  const missing = AGENT_ACTION_TYPES.filter(type => !promised.has(type))
  assert.deepEqual(missing, [], 'AGENT_ACTION_TYPES without a matrix function')
  const registered = listCapabilities().map(capability => capability.name)
  const unregistered = registered.filter(name => !promised.has(name))
  assert.deepEqual(unregistered, [], 'registered capability without a matrix function')
  for (const row of matrix.operations) {
    if (!row.wizard_capability) continue
    assert.ok(row.domain_function, `${row.id} promises ${row.wizard_capability} without a function`)
  }
})

test('stageSeriesComic is the Series comic domain operation exposed as a Wizard capability', async () => {
  const { AGENT_ACTION_TYPES } = await import('../src/features/agent/agentActionTypes.ts')
  const { listCapabilities } = await import('../src/features/agent/capabilityRegistry.ts')
  const actions = readFileSync(new URL('../src/features/series/actions.ts', import.meta.url), 'utf8')
  assert.match(actions, /export async function stageSeriesComic/)
  assert.equal(AGENT_ACTION_TYPES.includes('stage_series_comic'), true)
  assert.ok(listCapabilities().some(item => item.name === 'stage_series_comic'))
  const row = matrix.operations.find(item => item.id === 'series.comic.stage')
  assert.equal(row.classification, 'operativa')
  assert.equal(row.phase, 'L6')
  assert.equal(row.wizard_capability, 'stage_series_comic')
})

test('Wizard context derives availability with reasons instead of a manual empty blocked list', () => {
  const source = readFileSync(new URL('../src/features/agent/wizardContext.ts', import.meta.url), 'utf8')
  assert.match(source, /projectWizardContextCapabilities/)
  assert.equal(source.includes('blocked: []'), false)
  assert.equal(matrix.wizard_context.availability.model, 'derived')
  assert.ok(matrix.wizard_context.series_lab.includes('stage_series_comic'))
})

test('H3 finalization fixture remains the Labs prompt freeze', () => {
  const h3 = JSON.parse(
    readFileSync(new URL('../../tests/fixtures/h3_prompt_fase1_expected.json', import.meta.url), 'utf8'),
  )
  assert.equal(matrix.h3_prompt_fixtures.before_ui, 'tests/fixtures/h3_prompt_fase1_expected.json')
  assert.equal(matrix.h3_prompt_fixtures.before_queue, 'tests/fixtures/h3_prompt_fase1_expected.json')
  assert.ok(Array.isArray(h3.speech_matrix) && h3.speech_matrix.length > 0)
  assert.ok(h3.contracts.writing_faithful)
  assert.ok(h3.contracts.writing_creative)
})
