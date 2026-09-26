// What each error screen says and offers. One illustration (the Budgeer "b"
// whose ring comes loose) carries across four situations; ErrorScreen.jsx
// draws them, and this module decides which one applies and its words.
//   notFound — an address no page answers (404)
//   crash    — an uncaught render error (ErrorBoundary)
//   update   — a page's code chunk failed to load after a deploy
//   offline  — a crash or chunk failure while the browser is offline
// Actions are ids; the caller maps them to links or handlers:
//   home, help, back (history back, else Home), reload.

import { t } from '../lib/i18n/i18n.js'

// Every variant, in the order the dev gallery shows them. Their words are
// common:errorScreen.<variant>.{eyebrow,title,body}.
export const ERROR_VARIANTS = ['notFound', 'crash', 'update', 'offline']

// The messages browsers and bundlers give when a lazily imported chunk can't
// be fetched: Chrome, Safari, Firefox, Vite's CSS preload, webpack-style.
const CHUNK_MESSAGES = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /error loading dynamically imported module/i,
  /unable to preload css/i,
  /loading (css )?chunk [\w-]+ failed/i,
]

export function isChunkLoadError(error) {
  if (!error) return false
  if (error.name === 'ChunkLoadError') return true
  const message = typeof error === 'string' ? error : error.message
  return typeof message === 'string' && CHUNK_MESSAGES.some((re) => re.test(message))
}

// Which screen a caught error gets. `online` is navigator.onLine: only an
// explicit false means offline (undefined — no such API — doesn't).
export function errorVariant(error, online) {
  if (online === false) return 'offline'
  return isChunkLoadError(error) ? 'update' : 'crash'
}

// Each action's label is its key under common:errorScreen.actions.
function actionsFor(variant, signedIn) {
  switch (variant) {
    case 'notFound':
      return signedIn
        ? [{ id: 'home', label: 'backHome', primary: true }, { id: 'back', label: 'goBack' }]
        : [{ id: 'home', label: 'goHome', primary: true }, { id: 'help', label: 'help' }]
    case 'crash':
      return [{ id: 'reload', label: 'reload', primary: true }, { id: 'home', label: 'goHome' }]
    case 'update':
      return [{ id: 'reload', label: 'reload', primary: true }]
    case 'offline':
      return [{ id: 'reload', label: 'tryAgain', primary: true }]
    default:
      throw new Error(`Unknown error screen: ${variant}`)
  }
}

// Everything a screen shows: { variant, eyebrow, title, body,
// actions: [{ id, label, primary? }] }. None of them shows the error's own
// message; the error boundary logs it to the console.
export function errorScreen(variant, { signedIn = false } = {}) {
  const actions = actionsFor(variant, signedIn)
    .map((a) => ({ ...a, label: t(`common:errorScreen.actions.${a.label}`) }))
  const copy = (part) => t(`common:errorScreen.${variant}.${part}`)
  return { variant, eyebrow: copy('eyebrow'), title: copy('title'), body: copy('body'), actions }
}
