import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Custom worker (src/sw.js): generateSW can't add push handlers, so the
      // precache/fallback/runtime-caching setup lives there alongside the
      // payment-reminder push + notificationclick listeners.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Budgeer',
        short_name: 'Budgeer',
        description: 'Track spending, budgets, and income — and split with friends.',
        theme_color: '#f95d38',
        background_color: '#faf8f4',
        display: 'standalone',
        start_url: '/',
        icons: [
          // SVG icon scales to any size; used by Chromium/Android installs.
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})
