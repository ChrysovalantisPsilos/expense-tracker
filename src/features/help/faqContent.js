// The Help & FAQ page's questions and answers. Each section has an `id` and
// `title`; each item an `id` (its #anchor, lowercase-with-dashes and unique
// across the page: other pages link to them, so they never change with the
// language), a question `q` and an answer `a` (one string per paragraph);
// optionally numbered `steps` and a `media` illustration — an install guide
// ({ type: 'install', platform }) or a short clip from the app ({ type:
// 'clip', name, alt }: public/faq-media/<name>.webm + .mp4, .jpg poster).
//
// The words live in the `help` namespace (src/locales/<lang>/help.js, under
// `faq`); this file holds the order, anchors and media. The text properties
// are getters that read the active language each time they're used, so the
// page and its search show and match the language on screen. Paragraphs and
// steps follow the English dictionary's keys (a.p1, a.p2, … / steps.s1, …).
// Every answer must stay true to the app — update it alongside any change to
// the feature it describes (and re-record its clip).
import { SUPPORT_EMAIL, PRIVACY_EMAIL } from '../../shared/lib/contact.js'
import { t } from '../../shared/lib/i18n/i18n.js'
import en from '../../locales/en/help.js'

const CONTACTS = { supportEmail: SUPPORT_EMAIL, privacyEmail: PRIVACY_EMAIL }

// An anchor as its dictionary key: 'install-iphone' → 'installIphone'.
const keyOf = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())

function section(id, items) {
  return {
    id,
    get title() { return t(`help:faq.sections.${keyOf(id)}`) },
    items: items.map(item),
  }
}

function item({ id, media }) {
  const key = keyOf(id)
  const shape = en.faq.items[key]
  const tr = (path) => t(`help:faq.items.${key}.${path}`, CONTACTS)
  const out = {
    id,
    get q() { return tr('q') },
    get a() { return Object.keys(shape.a).map((p) => tr(`a.${p}`)) },
  }
  if (shape.steps) {
    Object.defineProperty(out, 'steps', {
      enumerable: true,
      get: () => Object.keys(shape.steps).map((s) => tr(`steps.${s}`)),
    })
  }
  if (media?.type === 'clip') out.media = { ...media, get alt() { return tr('clip') } }
  else if (media) out.media = media
  return out
}

const clip = (name) => ({ type: 'clip', name })
const install = (platform) => ({ type: 'install', platform })

export const FAQ_SECTIONS = [
  section('getting-started', [
    { id: 'what-is-budgeer' },
    { id: 'is-it-free' },
    { id: 'compared-to-others' },
    { id: 'financial-advice' },
    { id: 'who-runs-budgeer' },
    { id: 'sign-in-options' },
    { id: 'app-tour' },
  ]),
  section('install', [
    { id: 'install-app' },
    { id: 'install-iphone', media: install('iphone') },
    { id: 'install-android', media: install('android') },
    { id: 'install-samsung', media: install('samsung') },
    { id: 'install-desktop', media: install('desktop') },
    { id: 'install-benefits' },
  ]),
  section('expenses-income', [
    { id: 'add-expense' },
    { id: 'find-transaction' },
    { id: 'category-page' },
  ]),
  section('subscriptions-recurring', [
    { id: 'make-recurring', media: clip('repeat-expense') },
    { id: 'recurring-page' },
    { id: 'yearly-subscriptions', media: clip('yearly-subscription') },
    { id: 'salary-next-month' },
    { id: 'payment-reminders' },
  ]),
  section('budgets-categories', [
    { id: 'budgets-how', media: clip('category-budget') },
    { id: 'manage-categories' },
  ]),
  section('groups-splitting', [
    { id: 'invite-friends', media: clip('invite-friends') },
    { id: 'split-options' },
    { id: 'settle-up', media: clip('settle-up') },
    { id: 'group-reminders' },
  ]),
  section('currencies', [
    { id: 'foreign-currency' },
    { id: 'main-currency' },
  ]),
  section('import-receipts', [
    { id: 'bank-import', media: clip('bank-import') },
    { id: 'receipt-scan' },
  ]),
  section('reports-backups', [
    { id: 'statements' },
    { id: 'backups' },
  ]),
  section('account-security', [
    { id: 'passkeys' },
    { id: 'passkey-reminder' },
    { id: 'notifications' },
    { id: 'delete-account' },
  ]),
  section('privacy-data', [
    { id: 'encryption' },
    { id: 'ads-tracking' },
    { id: 'ai-helpers' },
    { id: 'download-delete-data', media: clip('download-data') },
    { id: 'privacy-requests' },
  ]),
  section('troubleshooting', [
    { id: 'old-data' },
    { id: 'offline-use' },
    { id: 'no-notifications' },
    { id: 'import-not-recognised' },
    { id: 'contact-support' },
  ]),
]
