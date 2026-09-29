// Plan mode's "Ideas to save" — which payments an idea may touch (pure; tested
// in test/planMath.test.js).
//
// Services: a small catalogue of well-known services by what they do. Two or
// more active recurring expenses of the same type are an overlap, whatever
// their categories. A payment matches on its name, ignoring case, accents,
// punctuation and extra words ("Apple ICloud ", "Netflix.com", "YOUTUBE
// PREMIUM"), but only on whole words: nothing fuzzy, so "Mobile Vikings" or
// "Revolut" never match. A service can do more than one thing (YouTube
// Premium: video and music). Nothing essential is in the catalogue.
//
// Essentials: payments we never suggest cancelling (a home, insurance of any
// kind, utilities, health, loans, taxes, childcare and school, pension and
// savings). Known by the category (a default category's key, or the icon of
// the user's own) or by a keyword in the payment's or its category's name,
// in English, Dutch, French and Greek. A false "essential" only means one
// idea fewer; a false service match would suggest cutting the wrong thing,
// which is why the catalogue is strict and the keywords are generous.
import { foldText } from '../../shared/lib/localeParse.js'

// Words only: accents and case folded, "+" read as "plus", everything else
// that isn't a letter or digit a space. "Disney+" → "disney plus".
function matchText(text) {
  return foldText(text).replace(/\+/g, ' plus ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

// The types, in the order their names are listed (plan:services.<type>).
export const SERVICE_TYPES = ['video', 'music', 'cloud', 'vpn', 'news']

// Each service: its types, the phrases that name it anywhere in a payment's
// name (whole words), and `only`: names that count only when they are the
// whole name ("Max" alone is HBO's service; "Max gym" isn't).
const SERVICES = [
  { types: ['video'], names: ['netflix'] },
  { types: ['video'], names: ['disney plus', 'disneyplus'], only: ['disney'] },
  { types: ['video'], names: ['hbo max', 'hbomax', 'hbo'], only: ['max'] },
  { types: ['video'], names: ['prime video', 'primevideo', 'amazon prime video'] },
  { types: ['video'], names: ['apple tv'] },
  { types: ['video'], names: ['paramount plus', 'paramountplus'], only: ['paramount'] },
  { types: ['video'], names: ['skyshowtime', 'sky showtime'] },
  { types: ['video'], names: ['viaplay'] },
  { types: ['video'], names: ['streamz'] },
  { types: ['video'], names: ['npo plus', 'npoplus', 'npo start'] },
  { types: ['video'], names: ['videoland'] },
  { types: ['video'], names: ['canal plus', 'canalplus', 'mycanal'] },
  { types: ['video'], names: ['dazn'] },
  { types: ['video'], names: ['crunchyroll'] },
  { types: ['video', 'music'], names: ['youtube premium'] },
  { types: ['music'], names: ['spotify'] },
  { types: ['music'], names: ['apple music'] },
  { types: ['music'], names: ['youtube music'] },
  { types: ['music'], names: ['deezer'] },
  { types: ['music'], names: ['tidal'] },
  { types: ['music'], names: ['amazon music'] },
  { types: ['music'], names: ['soundcloud'] },
  { types: ['cloud'], names: ['icloud'] },
  { types: ['cloud'], names: ['google one', 'google drive'] },
  { types: ['cloud'], names: ['dropbox'] },
  { types: ['cloud'], names: ['onedrive', 'one drive', 'microsoft 365', 'office 365'] },
  { types: ['cloud'], names: ['pcloud'] },
  { types: ['cloud'], names: ['proton drive'] },
  { types: ['vpn'], names: ['nordvpn', 'nord vpn'] },
  { types: ['vpn'], names: ['expressvpn', 'express vpn'] },
  { types: ['vpn'], names: ['surfshark'] },
  { types: ['vpn'], names: ['proton vpn', 'protonvpn'] },
  { types: ['vpn'], names: ['mullvad'] },
  { types: ['vpn'], names: ['cyberghost'] },
  { types: ['news'], names: ['new york times', 'nytimes', 'nyt'] },
  { types: ['news'], names: ['washington post'] },
  { types: ['news'], names: ['financial times'] },
  { types: ['news'], names: ['economist'] },
  { types: ['news'], names: ['wall street journal', 'wsj'] },
  { types: ['news'], names: ['le monde'] },
  { types: ['news'], names: ['de standaard'] },
  { types: ['news'], names: ['de tijd'] },
  { types: ['news'], names: ['volkskrant'] },
  { types: ['news'], names: ['kathimerini', 'καθημερινη'] },
]

// " a b " contains " b ": whole words only.
const hasPhrase = (words, phrase) => ` ${words} `.includes(` ${matchText(phrase)} `)

// The types a payment's name belongs to, in SERVICE_TYPES order ([] if none).
export function serviceTypes(name) {
  const words = matchText(name)
  if (!words) return []
  const found = new Set()
  for (const s of SERVICES) {
    if (s.names.some((n) => hasPhrase(words, n)) || (s.only ?? []).some((n) => words === matchText(n))) {
      s.types.forEach((ty) => found.add(ty))
    }
  }
  return SERVICE_TYPES.filter((ty) => found.has(ty))
}

// Essential categories: a default category's key, or the icon of the user's
// own. Plan also files these under "Bills" (planMath).
export const ESSENTIAL_KEYS = new Set(['housing', 'utilities', 'health'])
export const ESSENTIAL_ICONS = new Set(['housing', 'rent', 'utilities', 'electricity', 'water', 'health', 'taxes', 'insurance'])

// Essential keywords, folded (matchText). `stems` count anywhere in a word,
// for compounds ("autoverzekering", "ασφάλιστρα"); `words` only as a whole
// word, since they hide inside others ("tax" in "taxi", "rent" in "parent").
const ESSENTIAL_STEMS = [
  // insurance
  'insurance', 'verzekering', 'assurance', 'ασφαλ',
  // housing
  'mortgage', 'hypotheek', 'hypotheque', 'ενοικ', 'στεγαστικ',
  // utilities
  'electricity', 'elektriciteit', 'electricite', 'verwarming', 'θερμανσ',
  // loans
  'δανει',
  // taxes
  'belasting',
  // health
  'ziekenfonds', 'mutualiteit', 'mutuelle', 'ιατρ',
  // childcare and school
  'kinderopvang', 'childcare', 'kinderdagverblijf', 'σχολ', 'διδακτρ',
  // pension and savings
  'pensioen', 'συνταξ', 'αποταμιευ',
].map(matchText)
const ESSENTIAL_WORDS = [
  // housing
  'rent', 'huur', 'loyer', 'ενοικιο',
  // loans and debt
  'loan', 'loans', 'lening', 'pret', 'emprunt', 'credit', 'krediet', 'debt',
  // taxes
  'tax', 'taxes', 'impot', 'impots', 'φοροσ', 'φορου', 'φοροι', 'ενφια',
  // utilities
  'water', 'eau', 'νερο', 'ευδαπ', 'gas', 'gaz', 'αεριο', 'energy', 'energie', 'stroom', 'ρευμα', 'δεη',
  'heating', 'chauffage', 'electric',
  // health
  'health', 'medical', 'doctor', 'dentist', 'hospital',
  // childcare and school
  'school', 'ecole', 'daycare', 'creche', 'tuition', 'schoolgeld', 'minerval',
  // pension and savings
  'pension', 'retraite', 'savings', 'sparen', 'epargne',
].map(matchText)

// Whether a text names something essential.
function essentialText(text) {
  const words = matchText(text)
  if (!words) return false
  return ESSENTIAL_STEMS.some((s) => words.includes(s)) || ESSENTIAL_WORDS.some((w) => hasPhrase(words, w))
}

// Whether a plan row ({ name, category }) is essential: never suggested for
// cutting. `category` is the rule's { name, default_key, icon } or null.
export function isEssential(item) {
  const c = item.category
  if (ESSENTIAL_KEYS.has(c?.default_key) || ESSENTIAL_ICONS.has(c?.icon)) return true
  return essentialText(item.name) || (!c?.default_key && essentialText(c?.name))
}
