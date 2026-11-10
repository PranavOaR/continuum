# Continuum roadmap

Status, 10 November 2026, after the 0.4.0 release. Continuum is published on npm as `getcontinuum` and as a Claude Code plugin. It connects Claude Code, Codex, Cursor and GitHub Copilot in VS Code. The October 2026 plan has shipped, and so has most of the November plan: a new user's first hour, memory you can ask, evidence at the finish, a profile that follows you, and trust and control. Those after 0.4.0 are merged but not yet released. [Next](#next) lists what is left.

## Guiding principles

1. **Honest evidence.** Every claim is verified, observed, agent-reported or set by you, and the UI never blurs them.
2. **Local-first.** Nothing leaves the machine, and there are no external AI APIs.
3. **Never disturb the agent.** Hooks must never block, slow down or break a session.
4. **Feature branches, atomic commits, CI green, code review before merge.**

---

## Shipped

| Area | What shipped |
|---|---|
| **Install** | A single minified ESM bundle (about 900 KB) with the dashboard, on npm as `getcontinuum`. `setup` writes `npx -y getcontinuum@<version>`, so `.mcp.json` can be shared. A Claude Code plugin from [PranavOaR/continuum-plugin](https://github.com/PranavOaR/continuum-plugin), whose hooks run their own copy of the bundle with `node` (about 0.1 s, against 0.5 s through `npx`). `doctor`, which also reports hooks that never arrive or fail, `uninstall [--purge]`, forward-only schema migrations, and CI on Windows, macOS and Linux with Node 22.13 and 24. Native Windows: hooks and MCP servers run with no POSIX shell (`cmd /c npx` from setup, a node launcher in the plugin, PowerShell hooks for VS Code). |
| **Scale** | Clean files' hashes come from the git index, and only dirty or untracked files are hashed. Checks store content-addressed coverage manifests. `compact` folds old events into a checkpoint. The watcher falls back to polling when the OS runs out of watches. The dashboard updates over Server-Sent Events. |
| **Capture** | Line counts and uncommitted diffs per file. Claude Code's own test, lint and build runs, with exit codes (observed). Commits. A current task per session. Opt-in prompt capture. Changes no agent session made are listed separately. |
| **Briefings** | Decisions anchored to a symbol (`path#name`, TypeScript, JavaScript and Python), which go stale only when that symbol changes. `get_context` ranks context for a task within a token budget. "Since you left" opens a resumed session. An evaluation harness (`npm run eval`) that CI requires to score 100%. |
| **Agents** | `setup claude-code`, `setup codex`, `setup cursor` and `setup vscode` (Copilot agent mode). `continuum session` for agents without hooks. A cross-agent test (`npm run test:cross-agent`). Agents that report no exit codes are asked to run checks through `continuum run`. |
| **Privacy** | `forget` (rewrites and vacuums the database), `.continuumignore`, built-in redaction with the repository's own patterns on every capture path, and `export` / `import`. An unreadable config or `.continuumignore` stops capture instead of being ignored. |
| **Dashboard** | Task editing, behind the access token and a CSRF token. Every connected repository in one dashboard. A live getting-started checklist. A command palette. axe checks on live screens in both themes. |
| **First hour** (0.3.0) | The overview lists repositories with recent work, not only those with an open task, and each shows its latest session. Copy on live screens follows the real state, and an end-to-end check fails on demo or prototype wording. Briefings name agents and, with no task, open with the next step the latest note named. A one-line receipt after each Claude Code reply that recorded something. `serve` opens the browser; `setup` ends with the command that does. The project page fits a phone. `doctor --report` for issues. |
| **Verification** (0.3.0) | Each check shows how many of its covered files changed since it ran, and `Command changed` with the earlier command, in the Verification panel and the file drawer. |
| **Release automation** | Actions pinned to commit SHAs, npm trusted publishing, the plugin repository updated by the release workflow, a strict Content-Security-Policy on the website, and one getting-started guide. |
| **Briefings** (0.4.0) | The Handoffs page became Briefings: the text `continuum handoff` prints, with a copy button and its size in tokens, and a test proving the two match. The handoff text the browser built for itself and its browser-only history are gone. |
| **Correct it yourself** (0.4.0) | Create a task (now or later), add a decision or known issue, and mark a record resolved or still valid from the dashboard. Each is labelled set by you and reaches the next briefing, through the same CSRF-protected write as task edits. |
| **Two agents at once** (0.4.0) | `record_decision`, `update_task` and `get_context` act on the calling session's task, so two Claude Code or Codex sessions in one repository don't cross. Claude Code gives its MCP server `CLAUDE_CODE_SESSION_ID`, the same id its hooks report, including after `--resume`, and a resumed session counts as running again. Codex 0.149 names the session on every tool call, in `_meta["x-codex-turn-metadata"].session_id`, which is undocumented, so Continuum falls back when it's missing. `update_task` has to name a task another running session took up, and `start_task` no longer pauses that task. Continuum cannot yet tell which Copilot in VS Code or Cursor session is calling, so they are not held back. `npm run test:cross-agent` proves it with Claude Code and Codex running at once. |
| **Memory you can ask** (unreleased) | `search_memory`, `continuum search` and a `query` in `get_context` find a decision, issue, attempt, task or session note by its words, whichever task it was recorded on. It scores the records already in memory (BM25), with no index to keep in step with `forget`, `compact` or `import`. SQLite's FTS5 was the plan, but `node:sqlite` has it only from Node.js 22.16, and 22.13 is supported. `continuum why <file or symbol>` lists the decisions, tasks, sessions and checks behind a piece of code. The evaluation has a scenario for an old decision found by a word in its body. |
| **Evidence at the finish** (unreleased) | Marking a task completed while a check on its files failed or is out of date still closes it, and the reply names the check. `continuum check`, for a pre-commit hook, lists decisions whose anchored code the staged changes alter; it exits 0 unless `--strict`. |
| **Follows you** (unreleased) | A personal profile: preferences kept in Continuum's per-user folder, labelled set by you, that every repository's briefing opens with, including its first. `continuum profile` and the dashboard's Settings page edit it. |
| **Trust and control** (unreleased) | Repository settings in the dashboard, with a preview of what redaction would store, and patterns that will not compile or could hang refused with the reason. The Activity page pages back through a project's whole history by sequence number, filtered by type, agent and date; it needs no new index, because paging uses the event log's primary key. `doctor --report --open` and the dashboard open a pre-filled issue. The Windows end-to-end run can test what npm really serves. |
| **Launch** | [continuumgroup.dev](https://continuumgroup.dev): a landing page, docs, privacy page, and a demo film, "The thread", made with HyperFrames from real sessions. Releases 0.1.0 to 0.1.2 on npm (MIT); 0.2.0 (VS Code, the faster plugin) and later are proprietary and free to use; 0.2.1 (redaction everywhere, hook health); 0.3.0 (the first hour, clearer verification, the first release run entirely by the workflow). The plugin repository accepts private vulnerability reports. |

## Next

In order. Each item is one pull request, tests first; sizes are rough, for one developer (S up to a day, M two to three days, L about a week). There are still no user reports; reports reorder everything below.

### Speed and reach

Order follows what users report.

| # | Item | Done when | Size |
|---|---|---|---|
| 9 | **Faster hooks at scale.** Hooks load only the graph nodes they need. Today session start takes 124 ms end to end at 10,000 events (`bench:hooks`), and opening a store with 100,000 events takes about 150 ms by itself (`bench:store`). | Session start stays under 150 ms end to end at 100,000 events. | L |
| 11 | **More agents.** Gemini CLI, Windsurf or JetBrains Junie, in the order users ask. | Each passes `npm run test:cross-agent`. | M each |
| 12 | **Session identity for Copilot and Cursor.** Two sessions of either agent in one repository can still cross tasks, because neither tells its MCP server which session is calling. | Fixed when either agent exposes a session id. | S |

### Only once users ask

- **Teams**, after at least five separate requests: decisions shared through an opt-in file in the repository, reviewed in pull requests, with everything else staying local.
- **Semantic search over memory**: full-text search has shipped, and local embeddings would add size and setup to every install.
- **The dashboard's own search over memory records**: it covers tasks, files and activity; agents and the terminal already search memory.

### Not planned

- **Document or code retrieval (RAG).** Agents already read the repository themselves. Continuum holds what the code can't tell them: decisions, attempts and evidence.

The demo film's pipeline is described in [`scripts/demo-video/README.md`](../scripts/demo-video/README.md).
