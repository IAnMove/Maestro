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
