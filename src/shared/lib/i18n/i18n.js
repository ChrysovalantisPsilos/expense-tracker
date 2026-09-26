// The active language and its dictionaries, plus the plain t() for code
// outside React (data modules, toasts built in helpers, maths that returns
// labels). Components use useT() from I18nProvider.jsx instead, which
// re-renders them when the language changes.
//
// English is bundled with the app (every string falls back to it); Greek is
// its own chunk, fetched by loadLanguage() before the app first renders in it.
import en from '../../../locales/en/index.js'
import { DEFAULT_LANGUAGE } from './language.js'
import { translateIn } from './translate.js'

const loaded = { en }
let active = DEFAULT_LANGUAGE

// Each language's dictionary pack: a lazy chunk (Vite code-splits the dynamic
// import), except English, which is always loaded.
const PACKS = {
  el: () => import('../../../locales/el/index.js'),
}

const isDev = () => typeof import.meta.env === 'object' && !!import.meta.env.DEV
const warned = new Set()
function warnOnce(msg) {
  if (!isDev() || warned.has(msg)) return
  warned.add(msg)
  console.warn(`[i18n] ${msg}`)
}

export const getLanguage = () => active

// Fetch `lang`'s dictionaries (once) and make it the active language. English
// stays active when the pack can't load (offline before it was cached), so
// the app still opens.
export async function loadLanguage(lang) {
  if (!loaded[lang] && PACKS[lang]) {
    try {
      loaded[lang] = (await PACKS[lang]()).default
    } catch (err) {
      console.error(`[i18n] couldn't load the ${lang} strings; showing English`, err)
      active = DEFAULT_LANGUAGE
      return active
    }
  }
  active = loaded[lang] ? lang : DEFAULT_LANGUAGE
  return active
}

// Translate `key` ('ns:path.to.string', or 'path' with `defaultNs`) into the
// active language (or `lang`). `vars` fill {{placeholders}}; a numeric
// `vars.count` picks the plural form. A key missing in the language falls back
// to English, with a dev-only warning (translateIn).
export const translate = (key, vars, { defaultNs = 'common', lang = active } = {}) =>
  translateIn(loaded, lang, key, vars, { defaultNs, fallback: DEFAULT_LANGUAGE, onMissing: warnOnce })

// The plain t(): always takes a full 'ns:key'. Call it when the text is
// needed (in a function), never at module load, or it's stuck in English.
export const t = (key, vars) => translate(key, vars)

// The locale for Intl formatting. English keeps the exact locale each call
// site used before i18n (`english`: 'en-US', 'en-GB', or undefined for the
// device's own), so English output doesn't change; Greek is 'el-GR'
// ("1.234,56 €", "26 Σεπ 2026").
const INTL_LOCALES = { el: 'el-GR' }
export const intlLocale = (english = undefined) => INTL_LOCALES[active] ?? english
