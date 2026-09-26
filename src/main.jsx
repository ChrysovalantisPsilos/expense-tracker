import React from 'react'
import ReactDOM from 'react-dom/client'
// Self-hosted fonts (bundled + precached by the PWA, so they work offline).
// Latin subset only, in the weights the theme uses: the all-subset entry
// points would precache 24 woff2 files (Cyrillic, Devanagari, Vietnamese…)
// that the English UI never renders. Glyphs outside Latin fall back to the
// system font in the theme's font stack.
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource/nunito-sans/latin-400.css'
import '@fontsource/nunito-sans/latin-600.css'
import '@fontsource/nunito-sans/latin-700.css'
// Greek letters: Poppins and Nunito Sans have none, so the stacks in
// palette.js fall back glyph by glyph to Manrope (headings) and Noto Sans
// (body). These are the Greek subsets only; their unicode-range means the
// browser downloads them only when a page actually shows Greek text.
import '@fontsource/manrope/greek-500.css'
import '@fontsource/manrope/greek-600.css'
import '@fontsource/manrope/greek-700.css'
import '@fontsource/noto-sans/greek-400.css'
import '@fontsource/noto-sans/greek-600.css'
import '@fontsource/noto-sans/greek-700.css'
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App.jsx'
import ErrorBoundary from './app/ErrorBoundary.jsx'
import RootFallback from './app/RootFallback.jsx'
import theme from './app/theme.js'
import { AuthProvider } from './shared/auth/AuthProvider.jsx'
import { ProfileProvider } from './shared/lib/ProfileProvider.jsx'
import { AppearanceProvider } from './shared/lib/appearance.jsx'
import { LanguageBoundary, LanguageProvider, bootLanguage } from './shared/lib/i18n/I18nProvider.jsx'
import ProfileLanguage from './shared/lib/i18n/ProfileLanguage.jsx'
import AutoUpdate from './app/AutoUpdate.jsx'
import { markEnvironment } from './shared/lib/environment.js'
import { adoptBootLoader } from './shared/ui/useLoaderReveal.js'

// On the test site: "DEV · " tab title and the tagged favicon.
markEnvironment(document)

// Error boundaries: the themed one (crash / new version / offline screens)
// sits right inside Chakra, above the router and every provider, so an error
// anywhere in them still gets a branded screen. AutoUpdate stays outside it,
// so a crashed tab keeps picking up fixed deploys. The outer one only catches
// a failure of Chakra itself, with a plain unthemed fallback.
// index.html paints a loading screen into #root before this script arrives;
// React replaces it, and the app's first loader carries it on seamlessly.
// The first render waits for the language's strings (Greek is its own chunk),
// so a Greek device never flashes English; the loading screen covers it.
// LanguageBoundary remounts the app when the language changes;
// ProfileLanguage (outside it) applies the profile's language once signed in.
const root = document.getElementById('root')
adoptBootLoader(root)

bootLanguage().finally(() => ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary fallback={<RootFallback />}>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <ChakraProvider theme={theme}>
        <ErrorBoundary>
          <BrowserRouter>
            <AppearanceProvider>
              <LanguageProvider>
                <AuthProvider>
                  <ProfileProvider>
                    <ProfileLanguage />
                    <LanguageBoundary>
                      <App />
                    </LanguageBoundary>
                  </ProfileProvider>
                </AuthProvider>
              </LanguageProvider>
            </AppearanceProvider>
          </BrowserRouter>
        </ErrorBoundary>
        <AutoUpdate />
      </ChakraProvider>
    </ErrorBoundary>
  </React.StrictMode>,
))
