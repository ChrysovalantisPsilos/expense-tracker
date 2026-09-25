// How stale the ECB exchange rates are, in TARGET business days.
//
// The ECB publishes reference rates once per TARGET business day, around
// 16:00 CET (14:00–15:00 UTC); there are none at weekends or on the TARGET
// holidays (1 Jan, Good Friday, Easter Monday, 1 May, 25 and 26 Dec). The app's
// fx-sync job pulls them within minutes, but we allow until 16:00 UTC before
// counting a day's rates as due.
//
// "Missed" = publications that are due but not in the cache. One missed
// publication is normal (a late ECB release, or the next pull hasn't run); two
// or more means the rates are running late.
const DAY = 86400000
const PUBLISHED_BY_UTC_HOUR = 16

export function easterSunday(year) {
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return Date.UTC(year, month - 1, day)
}

const midnight = (t) => Math.floor(t / DAY) * DAY

export function isBusinessDay(t) {
  const d = new Date(midnight(t))
  const wd = d.getUTCDay()
  if (wd === 0 || wd === 6) return false
  const m = d.getUTCMonth() + 1, day = d.getUTCDate()
  if ((m === 1 && day === 1) || (m === 5 && day === 1) || (m === 12 && (day === 25 || day === 26))) return false
  const easter = easterSunday(d.getUTCFullYear())
  const at = midnight(t)
  return at !== easter - 2 * DAY && at !== easter + DAY
}

// The newest rate date that should be published by `now` (ms, midnight UTC).
export function expectedLatest(now) {
  let t = midnight(now)
  if (!(isBusinessDay(t) && new Date(now).getUTCHours() >= PUBLISHED_BY_UTC_HOUR)) t -= DAY
  while (!isBusinessDay(t)) t -= DAY
  return t
}

// Due publications after `latestIso` (a "YYYY-MM-DD" rate date).
export function missedPublications(latestIso, now) {
  const latest = Date.parse(`${latestIso}T00:00:00Z`)
  let n = 0
  for (let t = expectedLatest(now); t > latest && n < 30; t -= DAY) {
    if (isBusinessDay(t)) n += 1
  }
  return n
}

export function fxState(latestIso, now) {
  if (typeof latestIso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(latestIso)) return 'unknown'
  return missedPublications(latestIso, now instanceof Date ? now.getTime() : now) >= 2 ? 'slow' : 'working'
}
