// Runs in <head> before the page paints (a file, not inline: the CSP allows
// only same-origin scripts). Marks <html> with the colour mode the app is
// about to use, so index.html's loading screen already has the right colours
// and the app's first screen matches it. Same rule as AppearanceProvider
// (src/shared/lib/appearance.jsx): the saved Light / Dark / System choice
// (STORAGE_KEYS.appearance), System following the OS. Without it (or with
// storage blocked) the loading screen's CSS follows the OS on its own.
(function () {
  try {
    var pref = window.localStorage.getItem('budge-appearance')
    var dark = pref === 'dark' ||
      (pref !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    var mode = dark ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', mode)
    document.documentElement.style.colorScheme = mode
  } catch { /* storage blocked: keep the CSS default */ }
})()
