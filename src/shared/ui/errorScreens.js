// What each error screen says and offers. One illustration (the Budgeer "b"
// whose ring comes loose) carries across four situations; ErrorScreen.jsx
// draws them, and this module decides which one applies and its words.
//   notFound — an address no page answers (404)
//   crash    — an uncaught render error (ErrorBoundary)
//   update   — a page's code chunk failed to load after a deploy
//   offline  — a crash or chunk failure while the browser is offline
// Actions are ids; the caller maps them to links or handlers:
//   home, help, back (history back, else Home), reload.

const SAFE = 'your data is safe on the server.'

const COPY = {
  notFound: {
    eyebrow: '404 · Page not found',
    title: 'This page rolled away',
    body: 'We couldn’t find what you were looking for. It may have moved, or the link is off by a digit.',
  },
  crash: {
    eyebrow: 'Unexpected error',
    title: 'Something went wrong',
    body: `Budgeer hit an unexpected error. Reloading usually fixes it — ${SAFE}`,
  },
  update: {
    eyebrow: 'Update',
    title: 'A new version of Budgeer is ready',
    body: `This page changed in the latest update. Reload to pick it up — ${SAFE}`,
  },
  offline: {
    eyebrow: 'No connection',
    title: 'You’re offline',
    body: `This page needs a connection to load. Check your Wi-Fi or mobile data, then try again — ${SAFE}`,
  },
}

// Every variant, in the order the dev gallery shows them.
export const ERROR_VARIANTS = Object.keys(COPY)

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

function actionsFor(variant, signedIn) {
  switch (variant) {
    case 'notFound':
      return signedIn
        ? [{ id: 'home', label: 'Back to Home', primary: true }, { id: 'back', label: 'Go back' }]
        : [{ id: 'home', label: 'Go to Home', primary: true }, { id: 'help', label: 'Help & FAQ' }]
    case 'crash':
      return [{ id: 'reload', label: 'Reload', primary: true }, { id: 'home', label: 'Go to Home' }]
    case 'update':
      return [{ id: 'reload', label: 'Reload', primary: true }]
    case 'offline':
      return [{ id: 'reload', label: 'Try again', primary: true }]
    default:
      throw new Error(`Unknown error screen: ${variant}`)
  }
}

// Everything a screen shows: { variant, eyebrow, title, body,
// actions: [{ id, label, primary? }] }. None of them shows the error's own
// message; the error boundary logs it to the console.
export function errorScreen(variant, { signedIn = false } = {}) {
  const actions = actionsFor(variant, signedIn)
  return { variant, ...COPY[variant], actions }
}
