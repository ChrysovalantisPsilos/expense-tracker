// Statements (PDF/Excel) are made on the device. For one release the old
// edge functions stay as a fallback: when making a file here throws (an old
// browser without what pdf-lib needs, say), the server makes it instead, and
// the console says so. An error written for the user (UserError) is an
// answer, not a failure, so it isn't retried on the server.
// TODO(release after next): remove this and the generate-report/group-report
// fallbacks (docs/TESTING.md, "Statements on the device").
import { UserError } from './errors.js'

export async function deviceFirst(what, onDevice, onServer, log = console) {
  try {
    return await onDevice()
  } catch (err) {
    if (err instanceof UserError) throw err
    log.warn(`[${what}] couldn't be made on this device; using the server fallback.`, err)
    return onServer()
  }
}
