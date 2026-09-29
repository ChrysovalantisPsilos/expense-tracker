// The last answer of each cached live query (useLiveQuery's `cacheKey`), kept
// in memory for this page load only. A page that mounts again — Home after
// the add-expense page, which replaces it — shows what it showed last at
// once and refreshes it in place, instead of blanking every card to a
// skeleton and filling them back in one by one. Bounded: past `max` keys, the
// least recently used goes. Pure (no I/O); AuthProvider empties it on any
// sign-out. subscribe(key, fn) hears every new answer stored under `key`, so
// a save that stores its result (vouchers.js) updates every mounted query of
// that key at once — for data realtime can't announce (encrypted documents).

export function createQueryCache(max = 50) {
  const entries = new Map()
  const pending = new Map() // key -> a prefetch in flight
  const listeners = new Map() // key -> Set of fn(data)
  let generation = 0 // bumped by clear(): a prefetch started before it never lands
  return {
    // Warm `key` with one call of `read` (async), unless it's answered or
    // already being warmed; resolves when done. The answer lands only if
    // nothing filled the key meanwhile (a live query's own, fresher answer
    // wins) and the cache wasn't cleared (a sign-out). A failed read leaves
    // the key empty: the page's own query reads it as usual.
    prefetch(key, read) {
      if (entries.has(key)) return Promise.resolve()
      if (pending.has(key)) return pending.get(key)
      const started = generation
      const done = Promise.resolve().then(read).then((data) => {
        if (started === generation && !entries.has(key)) this.set(key, data)
      }, () => {}).finally(() => { if (pending.get(key) === done) pending.delete(key) })
      pending.set(key, done)
      return done
    },
    // { data } for a key answered before, else undefined (so a cached
    // null/undefined answer still counts as a hit).
    get(key) {
      if (!entries.has(key)) return undefined
      const hit = entries.get(key)
      entries.delete(key)
      entries.set(key, hit) // most recently used goes last
      return hit
    },
    // Store `data` under `key`; tells the key's listeners unless `quiet`.
    set(key, data, { quiet = false } = {}) {
      entries.delete(key)
      entries.set(key, { data })
      while (entries.size > max) entries.delete(entries.keys().next().value)
      if (!quiet) for (const fn of [...(listeners.get(key) ?? [])]) fn(data)
    },
    // Call fn(data) whenever an answer is stored under `key`; returns the
    // unsubscribe.
    subscribe(key, fn) {
      if (!listeners.has(key)) listeners.set(key, new Set())
      listeners.get(key).add(fn)
      return () => {
        const set = listeners.get(key)
        set?.delete(fn)
        if (set && !set.size) listeners.delete(key)
      }
    },
    clear() {
      entries.clear()
      pending.clear()
      generation++
    },
    get size() { return entries.size },
  }
}

// One query's key: its name plus every input its answer depends on (the
// user's id first, so one account's answers never serve another's).
export const queryCacheKey = (name, inputs) => `${name}:${JSON.stringify(inputs)}`

// The app's one cache (db.js reads and fills it).
export const liveQueryCache = createQueryCache()
