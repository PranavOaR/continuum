# Continuum roadmap

Status, 4 November 2026, at the 0.3.0 release. Continuum is published on npm as `getcontinuum` and as a Claude Code plugin. It connects Claude Code, Codex, Cursor and GitHub Copilot in VS Code. The October 2026 plan has shipped, and so has the first phase of the November plan: a new user's first hour. [Next](#next) lists the phases still to come.

## Guiding principles

1. **Honest evidence.** Every claim is verified, observed, agent-reported or set by you, and the UI never blurs them.
2. **Local-first.** Nothing leaves the machine, and there are no external AI APIs.
3. **Never disturb the agent.** Hooks must never block, slow down or break a session.
4. **Feature branches, atomic commits, CI green, code review before merge.**

---

## Shipped

| Area | What shipped |
|---|---|
| **Install** | A single minified ESM bundle (about 900 KB) with the dashboard, on npm as `getcontinuum`. `setup` writes `npx -y getcontinuum@<version>`, so `.mcp.json` can be shared. A Claude Code plugin from [PranavOaR/continuum-plugin](https://github.com/PranavOaR/continuum-plugin), whose hooks run their own copy of the bundle with `node` (about 0.1 s, against 0.5 s through `npx`). `doctor`, which also reports hooks that never arrive or fail, `uninstall [--purge]`, forward-only schema migrations, and CI on macOS and Linux with Node 22.13 and 24. |
| **Scale** | Clean files' hashes come from the git index, and only dirty or untracked files are hashed. Checks store content-addressed coverage manifests. `compact` folds old events into a checkpoint. The watcher falls back to polling when the OS runs out of watches. The dashboard updates over Server-Sent Events. |
| **Capture** | Line counts and uncommitted diffs per file. Claude Code's own test, lint and build runs, with exit codes (observed). Commits. A current task per session. Opt-in prompt capture. Changes no agent session made are listed separately. |
| **Briefings** | Decisions anchored to a symbol (`path#name`, TypeScript, JavaScript and Python), which go stale only when that symbol changes. `get_context` ranks context for a task within a token budget. "Since you left" opens a resumed session. An evaluation harness (`npm run eval`) that CI requires to score 100%. |
| **Agents** | `setup claude-code`, `setup codex`, `setup cursor` and `setup vscode` (Copilot agent mode). `continuum session` for agents without hooks. A cross-agent test (`npm run test:cross-agent`). Agents that report no exit codes are asked to run checks through `continuum run`. |
| **Privacy** | `forget` (rewrites and vacuums the database), `.continuumignore`, built-in redaction with the repository's own patterns on every capture path, and `export` / `import`. An unreadable config or `.continuumignore` stops capture instead of being ignored. |
| **Dashboard** | Task editing ("set by you"), behind the access token and a CSRF token. Every connected repository in one dashboard. A live getting-started checklist. A command palette. axe checks on live screens in both themes. |
| **First hour** (0.3.0) | The overview lists repositories with recent work, not only those with an open task, and each shows its latest session. Copy on live screens follows the real state, and an end-to-end check fails on demo or prototype wording. Briefings name agents and, with no task, open with the next step the latest note named. A one-line receipt after each Claude Code reply that recorded something. `serve` opens the browser; `setup` ends with the command that does. The project page fits a phone. `doctor --report` for issues. |
| **Verification** (0.3.0) | Each check shows how many of its covered files changed since it ran, and `Command changed` with the earlier command, in the Verification panel and the file drawer. |
| **Release automation** | Actions pinned to commit SHAs, npm trusted publishing, the plugin repository updated by the release workflow, a strict Content-Security-Policy on the website, and one getting-started guide. |
| **Briefings** (next release) | The Handoffs page became Briefings: the text `continuum handoff` prints, with a copy button and its size in tokens, and a test proving the two match. The handoff text the browser built for itself and its browser-only history are gone. |
| **Launch** | [continuumgroup.dev](https://continuumgroup.dev): a landing page, docs, privacy page, and a demo film, "The thread", made with HyperFrames from real sessions. Releases 0.1.0 to 0.1.2 on npm (MIT); 0.2.0 (VS Code, the faster plugin) and later are proprietary and free to use; 0.2.1 (redaction everywhere, hook health); 0.3.0 (the first hour, clearer verification, the first release run entirely by the workflow). The plugin repository accepts private vulnerability reports. |

## Next

In order. Each item is one pull request, tests first; sizes are rough, for one developer (S up to a day, M two to three days, L about a week).

### Trust and control

What the dashboard shows is exactly what agents receive, and you can correct it there.

| # | Item | Done when | Size |
|---|---|---|---|
| 1 | **Create and correct from the dashboard.** Create a task; add a decision or known issue; mark one resolved or still valid. Each is recorded as set by you, through the CSRF-protected write. | Journeys cover each action, and the next briefing shows the change. | L |
| 2 | **Repository settings in the dashboard.** Agent checks, prompt capture and redaction patterns, with a preview of what a pattern would mask. Unusable patterns are refused. | Saving a bad pattern is refused with its reason; a good one masks the sample. | M |
| 3 | **Full activity history.** Page back through every event by sequence number, filtered by agent, type and date. Today the feed stops at the newest 200. | A store with 10,000 events can be paged to its first event. | M |
| 4 | **Decisions on the right task.** `record_decision` attaches to the calling session's task, not the repository's current one, so two agents working at once don't cross. First: does Claude Code tell an MCP server which session is calling? | A test with two parallel sessions keeps each decision on its own task. | M |

### Speed and reach

Order follows what users report.

| # | Item | Done when | Size |
|---|---|---|---|
| 5 | **Faster hooks at scale.** Hooks load only the graph nodes they need. Today session start takes 124 ms end to end at 10,000 events (`bench:hooks`), and opening a store with 100,000 events takes about 150 ms by itself (`bench:store`). | Session start stays under 150 ms end to end at 100,000 events. | L |
| 6 | **Windows.** WSL 2 as the supported path, documented and tested in CI. Native support (Node hooks instead of `sh`) only once people ask. | The release smoke test passes under WSL. | M |
| 7 | **More agents.** Gemini CLI, Windsurf or JetBrains Junie, in the order users ask. | Each passes `npm run test:cross-agent`. | M each |

### Only once users ask

- **Teams**, after at least five separate requests: decisions shared through an opt-in file in the repository, reviewed in pull requests, with everything else staying local.
- **Semantic search over memory**: `get_context` covers most needs, and local embeddings would add size and setup to every install.

The demo film's pipeline is described in [`scripts/demo-video/README.md`](../scripts/demo-video/README.md).
