import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { siteHead } from './siteHead.ts'
import { thirdPartyPackages } from './thirdPartyPackages.ts'

// During development, CONTINUUM_API=<the link printed by `continuum serve`> points the app at that daemon.
// The link's access token is sent as a bearer token, since the daemon's cookie belongs to its own origin.
const apiLink = process.env.CONTINUUM_API ? new URL(process.env.CONTINUUM_API) : null
const api = apiLink?.origin
const apiToken = apiLink?.searchParams.get('token') ?? ''

// VITE_CONTINUUM_SITE=website builds continuumgroup.dev: the website alone, with no dashboard or demo data,
// its own public files (site-public/: the demo video, share image, robots.txt) and its share and search tags.
const isWebsite = process.env.VITE_CONTINUUM_SITE === 'website'
const entry = isWebsite ? './src/site/mountSite.tsx' : './src/app/mountApp.tsx'

// https://vite.dev/config/
export default defineConfig({
  // The dashboard ships in the npm package, which carries the licenses of what it bundles.
  plugins: [react(), tailwindcss(), ...(isWebsite ? [siteHead()] : [thirdPartyPackages()])],
  publicDir: isWebsite ? 'site-public' : 'public',
  resolve: { alias: { '@entry': fileURLToPath(new URL(entry, import.meta.url)) } },
  server: api
    ? {
        proxy: {
          '/api': {
            target: api,
            changeOrigin: true,
            // The daemon only trusts its own origin; the proxy request is same-machine by construction.
            configure: (proxy) =>
              proxy.on('proxyReq', (request) => {
                request.removeHeader('origin')
                if (apiToken) request.setHeader('authorization', `Bearer ${apiToken}`)
              }),
          },
        },
      }
    : undefined,
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
