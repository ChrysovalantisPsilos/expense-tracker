import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  attemptOutcome, createConfirmWait, FAST_MS, FAST_PHASE_MS, GIVE_UP_MS, MIN_GAP_MS, nextDelay, SLOW_MS, shouldGiveUp,
} from '../src/features/auth/confirmWait.js'

const NOT_CONFIRMED = { error: { code: 'email_not_confirmed', message: 'Email not confirmed' } }

// A fake clock with timers: advance(ms) fires due timers in order and lets
// the awaited sign-in settle after each one.
function fakeClock() {
  let t = 0
  let seq = 0
  const timers = new Map()
  const flush = () => new Promise((r) => setImmediate(r))
  return {
    now: () => t,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: t + ms }); return id },
    clearTimer: (id) => { timers.delete(id) },
    pending: () => timers.size,
    flush,
    async advance(ms) {
      const end = t + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        const [id, { fn, at }] = due
        timers.delete(id)
        t = at
        fn()
        await flush()
      }
      t = end
      await flush()
    },
  }
}

// A waiter over the fake clock; `results` is what each sign-in returns in
// turn (the last one repeats).
function setup({ results = [NOT_CONFIRMED], visible = true, manual = false } = {}) {
  const clock = fakeClock()
  const log = { tries: [], statuses: [], forgot: 0, inFlight: 0, maxInFlight: 0 }
  const pendingResolves = []
  let i = 0
  const state = { visible }
  const waiter = createConfirmWait({
    attempt: () => {
      log.tries.push(clock.now())
      log.inFlight += 1
      log.maxInFlight = Math.max(log.maxInFlight, log.inFlight)
      const r = results[Math.min(i++, results.length - 1)]
      const done = () => { log.inFlight -= 1; return r }
      if (manual) return new Promise((res) => pendingResolves.push(() => res(done())))
      return Promise.resolve().then(done)
    },
    forget: () => { log.forgot += 1 },
    onChange: (s) => log.statuses.push(s),
    isVisible: () => state.visible,
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  })
  return { clock, log, waiter, state, pendingResolves }
}

test('nextDelay: 6 s during the first minute, then 15 s, inside the 30-per-5-minutes sign-in limit', () => {
  assert.equal(nextDelay(0), FAST_MS)
  assert.equal(nextDelay(FAST_PHASE_MS - 1), FAST_MS)
  assert.equal(nextDelay(FAST_PHASE_MS), SLOW_MS)
  assert.equal(nextDelay(GIVE_UP_MS), SLOW_MS)
  // The schedule stays inside the default 30-per-5-minutes sign-in limit.
  let t = 0
  let n = 0
  while (t < 5 * 60_000) { t += nextDelay(t); n += 1 }
  assert.ok(n <= 26, `${n} tries in the first five minutes`)
})

test('attemptOutcome: only "email not confirmed" means keep waiting', () => {
  assert.equal(attemptOutcome({ data: { session: {} }, error: null }), 'done')
  assert.equal(attemptOutcome(NOT_CONFIRMED), 'wait')
  assert.equal(attemptOutcome({ error: { code: 'over_request_rate_limit' } }), 'stop')
  assert.equal(attemptOutcome({ error: { code: 'invalid_credentials' } }), 'stop')
  assert.equal(attemptOutcome({ error: new TypeError('Failed to fetch') }), 'stop')
})

test('waits, retries every 6 s, and stops on success, forgetting the password', async () => {
  const { clock, log, waiter } = setup({ results: [NOT_CONFIRMED, NOT_CONFIRMED, { error: null }] })
  waiter.start()
  assert.deepEqual(log.statuses, ['waiting'])
  await clock.advance(FAST_MS * 3)
  assert.deepEqual(log.tries, [FAST_MS, FAST_MS * 2, FAST_MS * 3])
  assert.equal(waiter.status, 'done')
  assert.deepEqual(log.statuses, ['waiting', 'done'])
  assert.equal(log.forgot, 1)
  assert.equal(clock.pending(), 0, 'no timers left')
  await clock.advance(GIVE_UP_MS)
  assert.equal(log.tries.length, 3)
})

test('backs off to 15 s after the first minute', async () => {
  const { clock, log, waiter } = setup()
  waiter.start()
  await clock.advance(FAST_PHASE_MS + SLOW_MS * 2)
  const gaps = log.tries.slice(1).map((t, k) => t - log.tries[k])
  assert.ok(gaps.slice(0, 8).every((g) => g === FAST_MS))
  assert.equal(gaps.at(-1), SLOW_MS)
  waiter.stop()
})

test('any other error stops the wait and forgets the password', async () => {
  const { clock, log, waiter } = setup({ results: [NOT_CONFIRMED, { error: { code: 'over_request_rate_limit' } }] })
  waiter.start()
  await clock.advance(FAST_MS * 5)
  assert.equal(log.tries.length, 2)
  assert.equal(waiter.status, 'failed')
  assert.equal(log.forgot, 1)
  assert.equal(clock.pending(), 0)
})

test('a thrown sign-in (offline) stops too', async () => {
  const clock = fakeClock()
  let forgot = 0
  const waiter = createConfirmWait({
    attempt: () => Promise.reject(new TypeError('Failed to fetch')),
    forget: () => { forgot += 1 },
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  })
  waiter.start()
  await clock.advance(FAST_MS)
  assert.equal(waiter.status, 'failed')
  assert.equal(forgot, 1)
})

test('gives up after 15 minutes, forgetting the password', async () => {
  const { clock, log, waiter } = setup()
  waiter.start()
  await clock.advance(GIVE_UP_MS - 1)
  assert.equal(waiter.status, 'waiting')
  await clock.advance(1)
  assert.equal(waiter.status, 'timedOut')
  assert.deepEqual(log.statuses, ['waiting', 'timedOut'])
  assert.equal(log.forgot, 1)
  const n = log.tries.length
  await clock.advance(GIVE_UP_MS)
  waiter.poke()
  await clock.flush()
  assert.equal(log.tries.length, n, 'no tries after giving up')
})

test('gives up on time even while the tab stays hidden', async () => {
  const { clock, log, waiter } = setup({ visible: false })
  waiter.start()
  await clock.advance(GIVE_UP_MS)
  assert.equal(log.tries.length, 0)
  assert.equal(waiter.status, 'timedOut')
  assert.equal(log.forgot, 1)
})

test('never has two sign-ins in flight', async () => {
  const { clock, log, waiter, pendingResolves } = setup({ manual: true })
  waiter.start()
  await clock.advance(FAST_MS)
  assert.equal(log.tries.length, 1)
  // The request hangs; neither pokes nor time start another one.
  waiter.poke()
  await clock.advance(FAST_MS * 4)
  waiter.poke()
  assert.equal(log.tries.length, 1)
  assert.equal(log.maxInFlight, 1)
  pendingResolves.shift()()
  await clock.flush()
  await clock.advance(FAST_MS)
  assert.equal(log.tries.length, 2)
  assert.equal(log.maxInFlight, 1)
  waiter.stop()
})

test('coming back to the tab (visibility / focus) tries at once', async () => {
  const { clock, log, waiter, state } = setup()
  waiter.start()
  await clock.advance(FAST_MS) // first try at 6 s
  state.visible = false
  await clock.advance(FAST_MS * 3) // hidden: the tick is skipped
  assert.equal(log.tries.length, 1)
  state.visible = true
  waiter.poke()
  await clock.flush()
  assert.equal(log.tries.length, 2)
  assert.equal(log.tries[1], FAST_MS * 4)
  // …and the regular schedule carries on from there.
  await clock.advance(FAST_MS)
  assert.equal(log.tries.length, 3)
  waiter.stop()
})

test('pokes right after a try wait for the minimum gap', async () => {
  const { clock, log, waiter } = setup()
  waiter.start()
  await clock.advance(FAST_MS)
  await clock.advance(MIN_GAP_MS - 1)
  waiter.poke()
  await clock.flush()
  assert.equal(log.tries.length, 1)
  await clock.advance(1)
  waiter.poke()
  await clock.flush()
  assert.equal(log.tries.length, 2)
  waiter.stop()
})

test('a page opened in the background tries as soon as it is shown', async () => {
  const { clock, log, waiter, state } = setup()
  waiter.start()
  state.visible = false
  await clock.advance(FAST_MS) // skipped
  state.visible = true
  await clock.advance(1)
  waiter.poke()
  await clock.flush()
  assert.equal(log.tries.length, 1)
  state.visible = false
  await clock.advance(FAST_MS) // skipped again
  state.visible = true
  waiter.poke()
  await clock.flush()
  assert.equal(log.tries.length, 2)
  waiter.stop()
})

test('stop() from outside ends the wait once and forgets the password', async () => {
  const { clock, log, waiter } = setup()
  waiter.start()
  await clock.advance(FAST_MS)
  waiter.stop()
  waiter.stop()
  assert.equal(waiter.status, 'stopped')
  assert.equal(log.forgot, 1)
  assert.deepEqual(log.statuses, ['waiting', 'stopped'])
  assert.equal(clock.pending(), 0)
  await clock.advance(GIVE_UP_MS)
  assert.equal(log.tries.length, 1)
})

test('a sign-in that lands after stop() changes nothing', async () => {
  const { clock, log, waiter, pendingResolves } = setup({ manual: true, results: [{ error: null }] })
  waiter.start()
  await clock.advance(FAST_MS)
  waiter.stop()
  pendingResolves.shift()()
  await clock.flush()
  assert.equal(waiter.status, 'stopped')
  assert.equal(log.forgot, 1)
  assert.deepEqual(log.statuses, ['waiting', 'stopped'])
})

test('shouldGiveUp: the wait stops after fifteen minutes', () => {
  assert.equal(GIVE_UP_MS, 15 * 60_000)
  assert.equal(shouldGiveUp(0), false)
  assert.equal(shouldGiveUp(GIVE_UP_MS - 1), false)
  assert.equal(shouldGiveUp(GIVE_UP_MS), true)
})
