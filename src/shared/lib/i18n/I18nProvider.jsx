import { Children, Fragment, cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { STORAGE_KEYS } from '../keys.js'
import { getLanguage, loadLanguage, translate } from './i18n.js'
import { normalisePref, resolveLanguage } from './language.js'
import { parseRich } from './translate.js'

// The language preference ('system' | 'en' | 'el'), following the appearance
// pattern (appearance.jsx): kept on this device, applied app-wide, and
// written to <html lang>. The profile side (profiles.language) is
// ProfileLanguage.jsx. docs/I18N.md has the conventions.

const LANGUAGE_KEY = STORAGE_KEYS.language

// Storage can be blocked (private mode, a locked-down browser): then the
// preference just isn't remembered.
function readLanguagePref() {
  try { return normalisePref(localStorage.getItem(LANGUAGE_KEY)) } catch { return normalisePref(null) }
}
function writeLanguagePref(pref) {
  try { localStorage.setItem(LANGUAGE_KEY, pref) } catch { /* not remembered */ }
}

const deviceLanguages = () => navigator.languages ?? [navigator.language]

// Before the first render (main.jsx): load the language this device will
// show, so a Greek device never flashes English first.
export async function bootLanguage() {
  const lang = await loadLanguage(resolveLanguage(readLanguagePref(), deviceLanguages()))
  document.documentElement.lang = lang
  return lang
}

const Ctx = createContext({ pref: 'system', lang: 'en', setPref: () => {} })

export function LanguageProvider({ children }) {
  const [pref, setPrefState] = useState(readLanguagePref)
  // The language on screen: changes only once its dictionaries are loaded.
  const [lang, setLang] = useState(getLanguage)

  useEffect(() => {
    let live = true
    const apply = () => {
      loadLanguage(resolveLanguage(pref, deviceLanguages())).then((next) => {
        if (!live) return
        document.documentElement.lang = next
        setLang(next)
      })
    }
    apply()
    // "Follow my device" follows it live, like the appearance's System.
    window.addEventListener('languagechange', apply)
    return () => { live = false; window.removeEventListener('languagechange', apply) }
  }, [pref])

  const setPref = useCallback((next) => {
    const p = normalisePref(next)
    writeLanguagePref(p)
    setPrefState(p)
  }, [])

  const value = useMemo(() => ({ pref, lang, setPref }), [pref, lang, setPref])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// { pref, lang, setPref }: the preference, the language on screen, and the
// setter (this device only; Settings › Language also saves it to the profile).
export const useLanguage = () => useContext(Ctx)

// Remounts `children` when the language changes, so everything re-renders in
// it, including components that only format numbers and dates (they don't
// read the context). Only a language switch does this; it's rare.
export function LanguageBoundary({ children }) {
  const { lang } = useLanguage()
  return <Fragment key={lang}>{children}</Fragment>
}

// The component-side t(): `useT('settings')` returns t(key, vars), where a key
// without a namespace ('appearance.title') is looked up in 'settings', and a
// full key ('common:actions.save') anywhere.
export function useT(defaultNs = 'common') {
  const { lang } = useLanguage()
  return useCallback((key, vars) => translate(key, vars, { defaultNs, lang }), [defaultNs, lang])
}

// Turns parseRich()'s tree into React nodes: each tag becomes a copy of the
// matching element in `components` with the translated words as children
// (a self-closing tag, like <br/>, keeps the element's own children). A tag
// with no component renders its words as plain text.
function renderRich(nodes, components, path = '') {
  return nodes.map((node, i) => {
    if (typeof node === 'string') return node
    const key = `${path}${i}`
    const inner = renderRich(node.children, components, `${key}.`)
    const el = components[node.tag]
    if (!isValidElement(el)) return <Fragment key={key}>{inner}</Fragment>
    return cloneElement(el, { key }, ...(inner.length ? inner : Children.toArray(el.props.children)))
  })
}

// Rich text: a translation with elements inside it, without any HTML
// injection. The string marks the parts with tags, the caller maps each tag
// to an element:
//   "terms": "Read the <link>Terms of Use</link> first."
//   <Trans t={t} k="terms" components={{ link: <Link as={RouterLink} to="/terms" /> }} />
export function Trans({ t, k, values, components = {} }) {
  return <>{renderRich(parseRich(t(k, values)), components)}</>
}

// The same for words already translated (a page part's string with its tags,
// worked out by a pure module): <Rich text={parts.gap} components={{ b: <b /> }} />
export function Rich({ text, components = {} }) {
  return <>{renderRich(parseRich(text), components)}</>
}
