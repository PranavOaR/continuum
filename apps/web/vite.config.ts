import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// During development, CONTINUUM_API=http://127.0.0.1:4747 points the app at a running `continuum serve`.
const api = process.env.CONTINUUM_API

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
            configure: (proxy) => proxy.on('proxyReq', (request) => request.removeHeader('origin')),
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
