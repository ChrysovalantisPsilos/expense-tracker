// The last answer of each cached live query (useLiveQuery's `cacheKey`), kept
// in memory for this page load only. A page that mounts again — Home after
// the add-expense page, which replaces it — shows what it showed last at
// once and refreshes it in place, instead of blanking every card to a
// skeleton and filling them back in one by one. Bounded: past `max` keys, the
// least recently used goes. Pure (no I/O); AuthProvider empties it on any
// sign-out.

export function createQueryCache(max = 50) {
  const entries = new Map()
  return {
    // { data } for a key answered before, else undefined (so a cached
    // null/undefined answer still counts as a hit).
    get(key) {
      if (!entries.has(key)) return undefined
      const hit = entries.get(key)
      entries.delete(key)
      entries.set(key, hit) // most recently used goes last
      return hit
    },
    set(key, data) {
      entries.delete(key)
      entries.set(key, { data })
      while (entries.size > max) entries.delete(entries.keys().next().value)
    },
    clear() { entries.clear() },
    get size() { return entries.size },
  }
}

// One query's key: its name plus every input its answer depends on (the
// user's id first, so one account's answers never serve another's).
export const queryCacheKey = (name, inputs) => `${name}:${JSON.stringify(inputs)}`

// The app's one cache (db.js reads and fills it).
export const liveQueryCache = createQueryCache()
