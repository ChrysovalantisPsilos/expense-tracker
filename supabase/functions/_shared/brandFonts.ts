// The statement PDFs' font files, one list for both places that build them.
//
// Poppins (headings) and Nunito Sans (body) are the static TTFs bundled in
// the @expo-google-fonts npm packages (google/fonts only keeps variable fonts
// for these families), DejaVu Sans is the Unicode fallback (Greek, arrows,
// ≈). Each is pinned to an npm version:
//   - the edge functions fetch it from jsDelivr (cdnFontUrl);
//   - the app serves the same file from its own origin (vite.config.js copies
//     it out of node_modules under STATEMENT_FONT_DIR; the service worker
//     caches it on first use), so a statement made on the device works
//     offline and stays inside the app's Content-Security-Policy.
// package.json pins the same versions as devDependencies
// (test/deviceStatements.test.js checks they agree).

export const BRAND_FONTS = {
  head: { pkg: '@expo-google-fonts/poppins@0.2.3', file: 'Poppins_600SemiBold.ttf' },
  headBold: { pkg: '@expo-google-fonts/poppins@0.2.3', file: 'Poppins_700Bold.ttf' },
  body: { pkg: '@expo-google-fonts/nunito-sans@0.2.3', file: 'NunitoSans_400Regular.ttf' },
  bodyBold: { pkg: '@expo-google-fonts/nunito-sans@0.2.3', file: 'NunitoSans_700Bold.ttf' },
  uni: { pkg: 'dejavu-fonts-ttf@2.37.3', file: 'ttf/DejaVuSans.ttf' },
} as const

export type FontRole = keyof typeof BRAND_FONTS

// Where the app serves the fonts: /statement-fonts/<pkg@version>/<file>.
export const STATEMENT_FONT_DIR = 'statement-fonts'

// "<pkg@version>/<file>": the path under jsDelivr's /npm/ and under
// STATEMENT_FONT_DIR alike.
export const fontPath = (role: FontRole): string => `${BRAND_FONTS[role].pkg}/${BRAND_FONTS[role].file}`

export const cdnFontUrl = (role: FontRole): string => `https://cdn.jsdelivr.net/npm/${fontPath(role)}`
