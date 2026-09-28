// Web or the iOS app? The iOS app (ios/, Capacitor) runs this same build
// inside a native web view, and a few things must differ there: no service
// worker or auto-update, sign-in through the system browser, links built on
// the public site instead of the app's own capacitor://localhost origin.
// Everything native is gated on isNative(), so the website never runs it.
//
// Capacitor's native side puts `window.Capacitor` on the page before any of
// our code loads, so detecting it needs no import: the web bundle doesn't
// carry @capacitor/core for this. Pure (the global is injectable for tests).
import { CURRENT_ENV, LIVE, SITES, TEST, projectEnvironment } from './environment.js'

export function isNative(g = globalThis) {
  return g?.Capacitor?.isNativePlatform?.() === true
}

// The origin for links that leave this device (invite links, emails' return
// addresses, shared FAQ links): the page's own origin on the web; in the app,
// the website the build talks to, since capacitor://localhost means nothing
// anywhere else.
export function siteOrigin(g = globalThis, env = CURRENT_ENV) {
  return isNative(g) ? SITES[env].origin : g.location.origin
}

// The iOS build picks its environment at build time with a Vite mode
// (`npm run ios:sync` → ios-dev, `npm run ios:sync:prod` → ios-prod), read
// from gitignored .env.ios-dev / .env.ios-prod files. A native build with no
// Supabase config, or with the other environment's, would ship a broken or
// mis-pointed app, so vite.config.js stops the build with this message. (The
// plain names win over the _DEV pair in supabase.js, and a mode's file over
// .env.local, so a local web setup can't leak into it.)
// Returns null when fine (and for every non-iOS mode: the web build is
// untouched).
const NATIVE_MODES = { 'ios-dev': TEST, 'ios-prod': LIVE }

export function nativeBuildError(mode, env = {}) {
  const want = NATIVE_MODES[mode]
  if (!want) return null
  const url = env.VITE_SUPABASE_URL
  if (!url || !env.VITE_SUPABASE_ANON_KEY) {
    return `The ${mode} build needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.${mode} (see docs/IOS.md).`
  }
  if (projectEnvironment(url) !== want) {
    return `.env.${mode} points at the wrong Supabase project for ${mode} (see docs/IOS.md).`
  }
  return null
}
