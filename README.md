# Continuum — frontend prototype

**Your work continues. Your agents change.**

An interactive frontend prototype for Continuum, a project-continuity layer for switching between AI coding agents.

> **Mock data only.** No agents, repositories, files, tests, or external APIs are connected. Handoffs are simulated: preparing one builds a text package you can copy. Nothing is sent anywhere.

## Run

```bash
npm install
npm run dev        # web app on http://localhost:5173
```

| Script (run from the repo root) | Purpose |
| --- | --- |
| `npm run build` | Type-check and production build of the web app |
| `npm run lint` | oxlint |
| `npm run typecheck` | Type-check every workspace |
| `npm test` | Unit tests in every workspace |
| `npm run test:e2e` | Playwright journeys, console-error and mobile-overflow checks |

CI runs all of the above on every pull request. `main` is kept releasable: work happens on feature branches.

## Structure

npm workspaces:

| Path | Package | Contents |
| --- | --- | --- |
| `packages/core` | `@continuum/core` | Domain types, the `ContinuumService` contract, agents, labels and the handoff builder, shared by every other package |
| `apps/web` | `@continuum/web` | The web app: landing page and dashboard, currently backed by mock data through `mockContinuumService` |

Upcoming packages (context store, watchers, daemon, CLI, MCP server) are described in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

Inside `apps/web/src`: `data/` holds the mock dataset, `services/` the mock service, `state/` preferences and handoff history, and `components/` + `pages/` the UI.

## Design

- **Type:** Geist for UI and display (regular-weight headings, tight tracking), Geist Mono for labels and technical identifiers.
- **Palette:** warm paper canvas, ink text, and a single iris accent (`#5B45FF`). Colour signals state, never decoration.
- **Motif:** the *continuity thread*, a short accent line and node on a surface's top edge, echoed in the logo and the landing page.
- **Motion:** the landing page's activity-flow diagram (`apps/web/src/components/landing/ActivityFlow.tsx`) is pure SVG/SMIL on one shared 10s cycle. It pauses off-screen, has a pause control, and renders a static final frame when reduced motion is requested.

## Routes

`/` landing · `/app` overview · `/app/projects` · `/app/projects/:projectId` · `/app/activity` · `/app/memory` · `/app/handoffs` · `/app/handoffs/:handoffId` · `/app/settings`
