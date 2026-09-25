// Friendly UTC time formatting (pure). All times on the page are UTC.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY = 86400000

const d = (t) => new Date(t)
const pad = (n) => String(n).padStart(2, '0')
const dayStart = (t) => Math.floor(d(t).getTime() / DAY)

export const clock = (t) => `${pad(d(t).getUTCHours())}:${pad(d(t).getUTCMinutes())}`
export const dayMonth = (t) => `${d(t).getUTCDate()} ${MONTHS[d(t).getUTCMonth()]}`
export const fullDate = (t) => `${dayMonth(t)} ${d(t).getUTCFullYear()}`
export const monthShort = (t) => MONTHS[d(t).getUTCMonth()].toUpperCase()
export const dayOfMonth = (t) => d(t).getUTCDate()
export const shortDay = (t) => `${DAYS[d(t).getUTCDay()].slice(0, 3)} ${dayMonth(t)}`

// "Today" / "Yesterday" / "13 Sep".
export function relDay(t, now) {
  const diff = dayStart(now) - dayStart(t)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return dayMonth(t)
}

// "Today, 09:05" / "13 Sep, 14:52".
export const stamp = (t, now) => `${relDay(t, now)}, ${clock(t)}`

// "today at 07:40" / "yesterday at 07:40" / "13 Sep at 07:40".
export function startedAt(t, now) {
  const r = relDay(t, now)
  return `${r === 'Today' || r === 'Yesterday' ? r.toLowerCase() : r} at ${clock(t)}`
}

// "47 min", "2 h 5 min", "3 days".
export function duration(ms) {
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  return `${Math.round(h / 24)} days`
}

// "just now", "4 minutes ago", "2 hours ago", "12 days ago".
export function ago(t, now) {
  const min = Math.floor((d(now).getTime() - d(t).getTime()) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const days = Math.floor(h / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

// A maintenance window: "Sunday, 02:00–02:30 UTC", or across days
// "Sun 4 Oct 22:00 – Mon 5 Oct 01:00 UTC".
export function windowText(start, end) {
  if (dayStart(start) === dayStart(end)) return `${DAYS[d(start).getUTCDay()]}, ${clock(start)}–${clock(end)} UTC`
  return `${shortDay(start)} ${clock(start)} – ${shortDay(end)} ${clock(end)} UTC`
}

// The same, dated, for lists: "Sun 4 Oct, 02:00–02:30 UTC".
export function windowDated(start, end) {
  if (dayStart(start) === dayStart(end)) return `${shortDay(start)}, ${clock(start)}–${clock(end)} UTC`
  return windowText(start, end)
}
