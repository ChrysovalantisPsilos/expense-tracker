// The language preference (pure). Like the appearance preference
// (themePref.js) it is 'system' (follow the device, the default) or a fixed
// language. It lives on the device (STORAGE_KEYS.language) and, signed in, on
// the profile too (profiles.language, 0091: null = follow the device), so the
// server can write emails, pushes and PDFs in it later.

export const LANGUAGES = ['en', 'el']
export const DEFAULT_LANGUAGE = 'en'
export const SYSTEM = 'system'
export const LANGUAGE_PREFS = [SYSTEM, ...LANGUAGES]

// Each language's name in itself: the Language page and the public header's
// switch always show them like this, whatever the app's language is.
export const NATIVE_NAMES = { en: 'English', el: 'Ελληνικά' }
// The public header's short switch labels (one per language).
export const SHORT_NAMES = { en: 'EN', el: 'ΕΛ' }

// A stored preference, or 'system' for anything unknown (a blocked or
// tampered storage value).
export const normalisePref = (pref) => (LANGUAGE_PREFS.includes(pref) ? pref : SYSTEM)

// The device's language from navigator.languages: Greek when any preferred
// language is Greek ('el', 'el-GR', 'el-CY'), otherwise English.
export function deviceLanguage(navLanguages) {
  const list = Array.isArray(navLanguages) ? navLanguages : [navLanguages]
  return list.some((l) => /^el(-|$)/i.test(String(l ?? ''))) ? 'el' : DEFAULT_LANGUAGE
}

// The language a preference shows.
export function resolveLanguage(pref, navLanguages) {
  const p = normalisePref(pref)
  return p === SYSTEM ? deviceLanguage(navLanguages) : p
}

// profiles.language for a preference (null = follow the device), and back.
export const profileValue = (pref) => (normalisePref(pref) === SYSTEM ? null : pref)
export const prefFromProfile = (value) => (LANGUAGES.includes(value) ? value : SYSTEM)

// Signed-in load: reconcile this device's preference with the profile's.
// The profile wins when it holds a language. Null there means nothing was
// chosen while signed in, so a language picked on this device while signed
// out (the public header's switch) is saved up to the profile instead of
// being dropped. Returns { local, push }: the preference this device should
// use, and the profile value to save (undefined = no write).
export function reconcileLanguage(profileLanguage, localPref) {
  const local = normalisePref(localPref)
  if (LANGUAGES.includes(profileLanguage)) return { local: profileLanguage, push: undefined }
  return { local, push: local === SYSTEM ? undefined : local }
}
