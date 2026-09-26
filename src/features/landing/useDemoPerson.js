import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// A demo member's name (landingDemo.js member id → "You" / "Εσύ", "Anna" /
// "Άννα", …) in the app's language.
export default function useDemoPerson() {
  const t = useT('landing')
  return (id) => t(`demo.people.${id}`)
}
