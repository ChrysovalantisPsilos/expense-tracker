// Preloaded (--import) into every test process while the vectors are
// recorded (vectors.mjs). It registers the loader hooks that wrap the core
// modules' exports, taints any call that reads the clock or randomness, and
// writes this process's vectors when it exits.
import { register } from 'node:module'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

// The hooks go in before anything from src/ loads: a static import of the
// recorder would be hoisted above register() and pull the language engine
// in unwrapped.
register('./hooks.mjs', import.meta.url)
const { dump, taint, useLanguage } = await import('./recorder.js')
// The real engine (not its facade: a wrapped getLanguage would record itself).
useLanguage((await import('../../src/shared/lib/i18n/i18n.js?real')).getLanguage)

// A call whose result depends on "now" or on randomness can't be replayed:
// the guards below mark every call on the stack when the clock or a random
// source is read. Date built with arguments (a fixed date) stays clean.
const RealDate = Date
class RecordedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) taint()
    super(...args)
  }
  static now() {
    taint()
    return RealDate.now()
  }
}
globalThis.Date = RecordedDate
const realRandom = Math.random
Math.random = () => { taint(); return realRandom() }
for (const name of ['getRandomValues', 'randomUUID']) {
  const real = globalThis.crypto?.[name]
  if (typeof real !== 'function') continue
  try {
    Object.defineProperty(globalThis.crypto, name, {
      value: (...args) => { taint(); return real.apply(globalThis.crypto, args) }, configurable: true,
    })
  } catch { /* a frozen crypto: its calls go unrecorded anyway (a Promise result) */ }
}

// Nor can a call that reaches a host API JavaScriptCore doesn't give (the
// core's replays run with the language's own globals only): base64 and
// text decoding, URL search params.
for (const name of ['atob', 'btoa']) {
  const real = globalThis[name]
  if (typeof real === 'function') globalThis[name] = (...args) => { taint(); return real(...args) }
}
for (const name of ['TextDecoder', 'TextEncoder', 'URLSearchParams']) {
  const Real = globalThis[name]
  if (typeof Real !== 'function') continue
  globalThis[name] = class extends Real {
    constructor(...args) {
      taint()
      super(...args)
    }
  }
}

const dir = process.env.BUDGEER_VECTORS_DIR
if (dir) {
  process.on('exit', () => {
    writeFileSync(join(dir, `${process.pid}.json`), JSON.stringify(dump()))
  })
}
