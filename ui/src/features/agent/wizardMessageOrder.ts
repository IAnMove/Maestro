/** Retain turn neighbours during a rebase; arrival time and client clocks are not order. */
export function insertMissingConversationValues<T>(canonical: T[], local: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>()
  const merged = canonical.filter(value => {
    const id = key(value)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
  let previous: string | undefined
  for (let index = 0; index < local.length; index += 1) {
    const value = local[index]
    const id = key(value)
    if (!id) continue
    if (!seen.has(id)) {
      const before = previous === undefined ? -1 : merged.findIndex(item => key(item) === previous)
      const next = before < 0 ? local.slice(index + 1).find(item => seen.has(key(item))) : undefined
      const after = next === undefined ? -1 : merged.findIndex(item => key(item) === key(next))
      merged.splice(before >= 0 ? before + 1 : after >= 0 ? after : merged.length, 0, value)
      seen.add(id)
    }
    previous = id
  }
  return merged
}

/**
 * Cap a rebased timeline without dropping exclusive local turns.
 * Neighbor insert can place those turns beside the oldest shared ids, where a
 * trailing window would silently delete them before the first persist.
 * Fill remaining slots from the newest non-exclusive turns so an early
 * exclusive cluster cannot hide the latest remote history across reloads.
 */
export function capConversationValues<T>(
  merged: T[],
  key: (value: T) => string,
  isExclusive: (value: T) => boolean,
  limit: number,
): T[] {
  if (merged.length <= limit) return merged
  const exclusiveIndexes: number[] = []
  merged.forEach((value, index) => {
    if (key(value) && isExclusive(value)) exclusiveIndexes.push(index)
  })
  if (!exclusiveIndexes.length) return merged.slice(-limit)
  const keptExclusiveIndexes = exclusiveIndexes.length <= limit
    ? exclusiveIndexes
    : exclusiveIndexes.slice(-limit)
  const exclusiveIds = new Set(keptExclusiveIndexes.map(index => key(merged[index])))
  const others = merged.filter(value => {
    const id = key(value)
    return Boolean(id) && !exclusiveIds.has(id)
  })
  const keepIds = new Set([
    ...exclusiveIds,
    ...others.slice(-(limit - exclusiveIds.size)).map(value => key(value)),
  ])
  return merged.filter(value => keepIds.has(key(value)))
}
