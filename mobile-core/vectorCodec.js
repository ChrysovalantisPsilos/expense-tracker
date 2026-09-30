// How a recorded call's arguments and result travel as JSON, in one place
// for the recorder (record/), the Node replay (test/mobileCore.test.js) and
// the Swift package (which calls `BudgeerCore.vectors.call`).
//
// JSON can't say undefined, a Set or a Map, so those are tagged objects:
//   undefined → { "$": "u" }
//   Date      → { "$": "date", "v": "2026-09-30T10:00:00.000Z" }   (the instant)
//   Set       → { "$": "set", "v": [members] }
//   Map       → { "$": "map", "v": [[key, value], …] }
//   Error     → { "$": "error", "message": "…" }   (a call that threw)
// Anything else JSON can't carry exactly (an invalid Date, a function, a
// class instance, NaN, ±Infinity, a symbol, a BigInt, an object with a "$"
// key) is refused: NotEncodable. The recorder skips such calls; the core
// never returns one to Swift without saying so.

export class NotEncodable extends Error {}

const isPlainObject = (v) => {
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

export function encode(value) {
  if (value === undefined) return { $: 'u' }
  if (value === null) return null
  switch (typeof value) {
    case 'boolean': case 'string': return value
    case 'number':
      if (!Number.isFinite(value)) throw new NotEncodable(`number ${value}`)
      return value
    case 'function': case 'symbol': case 'bigint': throw new NotEncodable(typeof value)
  }
  if (Array.isArray(value)) return value.map(encode)
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new NotEncodable('invalid Date')
    return { $: 'date', v: value.toISOString() }
  }
  if (value instanceof Set) return { $: 'set', v: [...value].map(encode) }
  if (value instanceof Map) return { $: 'map', v: [...value].map(([k, v]) => [encode(k), encode(v)]) }
  if (!isPlainObject(value)) throw new NotEncodable(value?.constructor?.name ?? 'object')
  const out = {}
  for (const key of Object.keys(value)) {
    if (key === '$') throw new NotEncodable('key "$"')
    out[key] = encode(value[key])
  }
  return out
}

export function decode(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(decode)
  switch (value.$) {
    case 'u': return undefined
    case 'date': return new Date(value.v)
    case 'set': return new Set(value.v.map(decode))
    case 'map': return new Map(value.v.map(([k, v]) => [decode(k), decode(v)]))
  }
  const out = {}
  for (const key of Object.keys(value)) out[key] = decode(value[key])
  return out
}

// The error kinds a vector keeps: ones our code throws on purpose. An
// engine's own errors (a TypeError from reading a property of undefined, a
// RangeError from Intl) word themselves differently per engine.
const NATIVE = new Set(['TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError'])
export const isRecordableError = (err) =>
  err instanceof Error && !NATIVE.has(err.constructor?.name)

export const encodeError = (err) => ({ $: 'error', message: String(err?.message ?? err) })

// Run one call as the replays do: decoded arguments in, encoded result (or
// encoded error) out. `fn` is the function itself.
export function runEncoded(fn, encodedArgs) {
  try {
    return encode(fn(...encodedArgs.map(decode)))
  } catch (err) {
    if (err instanceof NotEncodable) throw err
    return encodeError(err)
  }
}
