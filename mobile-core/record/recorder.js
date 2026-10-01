// The wrapper the recorder's facades put around every exported function of a
// core module: it runs the real function and keeps { module, fn, args,
// result } when the call is worth replaying, that is when its arguments and
// result are JSON-encodable (vectorCodec.js), it read no clock or randomness
// (preload.mjs taints those), and a second call answers the same. A thrown
// error of our own is a result too ({ "$": "error" }). One vector per
// distinct (module, fn, language, args), capped per function.
import { isMainThread } from 'node:worker_threads'
import { NotEncodable, encode, encodeError, isRecordableError } from '../vectorCodec.js'

// The active language at each call, from the engine (preload.mjs hands it
// over once the hooks are in: importing the engine here would make a cycle
// through its own facade).
let getLanguage = () => 'en'
export function useLanguage(fn) { getLanguage = fn }

const PER_FUNCTION = 400
const MAX_BYTES = 48 * 1024

const vectors = new Map() // key → vector
const perFunction = new Map() // "module.fn" → count
const functions = new Map() // module → Set of function names
const frames = [] // one { tainted } per wrapped call in progress

export function taint() {
  for (const f of frames) f.tainted = true
}

const tryEncode = (v) => {
  try { return JSON.stringify(encode(v)) } catch (err) {
    if (err instanceof NotEncodable) return undefined
    throw err
  }
}

const outcome = (fn, args) => {
  let value
  try { value = fn(...args) } catch (err) {
    return { threw: true, err, json: isRecordableError(err) ? JSON.stringify(encodeError(err)) : undefined }
  }
  return { threw: false, value, json: tryEncode(value) }
}

// A class (errors.js' UserError) is constructed with `new`, never called
// through the bridge: it stays as it is.
const isClass = (fn) => /^class[\s{]/.test(Function.prototype.toString.call(fn))

export function wrap(module, name, value) {
  if (typeof value !== 'function' || isClass(value) || !isMainThread) return value
  if (!functions.has(module)) functions.set(module, new Set())
  functions.get(module).add(name)
  const key = `${module}.${name}`
  const wrapped = function (...args) {
    const frame = { tainted: false }
    frames.push(frame)
    const argsJson = tryEncode(args)
    const first = outcome(value, args)
    frames.pop()
    if (argsJson !== undefined && first.json !== undefined && !frame.tainted && argsJson.length + first.json.length <= MAX_BYTES) {
      record(module, name, key, argsJson, first, value, args)
    }
    if (first.threw) throw first.err
    return first.value
  }
  Object.defineProperty(wrapped, 'name', { value: name })
  Object.defineProperty(wrapped, 'length', { value: value.length })
  return wrapped
}

function record(module, name, key, argsJson, first, fn, args) {
  // A test that moves the process to another zone (dates.test.js) makes
  // calls that only answer the same there: the vectors are UTC's.
  if (process.env.TZ !== 'UTC') return
  const lang = getLanguage()
  const id = `${key}|${lang}|${argsJson}`
  if (vectors.has(id) || (perFunction.get(key) ?? 0) >= PER_FUNCTION) return
  // Deterministic: the same call answers the same twice, with no clock read.
  const again = { tainted: false }
  frames.push(again)
  const second = outcome(fn, args)
  frames.pop()
  if (again.tainted || second.json !== first.json) return
  perFunction.set(key, (perFunction.get(key) ?? 0) + 1)
  // The arguments stay JSON text: a replay hands them over as they are, so an
  // object's key order (which Object.keys() follows) is the recorded one.
  const v = { m: module, f: name, a: argsJson, r: JSON.parse(first.json) }
  if (lang !== 'en') v.l = lang
  vectors.set(id, v)
}

// This process's harvest: the function names seen per module, and the vectors.
export function dump() {
  return {
    functions: Object.fromEntries([...functions].map(([m, set]) => [m, [...set].sort()])),
    vectors: [...vectors.values()],
  }
}
