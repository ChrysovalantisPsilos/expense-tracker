// Admin form validation (pure). Every field is length-limited and checked
// against a fixed set; anything else is refused with a friendly message.
// Input is a plain object built from FormData: { name: string | string[] }.
import { COMPONENT_IDS } from './components.js'

export const LIMITS = { title: 120, message: 2000, maxWindowDays: 7 }
export const IMPACTS = ['minor', 'partial', 'major']
export const STAGES = ['investigating', 'identified', 'monitoring', 'resolved']
export const OVERRIDE_CHOICES = ['automatic', 'working', 'slow', 'down']

const one = (v) => (Array.isArray(v) ? v[0] : v)
const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const str = (v) => (typeof one(v) === 'string' ? one(v) : '')

// No control characters, except line breaks and tabs in messages.
function hasControlChars(s, multiline) {
  for (const ch of s) {
    const c = ch.codePointAt(0)
    if (multiline && (c === 9 || c === 10 || c === 13)) continue
    if (c < 32 || c === 127 || c === 0x2028 || c === 0x2029) return true
  }
  return false
}

function text(errors, form, key, { label, max, multiline = false }) {
  const value = str(form[key]).replace(/\r\n/g, '\n').trim()
  if (!value) errors[key] = `Add a ${label}.`
  else if (value.length > max) errors[key] = `Keep the ${label} under ${max} characters.`
  else if (hasControlChars(value, multiline)) errors[key] = `The ${label} has characters we can’t show.`
  return value
}

function parts(errors, form, key) {
  const ids = [...new Set(list(form[key]).map(String))]
  if (!ids.length) errors[key] = 'Pick at least one affected part.'
  else if (ids.some((id) => !COMPONENT_IDS.includes(id))) errors[key] = 'Pick parts from the list.'
  return COMPONENT_IDS.filter((id) => ids.includes(id))
}

function choice(errors, form, key, allowed, message) {
  const v = str(form[key])
  if (!allowed.includes(v)) errors[key] = message
  return v
}

const result = (value, errors) => (Object.keys(errors).length ? { ok: false, errors, value } : { ok: true, value })

export function validateIncident(form) {
  const errors = {}
  const value = {
    title: text(errors, form, 'title', { label: 'title', max: LIMITS.title }),
    components: parts(errors, form, 'parts'),
    impact: choice(errors, form, 'impact', IMPACTS, 'Choose how bad it is.'),
    stage: choice(errors, form, 'stage', STAGES, 'Choose where you are.'),
    message: text(errors, form, 'message', { label: 'message', max: LIMITS.message, multiline: true }),
  }
  return result(value, errors)
}

export function validateUpdate(form) {
  const errors = {}
  const value = {
    stage: choice(errors, form, 'stage', STAGES, 'Choose where you are.'),
    message: text(errors, form, 'message', { label: 'message', max: LIMITS.message, multiline: true }),
  }
  return result(value, errors)
}

// Editing an incident: title, parts, impact, and the text of its updates
// (fields "msg-<update id>", for the ids the incident really has).
export function validateIncidentEdit(form, updateIds) {
  const errors = {}
  const value = {
    title: text(errors, form, 'title', { label: 'title', max: LIMITS.title }),
    components: parts(errors, form, 'parts'),
    impact: choice(errors, form, 'impact', IMPACTS, 'Choose how bad it is.'),
    messages: updateIds.map((id) => ({
      id, message: text(errors, form, `msg-${id}`, { label: 'message', max: LIMITS.message, multiline: true }),
    })),
  }
  return result(value, errors)
}

// <input type="datetime-local"> in UTC: "2026-10-04T02:00" → ISO string.
export function parseUtcLocal(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v)
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  const t = Date.UTC(y, mo - 1, d, h, mi)
  const back = new Date(t)
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59) return null
  return back.toISOString()
}

export function validateMaintenance(form) {
  const errors = {}
  const startsAt = parseUtcLocal(str(form.starts))
  const endsAt = parseUtcLocal(str(form.ends))
  if (!startsAt) errors.starts = 'Choose when it starts.'
  if (!endsAt) errors.ends = 'Choose when it ends.'
  if (startsAt && endsAt) {
    const len = Date.parse(endsAt) - Date.parse(startsAt)
    if (len <= 0) errors.ends = 'It has to end after it starts.'
    else if (len > LIMITS.maxWindowDays * 86400000) errors.ends = `Keep it under ${LIMITS.maxWindowDays} days.`
  }
  const value = {
    title: text(errors, form, 'title', { label: 'title', max: LIMITS.title }),
    components: parts(errors, form, 'parts'),
    message: text(errors, form, 'message', { label: 'message', max: LIMITS.message, multiline: true }),
    startsAt, endsAt,
  }
  return result(value, errors)
}

// Overrides form: "ov-<component>" = automatic | working | slow | down.
export function validateOverrides(form) {
  const errors = {}
  const value = {}
  for (const id of COMPONENT_IDS) {
    const v = str(form[`ov-${id}`]) || 'automatic'
    if (!OVERRIDE_CHOICES.includes(v)) errors[`ov-${id}`] = 'Choose a status from the list.'
    else value[id] = v
  }
  return result(value, errors)
}

// Row ids in URLs: positive integers only.
export function parseId(s) {
  return /^[1-9]\d{0,9}$/.test(s) ? Number(s) : null
}

// FormData → plain object; repeated names become arrays.
export function formObject(fd) {
  const out = {}
  for (const [k, v] of fd.entries()) {
    if (typeof v !== 'string') continue
    out[k] = k in out ? list(out[k]).concat(v) : v
  }
  return out
}
