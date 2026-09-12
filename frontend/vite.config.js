/* eslint-env node */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The service worker's API cache has to match whichever backend this build is
// pointed at, so the pattern is built from VITE_API_URL rather than a fixed
// host. With no value at all the API is same-origin ("/api"), which is how
// production is served.
//
// A relative VITE_API_URL ("/api") means the API is on the page's own origin.
// Workbox matches a same-origin request when the pattern matches anywhere in
// the URL, but a cross-origin one only when it matches from the start, so a
// bare "/api/" pattern reaches exactly the same-origin API and nothing else.
const apiCachePattern = (mode) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const api = env.VITE_API_URL || process.env.VITE_API_URL || '/api'
  if (api.startsWith('/')) return /\/api\/.*/i
  let origin
  try {
    origin = new URL(api).origin
  } catch {
    return /\/api\/.*/i
  }
  const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}/api/.*`, 'i')
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sieger MKT — Partnering Progress',
        short_name: 'Sieger MKT',
        description: 'Partnering Progress — marketing workflow & ticketing platform for Sieger teams',
        theme_color: '#9b2423',
        background_color: '#f3ece0',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Take over immediately on new deployments so users never run a stale build
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: apiCachePattern(mode),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    strictPort: true,
  },
}))
