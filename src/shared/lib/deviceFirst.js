// Statements (PDF/Excel) are made on the device. For one release the old
// edge functions stay as a fallback: when making a file here throws (an old
// browser without what pdf-lib needs, say), or takes longer than
// `timeoutMs` (a very long statement on a slow phone), the server makes it
// instead, and the console says so. On a timeout `onDevice`'s AbortSignal
// fires, so it can stop its work (a worker). An error written for the user
// (UserError) is an answer, not a failure, so it isn't retried on the server.
// TODO(release after next): remove this and the generate-report/group-report
// fallbacks (docs/TESTING.md, "Statements on the device").
import { UserError } from './errors.js'

// How long the device gets by default. A 5,000-transaction PDF takes ~5 s on
// a laptop and under 20 s on a mid-range phone; this is only for a device far
// slower than that (the page never freezes meanwhile: statements are made in
// a worker).
const DEVICE_TIME_LIMIT_MS = 45_000

export async function deviceFirst(what, onDevice, onServer, log = console, { timeoutMs = DEVICE_TIME_LIMIT_MS } = {}) {
  const stop = new AbortController()
  let timer
  const tooSlow = new Promise((resolve, reject) => {
    if (!timeoutMs) return
    timer = setTimeout(() => {
      const err = Object.assign(new Error(`${what} took over ${timeoutMs / 1000} s on this device`), { name: 'TimeoutError' })
      stop.abort(err)
      reject(err)
    }, timeoutMs)
  })
  try {
    return await Promise.race([onDevice(stop.signal), tooSlow])
  } catch (err) {
    if (err instanceof UserError) throw err
    log.warn(`[${what}] couldn't be made on this device; using the server fallback.`, err)
    return onServer()
  } finally {
    clearTimeout(timer)
  }
}
