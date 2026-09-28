// The iOS app's native plugins (Capacitor). Only ever loaded with a dynamic
// import() behind isNative() (platform.js), so the website's bundle never
// fetches this chunk or the plugins in it.
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { StatusBar, Style } from '@capacitor/status-bar'

// Google's sign-in page in the system browser sheet (Google refuses to sign
// in inside an app's web view). It comes back on the app's URL scheme.
export const openInBrowser = (url) => Browser.open({ url, presentationStyle: 'popover' })

// Dismiss the sheet once its redirect has reached the app.
export const closeBrowser = () => Browser.close().catch(() => {})

// Call `handle(url)` with the URL that launched the app (if any), then with
// every URL that brings it to the front. Returns the unsubscribe.
export function onAppUrl(handle) {
  const listener = App.addListener('appUrlOpen', ({ url }) => handle(url))
  App.getLaunchUrl().then((launch) => { if (launch?.url) handle(launch.url) }).catch(() => {})
  return () => { listener.then((l) => l.remove()).catch(() => {}) }
}

// The status bar follows the app's colour mode (Chakra's 'light' | 'dark'):
// dark text on the light theme, light text on the dark one.
export const setStatusBarTheme = (colorMode) =>
  StatusBar.setStyle({ style: colorMode === 'dark' ? Style.Dark : Style.Light }).catch(() => {})
