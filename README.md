# Continuum — frontend prototype

**Your work continues. Your agents change.**

An interactive frontend prototype for Continuum, a project-continuity layer for switching between AI coding agents.

> **Mock data only.** No agents, repositories, files, tests, or external APIs are connected. Handoffs are simulated: preparing one builds a text package you can copy. Nothing is sent anywhere.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | Purpose |
| --- | --- |
| `npm run build` | Type-check and production build |
| `npm run lint` | oxlint |
| `npm test` / `npm run test:coverage` | Vitest unit tests |
| `npm run test:e2e` | Playwright journeys, console-error and mobile-overflow checks |

## Structure

- `src/types`: domain model (projects, tasks, files, verification, activity, memory, handoffs)
- `src/data`: the single, centralized mock dataset (timestamps anchored to page load)
- `src/services`: the `ContinuumService` interface plus its mock implementation. Screens depend only on the interface, so a real backend can replace `mockContinuumService` in `src/services/index.ts`.
- `src/state`: preferences, handoff history (browser-local, behind `services/storage.ts`), toasts, dialogs
- `src/components`, `src/pages`: UI

## Routes

`/` landing · `/app` overview · `/app/projects` · `/app/projects/:projectId` · `/app/activity` · `/app/memory` · `/app/handoffs` · `/app/handoffs/:handoffId` · `/app/settings`
