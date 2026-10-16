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

## Design

- **Type:** Geist for UI and display (regular-weight headings, tight tracking), Geist Mono for labels and technical identifiers.
- **Palette:** warm paper canvas, ink text, and a single iris accent (`#5B45FF`). Colour signals state, never decoration.
- **Motif:** the *continuity thread*, a short accent line and node on a surface's top edge, echoed in the logo and the landing page.
- **Motion:** the landing page's activity-flow diagram (`src/components/landing/ActivityFlow.tsx`) is pure SVG/SMIL on one shared 10s cycle. It pauses off-screen, has a pause control, and renders a static final frame when reduced motion is requested.

## Routes

`/` landing · `/app` overview · `/app/projects` · `/app/projects/:projectId` · `/app/activity` · `/app/memory` · `/app/handoffs` · `/app/handoffs/:handoffId` · `/app/settings`
