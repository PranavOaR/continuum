# Continuum

**Your work continues. Your agents change.**

Continuum is local project memory for AI coding agents. Every Claude Code, Codex, Cursor or GitHub Copilot (VS Code) session starts briefed on where the work left off:
- the current task and its next step;
- which test results still hold for the code as it is now;
- what another agent or a hand edit changed;
- which decisions apply.

Every claim is labelled **verified**, **observed**, **agent-reported** or **set by you**. Nothing leaves your machine.

## Install

Requires Node.js 22.13+ and git, on macOS or Linux. Windows is not supported yet: use WSL 2.

```bash
cd your-project
npx getcontinuum setup claude-code   # or: setup codex, setup cursor, setup vscode
npx getcontinuum serve               # the dashboard for every connected repository
```

With Claude Code, you can install the plugin instead (hooks, MCP server and a `/continuum:handoff` command, in one step):

```
/plugin install continuum --marketplace PranavOaR/continuum-plugin
```

New here? [docs/getting-started.md](docs/getting-started.md) walks through a first handoff in about ten minutes. `continuum doctor` diagnoses any setup problem. [CHANGELOG.md](CHANGELOG.md) lists what is in each release.

[![Demo: Claude Code starts a task, Codex finishes it from Continuum's briefing, and the dashboard shows who did what. Recorded from real sessions.](https://continuumgroup.dev/demo/continuum-demo.jpg)](https://continuumgroup.dev/demo/continuum-demo.mp4)

*Watch the demo (77 s, with voiceover): Claude Code fixes one of two bugs and stops; Codex is briefed by Continuum, finishes the same task, and the dashboard shows who did what. Recorded from real sessions with the published package; voiceover by ElevenLabs.*

> **The dashboard shows live data only.** `continuum serve` shows your repositories ("Local workspace · Live"). The website, [continuumgroup.dev](https://continuumgroup.dev), is a landing page with no dashboard. `npm run dev` shows a labelled sample dataset, for developing the UI. Nothing is sent anywhere.

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
  - Decisions: `record_decision` saves decisions, known issues and next steps tied to specific files, or to one top-level function, class or constant as `path#name` (TypeScript, JavaScript and Python). A symbol anchor goes stale only when that symbol changes, not when anything else in its file does.

Restart Claude Code in that repository and approve the `continuum` server when prompted. Run from a checkout, both files point at it, so they are kept out of git. Installed from npm, setup writes `npx -y <package>@<version>` instead, and `.mcp.json` can be committed to share the server with your team. `npm run continuum -- handoff` prints the same briefing for pasting into any other agent or chat.

If something does not work, `continuum doctor` checks Node.js, git, the store, the hooks, the MCP server and whether Claude Code approved it, and prints the fix for each problem.

To remove Continuum, `setup claude-code --remove` takes out exactly what setup added. `continuum uninstall` does the same; `continuum uninstall --purge` also deletes `.continuum/` and leaves the repository as it was before setup.

## Briefing quality

```bash
npm run eval                     # does each briefing contain what a fresh agent needs? (free; runs in CI)
npm run eval -- --agent claude   # ask Claude Code the standard questions from the briefing alone (uses your account)
```

`scripts/eval/scenarios.ts` holds recorded histories (resuming after another agent and a hand edit, a project with no task, a task changed in the dashboard) and the questions a new session must answer: the current task, the next step, which checks can be trusted, what changed by hand, who set what. Briefing mode checks that each answer appears in its section in the expected words, and that no section makes a misleading claim (such as calling an out-of-date check passed); it must score 100%, and CI runs it. Claude mode scores real answers, including that misleading claims are absent. With Claude Code it scored 100% on all three scenarios after the first run surfaced a missing timestamp.

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
| `continuum uninstall [--purge]` | Disconnects every agent (Claude Code, Codex, Cursor, VS Code); `--purge` also deletes `.continuum/`. |

## Use with Codex

```bash
continuum setup codex
```

This writes project-scoped `.codex/hooks.json` and a marked block in `.codex/config.toml`, never `~/.codex`. Codex loads them once you **trust the project** when it asks; then run **`/hooks`** in Codex and trust Continuum's hooks.
- Each Codex session starts briefed on where the work left off (including what Claude or another agent did since).
- Its patches are recorded as changes, and its last message as an agent-reported note.
- It can use the same MCP tools (`start_task`, `update_task`, `get_context`, `record_decision`).

Codex does not report a shell command's exit code to hooks, so its test runs are not recorded as checks. Use `continuum run -- <command>` for verified results. `continuum setup codex --remove` and `continuum uninstall` take it out again.

## Use with GitHub Copilot in VS Code

```bash
continuum setup vscode
```

This connects Copilot's agent mode in VS Code with three project files, never your VS Code profile:
- `.vscode/mcp.json`: the `continuum` MCP server, started from the workspace folder.
- `.github/hooks/continuum.json`: agent hooks. Each chat starts briefed on where the work left off, and Copilot's file edits are recorded. VS Code runs a `PostToolUse` hook for every tool, so the hook checks the tool name in the shell and starts Continuum only for edits and task updates, in the background.
- `.github/instructions/continuum.instructions.md`: instructions for every chat, to keep the task current with `start_task` and `update_task`, and to call `get_handoff` if a chat did not start briefed.

Open the repository in VS Code, trust the workspace, and start the `continuum` server. Agent hooks are a preview in VS Code (1.109 or newer, with `chat.useHooks` on), and an organization can turn them off. VS Code reports neither a command's exit code nor the end of a session to hooks: Copilot's test runs are not recorded as checks (use `continuum run -- <command>`), and its sessions stay open. `continuum setup vscode --remove` and `continuum uninstall` take it out again.

## Use with Cursor

```bash
continuum setup cursor
```

This adds the `continuum` MCP server to `.cursor/mcp.json` and an always-applied rule, `.cursor/rules/continuum.mdc`. Enable the server in Cursor's Settings → MCP. The rule asks Cursor's agent to:
- read `get_handoff` at the start;
- keep the task current with `start_task` and `update_task`;
- record decisions with `record_decision`.

Cursor has no hooks Continuum uses, so to capture its edits, run `continuum session start --agent cursor` and `continuum start` (see below).

## Use with an agent that has no hooks

Cursor, a chat or any other agent can still leave a trail:

```bash
continuum session start --agent cursor  # prints a briefing to paste in, including what changed since its last session
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

## License and the public plugin repository

Continuum is proprietary: free to use, not open source (see [LICENSE](LICENSE); versions up to 0.1.2 were MIT). The npm package carries a user-facing README (`scripts/release/README.md`), the CHANGELOG, the license, and `THIRD_PARTY_NOTICES.md`, which `npm run bundle` writes from the packages actually bundled into the CLI and the dashboard.

The Claude Code plugin is installed from a separate public repository, [PranavOaR/continuum-plugin](https://github.com/PranavOaR/continuum-plugin), which holds no source code and hosts issues. After `npm run plugin`, update it with `node scripts/sync-plugin-repo.mjs <checkout of continuum-plugin>`, then commit and push there.

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
| `apps/web` | `@continuum/web` | The dashboard (live data from the daemon, or a sample dataset in development) and the website, built with `VITE_CONTINUUM_SITE=website` |

Upcoming pieces (symbol-level retrieval, a one-step plugin install once Continuum is on npm) are described in [`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

Inside `apps/web/src`: `data/` holds the mock dataset, `services/` the mock and HTTP services, `state/` data mode, preferences and handoff history, and `components/` + `pages/` the UI.

## Design

- **Type:** Geist for UI and display (regular-weight headings, tight tracking), Geist Mono for labels and technical identifiers.
- **Palette:** warm paper canvas, ink text, and a single iris accent (`#5B45FF`). Colour signals state, never decoration.
- **Motif:** the *continuity thread*, a short accent line and node on a surface's top edge, echoed in the logo and the landing page.
- **Motion:** the landing page's activity-flow diagram (`apps/web/src/components/landing/ActivityFlow.tsx`) is pure SVG/SMIL on one shared 10s cycle. It pauses off-screen, has a pause control, and renders a static final frame when reduced motion is requested.

## Routes

`/` landing · `/app` overview · `/app/projects` · `/app/projects/:projectId` · `/app/activity` · `/app/memory` · `/app/handoffs` · `/app/handoffs/:handoffId` · `/app/settings`
