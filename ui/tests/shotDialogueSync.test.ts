import assert from 'node:assert/strict'
import test from 'node:test'

import { planShotDialogueFromScript, syncShotsFromScript } from '../src/features/series/shotDialogueSync.ts'

test('editing script dialogue marks the speaking shot stale and syncs the literal line', () => {
  const script = [{
    id: 'scene-1',
    dialogue: [{ id: 'd1', characterId: 'ada', text: 'He descubierto ChatGPT' }],
  }]
  const shots = [{
    id: 'shot-1', sceneId: 'scene-1', order: 1, camera: 'locked',
    dialogueBeats: [{ id: 's1', characterId: 'ada', text: 'Hola' }],
    attempts: [{ id: 'attempt-1' }],
  }]
  const plan = planShotDialogueFromScript(script, shots)
  assert.equal(plan[0].status, 'stale')
  const synced = syncShotsFromScript(script, shots)
  assert.equal(synced.shots[0].dialogueBeats?.[0].text, 'He descubierto ChatGPT')
  assert.equal(synced.shots[0].camera, 'locked')
  assert.deepEqual(synced.shots[0].attempts, [{ id: 'attempt-1' }])
})

test('manual shot dialogue is a conflict unless explicitly included', () => {
  const script = [{
    id: 'scene-1',
    dialogue: [{ id: 'd1', characterId: 'ada', text: 'He descubierto ChatGPT' }],
  }]
  const shots = [{
    id: 'shot-1', sceneId: 'scene-1', order: 1, dialogueOrigin: 'manual' as const,
    dialogueBeats: [{ id: 's1', characterId: 'ada', text: 'Linea manual' }],
  }]
  const skipped = syncShotsFromScript(script, shots)
  assert.equal(skipped.conflicts, 1)
  assert.equal(skipped.shots[0].dialogueBeats?.[0].text, 'Linea manual')
})
