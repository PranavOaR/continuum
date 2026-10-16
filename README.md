# Continuum

**Your work continues. Your agents change.**

Continuum is a local-first project-continuity layer for switching between AI coding agents. It is early: the repository capture engine and CLI work against real git repositories, while the web app is still an interactive prototype.

> **The web app uses mock data only.** No agents, repositories, files, tests, or external APIs are connected to it yet. Handoffs there are simulated: preparing one builds a text package you can copy. Nothing is sent anywhere.

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

## Try the CLI (early)

The `continuum` command records what happens in a git repository into a local store at `.continuum/` (kept out of git through `.git/info/exclude`). Requires Node 22.5+ and git. Until it is published to npm, run it from this checkout and point it at any repository with `-C`:

```bash
npm run continuum -- -C ~/code/my-app init      # set up and record the current files
npm run continuum -- -C ~/code/my-app start     # watch and record changes until Ctrl-C
npm run continuum -- -C ~/code/my-app run --name tests -- npm test
npm run continuum -- -C ~/code/my-app status
```

`run` records the result as *verified* evidence tied to the exact content hash of every file it ran against, and passes the command's exit code through. Edit a covered file afterwards and `status` reports the result as out of date, naming what changed. Nothing leaves your machine.

Known limits: the last 4,000 characters of a check's output are stored as-is (redaction comes later), and nothing is captured from agents yet. That is the next milestone.

## Structure

npm workspaces:

| Path | Package | Contents |
| --- | --- | --- |
| `packages/core` | `@continuum/core` | Domain types, event schema, evidence rules, the `ContinuumService` contract and the handoff builder, shared by every other package |
| `packages/store` | `@continuum/store` | The local context store: content-addressed objects, an identity hash map of graph nodes, typed edges, and the append-only event log they are projected from (SQLite) |
| `packages/capture` | `@continuum/capture` | Git working-tree hashing, change scanning, the file watcher and verified check runs |
| `packages/cli` | `@continuum/cli` | The `continuum` command |
| `apps/web` | `@continuum/web` | The web app: landing page and dashboard, currently backed by mock data through `mockContinuumService` |

Upcoming pieces (Claude Code integration over MCP and hooks, the local daemon that will feed the web app) are described in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

Inside `apps/web/src`: `data/` holds the mock dataset, `services/` the mock service, `state/` preferences and handoff history, and `components/` + `pages/` the UI.

## Design

- **Type:** Geist for UI and display (regular-weight headings, tight tracking), Geist Mono for labels and technical identifiers.
- **Palette:** warm paper canvas, ink text, and a single iris accent (`#5B45FF`). Colour signals state, never decoration.
- **Motif:** the *continuity thread*, a short accent line and node on a surface's top edge, echoed in the logo and the landing page.
- **Motion:** the landing page's activity-flow diagram (`apps/web/src/components/landing/ActivityFlow.tsx`) is pure SVG/SMIL on one shared 10s cycle. It pauses off-screen, has a pause control, and renders a static final frame when reduced motion is requested.

## Routes

`/` landing · `/app` overview · `/app/projects` · `/app/projects/:projectId` · `/app/activity` · `/app/memory` · `/app/handoffs` · `/app/handoffs/:handoffId` · `/app/settings`
