// The 10-minute cron: probe, derive, apply overrides / incidents /
// maintenance, record the run and prune old rows.
import { probeAll } from './checks.js'
import { deriveStates, effectiveStates } from './state.js'
import { loadContext, recordRun } from './store.js'

export async function runChecks(env, now = new Date(), fetchImpl = fetch) {
  const nowIso = now.toISOString()
  const [probes, context] = await Promise.all([probeAll(env, fetchImpl), loadContext(env.DB, nowIso)])
  const auto = deriveStates(probes, now)
  const autoStates = Object.fromEntries(Object.entries(auto).map(([id, v]) => [id, v.state]))
  await recordRun(env.DB, nowIso, auto, effectiveStates(autoStates, context))
  return auto
}
