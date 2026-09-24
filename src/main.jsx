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
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App.jsx'
import ErrorBoundary from './app/ErrorBoundary.jsx'
import RootFallback from './app/RootFallback.jsx'
import theme from './app/theme.js'
import { AuthProvider } from './shared/auth/AuthProvider.jsx'
import { ProfileProvider } from './shared/lib/ProfileProvider.jsx'
import { AppearanceProvider } from './shared/lib/appearance.jsx'
import AutoUpdate from './app/AutoUpdate.jsx'
import { markEnvironment } from './shared/lib/environment.js'

// On the test site: "DEV · " tab title and the tagged favicon.
markEnvironment(document)

// Error boundaries: the themed one (crash / new version / offline screens)
// sits right inside Chakra, above the router and every provider, so an error
// anywhere in them still gets a branded screen. AutoUpdate stays outside it,
// so a crashed tab keeps picking up fixed deploys. The outer one only catches
// a failure of Chakra itself, with a plain unthemed fallback.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary fallback={<RootFallback />}>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <ChakraProvider theme={theme}>
        <ErrorBoundary>
          <BrowserRouter>
            <AppearanceProvider>
              <AuthProvider>
                <ProfileProvider>
                  <App />
                </ProfileProvider>
              </AuthProvider>
            </AppearanceProvider>
          </BrowserRouter>
        </ErrorBoundary>
        <AutoUpdate />
      </ChakraProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
