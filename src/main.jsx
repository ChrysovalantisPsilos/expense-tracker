import React from 'react'
import ReactDOM from 'react-dom/client'
// Self-hosted fonts (bundled + precached by the PWA, so they work offline).
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '@fontsource/nunito-sans/400.css'
import '@fontsource/nunito-sans/600.css'
import '@fontsource/nunito-sans/700.css'
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App.jsx'
import ErrorBoundary from './app/ErrorBoundary.jsx'
import theme from './app/theme.js'
import { AuthProvider } from './shared/auth/AuthProvider.jsx'
import { AppearanceProvider } from './shared/lib/appearance.jsx'
import ReloadPrompt from './app/ReloadPrompt.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ColorModeScript initialColorMode={theme.config.initialColorMode} />
    <ChakraProvider theme={theme}>
      <BrowserRouter>
        <AppearanceProvider>
          <AuthProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </AuthProvider>
        </AppearanceProvider>
      </BrowserRouter>
      <ReloadPrompt />
    </ChakraProvider>
  </React.StrictMode>,
)
