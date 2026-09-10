/** Shared Series take-selection policy for UI and Wizard. */

export interface ReviewableShot {
  id: string
  order?: number
  approvedAttemptId?: string
  attempts: Array<{
    id: string
    status?: string
    reviewDecision?: string
    outputAssetIds?: string[]
  }>
}

export interface BulkApproveOptions {
  replaceFinals?: boolean
}

export interface BulkApproveResult {
  selections: Array<{ shotId: string; attemptId: string }>
  selected: number
  kept: number
  omitted: number
  replaced: number
}

export function hasReproducibleAsset(
  attempt: { outputAssetIds?: string[] } | undefined,
  hasAsset: (assetId: string) => boolean,
): boolean {
  return Boolean(attempt?.outputAssetIds?.some(id => hasAsset(id)))
}

export function latestApprovableAttempt<T extends ReviewableShot['attempts'][number]>(
  shot: { attempts: T[] },
  hasAsset: (assetId: string) => boolean,
): T | undefined {
  return [...shot.attempts].reverse().find(item => (
    item.status === 'completed'
    && item.reviewDecision !== 'rejected'
    && hasReproducibleAsset(item, hasAsset)
  ))
}

export function missingAssemblyShotOrders(
  shots: Array<{
    order: number
    approvedAttemptId?: string
    attempts: Array<{ id: string; status?: string; outputAssetIds?: string[] }>
  }>,
  hasAsset: (assetId: string) => boolean,
): number[] {
  return shots.flatMap(shot => {
    const approved = shot.attempts.find(attempt => attempt.id === shot.approvedAttemptId)
    const playable = approved?.status === 'completed' && hasReproducibleAsset(approved, hasAsset)
    return playable ? [] : [shot.order]
  })
}

function shotLabel(shot: ReviewableShot): string | number {
  return typeof shot.order === 'number' ? shot.order : shot.id
}

/** A concrete attemptId is never a shot number. It names one historical take on exactly one shot. */
export function requireSingleShotForAttempt<T extends ReviewableShot>(shots: T[], attemptId: string): T {
  if (!attemptId) throw new Error('Se requiere un attemptId concreto.')
  if (shots.length !== 1) {
    throw new Error('Un attemptId concreto exige exactamente un shot; no uses all_latest ni varios shot_numbers.')
  }
  return shots[0]
}

export function explicitAttemptSelection(
  shots: ReviewableShot[],
  attemptId: string,
  hasAsset: (assetId: string) => boolean,
): Array<{ shotId: string; attemptId: string }> {
  const shot = requireSingleShotForAttempt(shots, attemptId)
  const attempt = shot.attempts.find(item => item.id === attemptId)
  const label = shotLabel(shot)
  if (!attempt) throw new Error(`El intento ${attemptId} no pertenece al shot ${label}.`)
  if (attempt.status !== 'completed' || attempt.reviewDecision === 'rejected') {
    throw new Error(`El intento ${attempt.id} del shot ${label} no es aprobable.`)
  }
  if (!hasReproducibleAsset(attempt, hasAsset)) {
    throw new Error(`El intento ${attempt.id} del shot ${label} no tiene un asset reproducible.`)
  }
  return attempt.id === shot.approvedAttemptId ? [] : [{ shotId: shot.id, attemptId: attempt.id }]
}

export function bulkApproveSelections(
  shots: ReviewableShot[],
  hasAsset: (assetId: string) => boolean,
  options: BulkApproveOptions = {},
): BulkApproveResult {
  const replaceFinals = options.replaceFinals === true
  const selections: Array<{ shotId: string; attemptId: string }> = []
  let kept = 0
  let omitted = 0
  let replaced = 0
  for (const shot of shots) {
    const latest = latestApprovableAttempt(shot, hasAsset)
    if (!latest) {
      omitted += 1
      continue
    }
    const approvedId = shot.approvedAttemptId
    const approvedStillValid = Boolean(
      approvedId
      && hasReproducibleAsset(shot.attempts.find(item => item.id === approvedId), hasAsset),
    )
    if (approvedStillValid && !replaceFinals) {
      kept += 1
      continue
    }
    if (latest.id === approvedId) {
      kept += 1
      continue
    }
    selections.push({ shotId: shot.id, attemptId: latest.id })
    if (approvedStillValid) replaced += 1
  }
  return {
    selections,
    selected: selections.length,
    kept,
    omitted,
    replaced,
  }
}
