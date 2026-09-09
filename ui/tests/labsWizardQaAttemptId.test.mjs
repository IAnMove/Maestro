import assert from 'node:assert/strict'
import test from 'node:test'

test('Wizard shot_numbers: [2] without attempt_id is shot 2, not take 2', async () => {
  const { parseRegisteredCapability } = await import('../src/features/agent/capabilityRegistry.ts')
  const { bulkApproveSelections } = await import('../src/features/series/shotReviewPolicy.ts')
  const selected = parseRegisteredCapability('review_series_attempts', {
    type: 'review_series_attempts',
    review_decision: 'approve',
    review_scope: 'selected_latest',
    shot_numbers: [2],
    confirm: true,
  })
  assert.equal(selected?.type, 'review_series_attempts')
  assert.equal(selected.scope, 'selected_latest')
  assert.deepEqual(selected.shotNumbers, [2])
  assert.equal(selected.attemptId, '')

  const shots = [{
    id: 'shot-2',
    order: 2,
    attempts: [
      { id: 'take-1', status: 'completed', outputAssetIds: ['older'] },
      { id: 'take-2', status: 'completed', outputAssetIds: ['newer'] },
    ],
  }]
  const latest = bulkApproveSelections(shots, () => true, { replaceFinals: true })
  assert.deepEqual(latest.selections, [{ shotId: 'shot-2', attemptId: 'take-2' }])
})

test('Wizard attempt_id on one shot selects that historical take', async () => {
  const { parseRegisteredCapability } = await import('../src/features/agent/capabilityRegistry.ts')
  const { explicitAttemptSelection } = await import('../src/features/series/shotReviewPolicy.ts')
  const selected = parseRegisteredCapability('review_series_attempts', {
    type: 'review_series_attempts',
    series_title: 'Mesa para cuatro',
    target_episode_title: 'Piloto',
    review_decision: 'approve',
    review_scope: 'selected_latest',
    shot_numbers: [2],
    attempt_id: 'take-1',
    confirm: true,
  })
  assert.equal(selected?.type, 'review_series_attempts')
  assert.deepEqual(selected.shotNumbers, [2])
  assert.equal(selected.attemptId, 'take-1')

  const shots = [{
    id: 'shot-2',
    order: 2,
    attempts: [
      { id: 'take-1', status: 'completed', outputAssetIds: ['older'] },
      { id: 'take-2', status: 'completed', outputAssetIds: ['newer'] },
    ],
  }]
  assert.deepEqual(
    explicitAttemptSelection(shots, selected.attemptId, () => true),
    [{ shotId: 'shot-2', attemptId: 'take-1' }],
  )
})

test('attempt_id is dropped unless selected_latest names exactly one shot', async () => {
  const { parseRegisteredCapability } = await import('../src/features/agent/capabilityRegistry.ts')
  const { parseAgentTurn } = await import('../src/features/agent/agentActions.ts')
  assert.equal(parseRegisteredCapability('review_series_attempts', {
    type: 'review_series_attempts',
    review_decision: 'approve',
    review_scope: 'all_latest',
    attempt_id: 'take-1',
    confirm: true,
  }), null)
  assert.equal(parseRegisteredCapability('review_series_attempts', {
    type: 'review_series_attempts',
    review_decision: 'approve',
    review_scope: 'selected_latest',
    shot_numbers: [1, 2],
    attempt_id: 'take-1',
    confirm: true,
  }), null)
  const turn = parseAgentTurn(JSON.stringify({
    reply: 'Apruebo la toma concreta.',
    actions: [{
      type: 'review_series_attempts',
      review_decision: 'approve',
      review_scope: 'replace_latest',
      attempt_id: 'take-1',
      confirm: true,
    }, {
      type: 'review_series_attempts',
      review_decision: 'reject',
      review_scope: 'selected_latest',
      shot_numbers: [2],
      attempt_id: 'attempt-7',
      confirm: true,
    }],
  }))
  assert.deepEqual(turn.actions, [{
    type: 'review_series_attempts',
    seriesTitle: '',
    targetEpisodeTitle: '',
    decision: 'reject',
    scope: 'selected_latest',
    shotNumbers: [2],
    attemptId: 'attempt-7',
    confirm: true,
  }])
})
