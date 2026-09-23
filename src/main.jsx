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
import theme from './app/theme.js'
import { AuthProvider } from './shared/auth/AuthProvider.jsx'
import { ProfileProvider } from './shared/lib/ProfileProvider.jsx'
import { AppearanceProvider } from './shared/lib/appearance.jsx'
import AutoUpdate from './app/AutoUpdate.jsx'
import { markEnvironment } from './shared/lib/environment.js'

// On the test site: "DEV · " tab title and the tagged favicon.
markEnvironment(document)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ColorModeScript initialColorMode={theme.config.initialColorMode} />
    <ChakraProvider theme={theme}>
      <BrowserRouter>
        <AppearanceProvider>
          <AuthProvider>
            <ProfileProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </ProfileProvider>
          </AuthProvider>
        </AppearanceProvider>
      </BrowserRouter>
      <AutoUpdate />
    </ChakraProvider>
  </React.StrictMode>,
)
