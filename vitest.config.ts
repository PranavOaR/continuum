import { defineConfig } from 'vitest/config'

/**
 * Coverage across every workspace in one report: `npm run test:coverage`.
 * Each workspace still runs its own tests with `npm test`.
 *
 * The dashboard's components and pages are covered by the Playwright journeys
 * (apps/web/e2e), not unit tests, so only its logic is measured here.
 */
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/web'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/web/src/{services,state,utils}/**/*.ts'],
      exclude: ['**/__tests__/**', '**/*.test.ts', '**/testing.ts', 'apps/web/src/services/index.ts'],
      reporter: ['text-summary'],
      // A floor a little under today's numbers: coverage may rise, not quietly fall.
      thresholds: {
        'packages/*/src/**': { lines: 90, statements: 88, functions: 88, branches: 78 },
        'apps/web/src/{services,state,utils}/**': { lines: 80, statements: 80, functions: 70, branches: 65 },
      },
    },
  },
})
