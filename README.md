# Continuum

**Your work continues. Your agents change.**

Continuum is local project memory for AI coding agents. Every Claude Code, Codex, Cursor or GitHub Copilot (VS Code) session starts briefed on where the work left off:
- the current task and its next step;
- which test results still hold for the code as it is now;
- what another agent or a hand edit changed;
- which decisions apply.

Every claim is labelled **verified**, **observed**, **agent-reported** or **set by you**. Nothing leaves your machine.

This README is for working on Continuum. **Using it?** Start at [continuumgroup.dev/docs](https://continuumgroup.dev/docs) (sources in `apps/web/src/site/docs/`), or the package's own README (`scripts/release/README.md`):

```bash
npx getcontinuum setup claude-code   # or: setup codex, setup cursor, setup vscode
npx getcontinuum serve               # the dashboard for every connected repository
```

Requires Node.js 22.13+ and git, on macOS or Linux. Windows is not supported yet: use WSL 2. [CHANGELOG.md](CHANGELOG.md) lists what is in each release.

[![Demo: Claude Code starts a task, Codex finishes it from Continuum's briefing, and the dashboard shows who did what. Recorded from real sessions.](https://continuumgroup.dev/demo/continuum-demo.jpg)](https://continuumgroup.dev/demo/continuum-demo.mp4)

## Develop

```bash
npm install
npm run dev        # the dashboard on http://localhost:5173, with a labelled sample dataset
```

| Script (run from the repo root) | Purpose |
| --- | --- |
| `npm run build` | Type-check and production build of the web app |
| `npm run lint` | oxlint |
| `npm run typecheck` | Type-check every workspace |
| `npm test` | Unit tests in every workspace |
| `npm run test:coverage` | The same tests in one run, failing below the coverage floors in `vitest.config.ts` |
| `npm run test:e2e` | Playwright journeys, axe, console-error and mobile-overflow checks |
| `npm run eval` | Does each briefing hold what a fresh agent needs? (see below) |
| `npm run check:website` | Loads the built website in Chromium |

CI runs all of these on every pull request, plus the release smoke test on macOS and Linux with Node 22.13 and 24. `main` is kept releasable: work happens on feature branches.

### The CLI from this checkout

`npm run continuum --` runs the CLI through `tsx`. Point it at any repository with `-C`:

```bash
npm run continuum -- -C ~/code/my-app setup claude-code
npm run continuum -- -C ~/code/my-app run --name tests -- npm test
npm run continuum -- -C ~/code/my-app status
npm run continuum -- serve                      # every repository connected with setup
```

Setup run from a checkout writes absolute paths to it, so its files are kept out of git. Installed from npm, setup writes `npx -y getcontinuum@<version>` instead, and `.mcp.json` can be committed.

To work on the UI against live data, run `continuum serve`, then `CONTINUUM_API='<the printed link>' VITE_CONTINUUM_DATA=local npm run dev`. The dev server forwards `/api` to the daemon with the link's token.

### Briefing quality

```bash
npm run eval                     # free; CI requires 100%
npm run eval -- --agent claude   # asks Claude Code the standard questions from the briefing alone (uses your account)
```

`scripts/eval/scenarios.ts` holds recorded histories (resuming after another agent and a hand edit, a project with no task, a task changed in the dashboard) and the questions a new session must answer: the current task, the next step, which checks can be trusted, what changed by hand, who set what. Briefing mode checks that each answer appears in its section, and that no section makes a misleading claim, such as calling an out-of-date check passed.

## Release

```bash
npm run build && npm run bundle    # dist/release: one minified ESM file plus the dashboard, about 1 MB
npm run smoke:release              # packs, installs and drives the real binary in a scratch repo
```

[`scripts/release/README.md`](scripts/release/README.md) is the package's README. Pushing a `v*` tag publishes to npm (`.github/workflows/release.yml`); the tag must match `packages/cli/package.json` and have a dated CHANGELOG section. `CONTINUUM_PACKAGE_NAME` sets the npm name stamped into the bundle.

The store records its schema version. Migrations apply forward on open, and a store written by a newer Continuum is refused rather than changed.

### The Claude Code plugin

`npm run plugin` writes `plugin/` from the same hooks and MCP server that `setup claude-code` writes. Users install it from a separate public repository, [PranavOaR/continuum-plugin](https://github.com/PranavOaR/continuum-plugin), which also hosts issues. It holds no source code, only the plugin and a copy of the release bundle, which its hooks run with `node` (`npx` would add about half a second to each hook). After a release:

```bash
npm run build && npm run bundle && npm run plugin
node scripts/sync-plugin-repo.mjs <checkout of continuum-plugin>   # then commit and push there
```

## Structure

npm workspaces:

| Path | Package | Contents |
| --- | --- | --- |
| `packages/core` | `@continuum/core` | Domain types, event schema, evidence rules, the `ContinuumService` contract and the handoff builder, shared by every other package |
| `packages/store` | `@continuum/store` | The local context store: content-addressed objects, an identity hash map of graph nodes, typed edges, and the append-only event log they are projected from (SQLite) |
| `packages/capture` | `@continuum/capture` | Git working-tree hashing, change scanning, the file watcher, symbols and verified check runs |
| `packages/context` | `@continuum/context` | Project state judged against the live working tree, ranked retrieval and the token-bounded handoff |
| `packages/claude-code` | `@continuum/claude-code` | Hook ingestion and project-scoped setup for Claude Code, Codex, Cursor and VS Code, and the plugin's hooks |
| `packages/mcp` | `@continuum/mcp` | The local stdio MCP server (`get_handoff`, `get_project_state`, `get_context`, `record_decision`, `start_task`, `update_task`) |
| `packages/daemon` | `@continuum/daemon` | The local daemon: maps context stores onto the dashboard's service contract and serves it on 127.0.0.1 |
| `packages/cli` | `@continuum/cli` | The `continuum` command |
| `apps/web` | `@continuum/web` | The dashboard (live data from the daemon, or a sample dataset in development) and the website, built with `VITE_CONTINUUM_SITE=website` |

Inside `apps/web/src`: `data/` holds the sample dataset, `services/` the sample and HTTP services, `state/` data mode, preferences and handoff history, `site/` the website and its docs, and `components/` + `pages/` the UI.

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains how agents connect and how the store works; [`docs/ROADMAP.md`](docs/ROADMAP.md) lists what shipped and what is next.

### The dashboard's security

`serve` listens on 127.0.0.1 only and accepts requests only from its own origin (Host and Origin are checked, which blocks DNS rebinding). Every request needs the access token from the printed link, which changes on every run. The link swaps it for an HttpOnly, SameSite=Strict cookie, and writes made with that cookie also need a per-run CSRF token.

## Design

- **Type:** Geist for UI and display (regular-weight headings, tight tracking), Geist Mono for labels and technical identifiers.
- **Palette:** warm paper canvas, ink text, and a single iris accent (`#5B45FF`). Colour signals state, never decoration.
- **Motif:** the *continuity thread*, a short accent line and node on a surface's top edge, echoed in the logo and the landing page.
- **Motion:** the landing page's activity-flow diagram (`apps/web/src/components/landing/ActivityFlow.tsx`) is pure SVG/SMIL on one shared 10s cycle. It pauses off-screen, has a pause control, and renders a static final frame when reduced motion is requested.

Routes: `/` landing · `/app` overview · `/app/projects` · `/app/projects/:projectId` · `/app/activity` · `/app/memory` · `/app/handoffs` · `/app/handoffs/:handoffId` · `/app/settings`

## License

Continuum is proprietary: free to use, not open source (see [LICENSE](LICENSE); versions up to 0.1.2 were MIT). `npm run bundle` writes `THIRD_PARTY_NOTICES.md` from the packages actually bundled into the CLI and the dashboard.
