import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { OCR_ASSET_DIR } from './src/shared/lib/receiptScan.js'

// Receipt OCR engine, served from our own origin instead of Tesseract's
// jsDelivr defaults: the worker, both LSTM cores (Tesseract picks SIMD or not
// per device) and the English + Greek LSTM data (best_int: ~2.9 MB + ~1.3 MB,
// fetched only when someone scans, then cached by Tesseract in IndexedDB).
// Keys are paths under OCR_ASSET_DIR, matching ocrPaths() in receiptScan.js.
const require = createRequire(import.meta.url)
const OCR_FILES = {
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  'core/tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'core/tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'lang/eng.traineddata.gz': '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  'lang/ell.traineddata.gz': '@tesseract.js-data/ell/4.0.0_best_int/ell.traineddata.gz',
}

// Copies OCR_FILES into the build and serves them in dev.
function selfHostedOcr() {
  const files = Object.entries(OCR_FILES)
    .map(([to, from]) => [`/${OCR_ASSET_DIR}/${to}`, require.resolve(from)])
  return {
    name: 'self-hosted-ocr',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const hit = files.find(([url]) => url === req.url?.split('?')[0])
        if (!hit) return next()
        res.setHeader('Content-Type', hit[0].endsWith('.js') ? 'text/javascript' : 'application/gzip')
        res.end(readFileSync(hit[1]))
      })
    },
    generateBundle() {
      for (const [url, from] of files) {
        this.emitFile({ type: 'asset', fileName: url.slice(1), source: readFileSync(from) })
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    selfHostedOcr(),
    VitePWA({
      // Custom worker (src/sw.js): generateSW can't add push handlers, so the
      // precache/fallback/runtime-caching setup lives there alongside the
      // payment-reminder push + notificationclick listeners.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      // iOS ignores SVG touch icons, so the home-screen icon is a 180px PNG.
      includeAssets: ['budgeer-mark.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Budgeer',
        short_name: 'Budgeer',
        description: 'Track spending, budgets, and income — and split with friends.',
        theme_color: '#f95d38',
        background_color: '#faf8f4',
        display: 'standalone',
        start_url: '/',
        // PNGs are rendered from pwa-icon.svg (full-bleed cream, artwork inside
        // the maskable safe zone, so one 512 serves both purposes). Installers
        // that need raster sizes (Android splash, older Chromium) use the
        // PNGs; the SVG covers everything else.
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Social-preview card is only fetched by link scrapers, the email logo
        // only by mail clients, and the OCR
        // engine (~7 MB) only when someone scans — don't ship either to every
        // installed client's precache.
        // The xlsx parser worker (~500 KB) is only needed when importing a file.
        // The FAQ's how-to clips and posters (public/faq-media/) load only when an
        // answer is opened, online.
        globIgnores: ['og-image.png', 'email-mark.png', `${OCR_ASSET_DIR}/**`, 'assets/sheetWorker-*.js', 'faq-media/**'],
      },
    }),
  ],
})
