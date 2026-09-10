/** Detect and sync shot dialogue from episode script without touching takes. */

export interface DialogueLine {
  id?: string
  characterId?: string
  text?: string
  emotion?: string
  delivery?: string
}

export interface DialogueShot {
  id: string
  sceneId?: string
  order: number
  dialogueBeats?: DialogueLine[]
  sourceDialogueIds?: string[]
  dialogueOrigin?: 'script' | 'manual'
  scriptDialogueStatus?: 'in_sync' | 'stale' | 'manual_conflict'
  camera?: string
  framing?: string
  action?: string
}

export interface DialogueScene {
  id: string
  dialogue?: DialogueLine[]
}

export type ShotDialogueStatus = 'in_sync' | 'stale' | 'manual_conflict'

export interface ShotDialoguePlan {
  shotId: string
  status: ShotDialogueStatus
  expected: DialogueLine[]
}

function lineKey(line: DialogueLine): string {
  return `${String(line.characterId || '')}\u0000${String(line.text || '')}`
}

function cloneLine(line: DialogueLine): DialogueLine {
  return {
    id: line.id,
    characterId: line.characterId || '',
    text: line.text || '',
    emotion: line.emotion || '',
    delivery: line.delivery || '',
  }
}

export function planShotDialogueFromScript(
  script: DialogueScene[],
  shots: DialogueShot[],
): ShotDialoguePlan[] {
  const scenes = new Map(script.map(scene => [scene.id, scene]))
  const byScene = new Map<string, DialogueShot[]>()
  for (const shot of shots) {
    const sceneId = String(shot.sceneId || '')
    const group = byScene.get(sceneId) || []
    group.push(shot)
    byScene.set(sceneId, group)
  }
  const plans: ShotDialoguePlan[] = []
  for (const [sceneId, sceneShots] of byScene) {
    const ordered = [...sceneShots].sort((left, right) => left.order - right.order)
    const scene = scenes.get(sceneId)
    const lines = scene ? [...(scene.dialogue || [])] : null
    const speaking = ordered.filter(shot => (shot.dialogueBeats || []).length > 0)
    const silent = ordered.filter(shot => !(shot.dialogueBeats || []).length)
    if (!scene || lines === null) {
      for (const shot of ordered) {
        const actual = shot.dialogueBeats || []
        plans.push({
          shotId: shot.id,
          status: actual.length ? 'stale' : 'in_sync',
          expected: [],
        })
      }
      continue
    }
    if (!speaking.length) {
      ordered.forEach((shot, index) => {
        plans.push({
          shotId: shot.id,
          status: lines.length && index === 0 ? 'stale' : 'in_sync',
          expected: lines.length && index === 0 ? lines.map(cloneLine) : [],
        })
      })
      continue
    }
    let remaining = lines.map(cloneLine)
    speaking.forEach((shot, index) => {
      const last = index === speaking.length - 1
      const take = last ? remaining.length : Math.min(remaining.length, Math.max(1, (shot.dialogueBeats || []).length))
      const expected = remaining.slice(0, take)
      remaining = remaining.slice(take)
      const actual = shot.dialogueBeats || []
      const same = expected.map(lineKey).join('\n') === actual.map(lineKey).join('\n')
      const status: ShotDialogueStatus = same
        ? 'in_sync'
        : shot.dialogueOrigin === 'manual' ? 'manual_conflict' : 'stale'
      plans.push({ shotId: shot.id, status, expected })
    })
    for (const shot of silent) {
      plans.push({ shotId: shot.id, status: 'in_sync', expected: [] })
    }
  }
  return plans
}

export function annotateShotsWithScriptDialogue<T extends DialogueShot>(
  script: DialogueScene[],
  shots: T[],
): T[] {
  const plans = new Map(planShotDialogueFromScript(script, shots).map(item => [item.shotId, item]))
  return shots.map(shot => {
    const plan = plans.get(shot.id)
    return plan ? { ...shot, scriptDialogueStatus: plan.status } : shot
  })
}

export function syncShotsFromScript<T extends DialogueShot>(
  script: DialogueScene[],
  shots: T[],
  options: { includeConflicts?: boolean } = {},
): { shots: T[]; synced: number; conflicts: number } {
  const plans = new Map(planShotDialogueFromScript(script, shots).map(item => [item.shotId, item]))
  let synced = 0
  let conflicts = 0
  const next = shots.map(shot => {
    const plan = plans.get(shot.id)
    if (!plan) return shot
    if (plan.status === 'in_sync') return { ...shot, scriptDialogueStatus: 'in_sync' as const }
    if (plan.status === 'manual_conflict' && !options.includeConflicts) {
      conflicts += 1
      return { ...shot, scriptDialogueStatus: 'manual_conflict' as const }
    }
    synced += 1
    return {
      ...shot,
      dialogueBeats: plan.expected.map(cloneLine),
      sourceDialogueIds: plan.expected.map(line => String(line.id || '')).filter(Boolean),
      dialogueOrigin: 'script' as const,
      scriptDialogueStatus: 'in_sync' as const,
    }
  })
  return { shots: next, synced, conflicts }
}
