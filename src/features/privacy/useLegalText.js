import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLanguage } from '../../shared/lib/i18n/I18nProvider.jsx'
import { translate } from '../../shared/lib/i18n/i18n.js'
import { legalLanguage } from './legal.js'

// The language the Privacy Notice or Terms of Use is shown in: the app's,
// or the English original when the address asks for it (?lang=en, where the
// translation notice links). Returns the document's `t` (namespace
// `privacy`), its language, the app's language, and `href(path)` for a link
// to the other document in the same language.
export function useLegalText() {
  const { lang: appLang } = useLanguage()
  const [params] = useSearchParams()
  const lang = legalLanguage(params.get('lang'), appLang)
  const t = useCallback((key, vars) => translate(key, vars, { defaultNs: 'privacy', lang }), [lang])
  const href = useCallback((path) => (lang === appLang ? path : `${path}?lang=${lang}`), [lang, appLang])
  return { t, lang, appLang, href }
}
