// Budgeer's raw colour and type values. The Chakra theme (app/theme.js) is
// built from them, and so is the loading screen in index.html, which paints
// before any JavaScript runs (ringLoader.js). Pure data.

export const colors = {
  // Primary accent — coral.
  brand: {
    50: '#fff4f1',
    100: '#ffe3db',
    200: '#ffc5b6',
    300: '#ffa088',
    400: '#ff7a5a',
    500: '#f95d38', // primary
    600: '#e2431f',
    700: '#bd3418',
    800: '#962b17',
    900: '#7a2717',
  },
  // Secondary accent — amber (positive/highlights).
  amber: {
    50: '#fff8eb',
    100: '#feefc7',
    200: '#fddf8a',
    300: '#fcc94d',
    400: '#fbb324',
    500: '#f59e0b',
    600: '#d97a06',
    700: '#b45709',
    800: '#92440e',
    900: '#78390f',
  },
  // Warm neutral ramp (sand) — replaces cool gray everywhere.
  sand: {
    50: '#faf8f4',
    100: '#f3efe7',
    200: '#e8e1d5',
    300: '#d6ccba',
    400: '#b8ab94',
    500: '#9a8b72',
    600: '#7c6f59',
    700: '#5f5545',
    800: '#3d372d',
    900: '#242019',
  },
  // Warm brick red — replaces Chakra's saturated red, so everything that
  // uses colorScheme="red" (destructive buttons, tags, form errors, error
  // toasts) reads as clearly red, never coral. 500 and 200 are the
  // status.negative values for light and dark mode.
  red: {
    50: '#fdf1ee',
    100: '#fbdcd5',
    200: '#f2917f',
    300: '#e9705d',
    400: '#d9503f',
    500: '#c2372b',
    600: '#a52d23',
    700: '#87251d',
    800: '#6b1e18',
    900: '#541914',
  },
}

// Dark-mode surfaces; theme.js maps its semantic tokens onto them (light mode
// uses the sand ramp: canvas 50, subtle 100, border 200, text 900).
export const DARK = {
  canvas: '#1a1714',
  surface: '#232019',
  subtle: '#2b271f',
  border: '#352f26',
  text: '#f6f2ea',
}

export const FONTS = {
  heading: `'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  body: `'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
}
