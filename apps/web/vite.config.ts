import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// During development, CONTINUUM_API=<the link printed by `continuum serve`> points the app at that daemon.
// The link's access token is sent as a bearer token, since the daemon's cookie belongs to its own origin.
const apiLink = process.env.CONTINUUM_API ? new URL(process.env.CONTINUUM_API) : null
const api = apiLink?.origin
const apiToken = apiLink?.searchParams.get('token') ?? ''

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/services/**', 'src/state/handoffStore.ts', 'src/data/**'],
      exclude: ['**/*.test.ts', 'src/services/index.ts'],
    },
  },
})
