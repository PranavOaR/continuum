# Continuum

**Your work continues. Your agents change.**

Continuum is a local-first project-continuity layer for switching between AI coding agents. It is early: the repository capture engine and CLI work against real git repositories, while the web app is still an interactive prototype.

> **Two modes, always labelled.** Served by `continuum serve`, the web app shows live data from your repositories ("Local workspace · Live"). Anywhere else, such as `npm run dev` or a static host, it shows a mock demo dataset ("Demo workspace · Mock data"). Nothing is sent anywhere in either mode.

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

The `continuum` command records what happens in a git repository into a local store at `.continuum/` (kept out of git through `.git/info/exclude`). Requires Node 22.13+ and git. Until it is published to npm, run it from this checkout and point it at any repository with `-C`:

```bash
npm run continuum -- -C ~/code/my-app init      # set up and record the current files
npm run continuum -- -C ~/code/my-app start     # watch and record changes until Ctrl-C
npm run continuum -- -C ~/code/my-app run --name tests -- npm test
npm run continuum -- -C ~/code/my-app status
```

`run` records the result as *verified* evidence tied to the exact content hash of every file it ran against, and passes the command's exit code through. Edit a covered file afterwards and `status` reports the result as out of date, naming what changed. Nothing leaves your machine.

Known limits: redaction of stored commands and output is best effort, and a check stores the hash of every tracked file it ran against.

## Use with Claude Code

One command connects Claude Code to Continuum for a single repository:

```bash
npm run continuum -- -C ~/code/my-app setup claude-code
```

It writes two project-scoped files and nothing in `~/.claude`:

- `.claude/settings.local.json`: hooks that record each session, the files Claude edits, and Claude's last message in each turn. At session start, the hook briefs Claude on where the previous session left off.
- `.mcp.json`: the `continuum` MCP server.
  - Reading: `get_handoff`, `get_project_state`, and `get_context`. `get_context` ranks recorded context for a task by its graph links, evidence, recency and whether it needs action (a failing check, a stale decision), then cuts it to a token budget, showing each item's score and why.
  - Tasks: `start_task` and `update_task` record what Claude is working on (objective, acceptance criteria, steps and next action), and edits are attributed to the current task.
  - Decisions: `record_decision` saves decisions, known issues and next steps tied to specific files.

Restart Claude Code in that repository and approve the `continuum` server when prompted. Run from a checkout, both files point at it, so they are kept out of git. Installed from npm, setup writes `npx -y <package>@<version>` instead, and `.mcp.json` can be committed to share the server with your team. `npm run continuum -- handoff` prints the same briefing for pasting into any other agent or chat.

If something does not work, `continuum doctor` checks Node.js, git, the store, the hooks, the MCP server and whether Claude Code approved it, and prints the fix for each problem.

To remove Continuum, `setup claude-code --remove` takes out exactly what setup added. `continuum uninstall` does the same; `continuum uninstall --purge` also deletes `.continuum/` and leaves the repository as it was before setup.

## Release package

```bash
npm run build && npm run bundle    # dist/release: one ESM file plus the dashboard, about 1 MB
npm run smoke:release              # packs, installs and drives the real binary in a scratch repo
```

`continuum compact` folds events older than 30 days (`--keep-days <n>`) into a gzipped checkpoint of the graph and removes them from the log. Tasks, checks and decisions are unchanged; older activity leaves the feed. On a simulated 100-session history of a 2,000-file repository, the store went from 3.5 MB to 1.4 MB.

`CONTINUUM_PACKAGE_NAME` sets the npm name stamped into the bundle. The store records its schema version; migrations apply forward on open, and a store written by a newer Continuum is refused rather than changed.

## What gets recorded, and how to control it

With Claude Code connected, Continuum records:
- sessions and the files Claude edits;
- its last message in each turn, labelled agent-reported;
- tasks, through the MCP tools;
- commits;
- test, lint, typecheck and build commands Claude runs through Bash. These are labelled **observed (run by an agent)**, weaker than `continuum run`'s **verified**. Commands whose exit code is hidden by a pipe, `;` or `||` are skipped.

Handoffs separately list **changes no agent session made**, so the next agent asks about them instead of assuming.

| Control | What it does |
|---|---|
| `continuum config` | Shows settings. `continuum config agent-checks off` stops recording agent-run checks. `continuum config prompts on` records what you type to agents, redacted, with pasted blocks dropped. It is off by default. |
| `.continuumignore` | Gitignore-syntax paths, tracked or not, that are never hashed, recorded, diffed or put in a handoff. |
| `redactPatterns` in `.continuum/config.json` | Extra regular expressions to mask, on top of built-in rules for common token formats and long random-looking strings. |
| `continuum forget --path <p> \| --session <id> \| --before <date>` | Permanently removes recorded data. The database is rewritten and vacuumed, so the text is gone from the file itself. |
| `continuum export <file>` / `continuum import <file>` | Moves the whole history between clones or machines as JSON, readable only by you. |
| `continuum compact` | Folds events older than 30 days into a checkpoint. |
| `continuum uninstall [--purge]` | Disconnects Claude Code; `--purge` also deletes `.continuum/`. |

## Use with an agent that has no hooks

Codex, Cursor or a chat can still leave a trail:

```bash
continuum session start --agent codex   # prints a briefing to paste in, including what changed since its last session
continuum start                         # in another terminal: file changes are attributed to the open session
continuum session note "Parser done; tests next"
continuum session end --summary "Parser rewritten, tests pass"
```

While a session is open, `continuum start`, `scan` and `run` attribute file changes to it. Changes made before it started are not credited to it. Notes and summaries are labelled agent-reported, like an agent's own messages.

## Dashboard

```bash
npm run build                                          # once, and after pulling changes
npm run continuum -- serve ~/code/my-app ~/code/api    # prints http://127.0.0.1:4747/app?token=…
npm run continuum -- serve                             # every repository connected with `setup`
```

`serve` opens a dashboard for one or more initialized repositories:
- what changed and which agent changed it;
- where the last session left off;
- checks, with whether they still cover the current code;
- recorded decisions, and the context graph.

It listens on 127.0.0.1 only and accepts requests only from its own origin. It also requires the access token in the printed link, which changes on every run, so other users on the machine cannot read it. *Prepare handoff* shows the exact briefing a new agent session receives. Some data is not captured yet, such as line-level diffs. Screens say so rather than showing placeholders.

To work on the UI against live data, run `continuum serve`, then `CONTINUUM_API='<the printed link>' VITE_CONTINUUM_DATA=local npm run dev`. The dev server forwards `/api` to the daemon with the link's token.

Every item in a handoff is labelled with its evidence:

- **verified:** a check run recorded against exact file hashes.
- **observed:** captured from git, the file watcher or a hook.
- **agent-reported:** something an agent said. It is a note, not a fact.

A recorded check whose files have since changed is reported as out of date, along with the files that changed.

## Structure

npm workspaces:

| Path | Package | Contents |
| --- | --- | --- |
| `packages/core` | `@continuum/core` | Domain types, event schema, evidence rules, the `ContinuumService` contract and the handoff builder, shared by every other package |
| `packages/store` | `@continuum/store` | The local context store: content-addressed objects, an identity hash map of graph nodes, typed edges, and the append-only event log they are projected from (SQLite) |
| `packages/capture` | `@continuum/capture` | Git working-tree hashing, change scanning, the file watcher and verified check runs |
| `packages/context` | `@continuum/context` | Project state judged against the live working tree, and the token-bounded handoff |
| `packages/claude-code` | `@continuum/claude-code` | Claude Code hook ingestion and project-scoped setup |
| `packages/mcp` | `@continuum/mcp` | The local stdio MCP server (`get_handoff`, `get_project_state`, `record_decision`, `start_task`, `update_task`) |
| `packages/daemon` | `@continuum/daemon` | The local daemon: maps context stores onto the dashboard's service contract and serves it on 127.0.0.1 |
| `packages/cli` | `@continuum/cli` | The `continuum` command |
| `apps/web` | `@continuum/web` | The web app: landing page and dashboard, reading live data from the daemon or the mock demo dataset |

Upcoming pieces (symbol-level retrieval, a one-step plugin install once Continuum is on npm) are described in [`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

Inside `apps/web/src`: `data/` holds the mock dataset, `services/` the mock and HTTP services, `state/` data mode, preferences and handoff history, and `components/` + `pages/` the UI.

## Design

- **Type:** Geist for UI and display (regular-weight headings, tight tracking), Geist Mono for labels and technical identifiers.
- **Palette:** warm paper canvas, ink text, and a single iris accent (`#5B45FF`). Colour signals state, never decoration.
- **Motif:** the *continuity thread*, a short accent line and node on a surface's top edge, echoed in the logo and the landing page.
- **Motion:** the landing page's activity-flow diagram (`apps/web/src/components/landing/ActivityFlow.tsx`) is pure SVG/SMIL on one shared 10s cycle. It pauses off-screen, has a pause control, and renders a static final frame when reduced motion is requested.

## Routes

`/` landing · `/app` overview · `/app/projects` · `/app/projects/:projectId` · `/app/activity` · `/app/memory` · `/app/handoffs` · `/app/handoffs/:handoffId` · `/app/settings`
