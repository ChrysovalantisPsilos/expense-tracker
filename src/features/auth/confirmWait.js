// Waiting for a new account's email confirmation ("Check your inbox"). The
// page quietly retries the password sign-in; as soon as the link has been
// opened, on any device, the retry succeeds and the app carries on. Pure
// scheduling only: the sign-in itself, the clock and the timers are passed
// in, so the tests drive it without real waiting.
//
// Budget: Supabase Auth allows 30 sign-in/sign-up requests per 5 minutes per
// IP address by default (Dashboard → Authentication → Rate Limits; the repo's
// config.toml sets no [auth.rate_limit], so the hosted default applies). The
// schedule stays under it with room for the manual "log in" button: one
// minute at 6 s (10), then 15 s (16 more in the first five minutes, 20 per
// five minutes after that).

export const FAST_MS = 6_000
export const FAST_PHASE_MS = 60_000
export const SLOW_MS = 15_000
export const GIVE_UP_MS = 15 * 60_000
// A tab switch or focus retries at once, but never sooner than this after
// the last try (flicking between apps mustn't burn the budget).
export const MIN_GAP_MS = 3_000

// How long to wait before the next try, `elapsed` ms after the wait began.
export function nextDelay(elapsed) {
  return elapsed < FAST_PHASE_MS ? FAST_MS : SLOW_MS
}

// Has the wait gone on long enough (`elapsed` ms) to stop trying?
export function shouldGiveUp(elapsed) {
  return elapsed >= GIVE_UP_MS
}

// A sign-in result → 'done' (signed in), 'wait' (not confirmed yet; try
// again) or 'stop' (anything else: rate limit, offline, a changed password).
export function attemptOutcome(result) {
  const error = result?.error
  if (!error) return 'done'
  return error.code === 'email_not_confirmed' ? 'wait' : 'stop'
}

// The waiter. `attempt()` resolves to a sign-in result ({ error }); `forget()`
// drops the remembered password, and runs once, whenever the wait ends for
// any reason. `onChange(status)` reports 'waiting' → 'done' | 'timedOut' |
// 'failed' | 'stopped' (stop() from outside: the page closed, a session
// arrived another way, "Start over"). `isVisible()` pauses tries while the
// tab is hidden; poke() (tab shown again, window focused) tries at once.
export function createConfirmWait({
  attempt, forget, onChange = () => {}, isVisible = () => true,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  let status = 'idle'
  let startedAt = 0
  let lastTry = -Infinity
  let inFlight = false
  let timer = null
  let deadline = null

  function end(next) {
    if (status !== 'waiting') return
    status = next
    clearTimer(timer)
    clearTimer(deadline)
    timer = deadline = null
    forget()
    onChange(next)
  }

  function schedule() {
    clearTimer(timer)
    timer = setTimer(tick, nextDelay(now() - startedAt))
  }

  async function tryOnce() {
    if (status !== 'waiting' || inFlight) return
    if (shouldGiveUp(now() - startedAt)) { end('timedOut'); return }
    inFlight = true
    lastTry = now()
    let result
    try { result = await attempt() } catch (error) { result = { error } }
    inFlight = false
    if (status !== 'waiting') return
    const outcome = attemptOutcome(result)
    if (outcome === 'done') end('done')
    else if (outcome === 'stop') end('failed')
    else schedule()
  }

  function tick() {
    timer = null
    if (!isVisible()) return // resumes on poke() when the tab is shown
    void tryOnce()
  }

  return {
    start() {
      if (status !== 'idle') return
      status = 'waiting'
      startedAt = now()
      onChange('waiting')
      deadline = setTimer(() => end('timedOut'), GIVE_UP_MS)
      schedule()
    },
    poke() {
      if (status !== 'waiting' || inFlight || !isVisible()) return
      // Too soon: the timer (set after that try) is still pending. A tick
      // skipped while hidden came FAST_MS or more after the last try.
      if (now() - lastTry < MIN_GAP_MS) return
      clearTimer(timer)
      timer = null
      void tryOnce()
    },
    stop() { end('stopped') },
    get status() { return status },
  }
}
