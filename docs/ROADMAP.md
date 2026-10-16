# Continuum roadmap: from working prototype to a product anyone can use

Status, October 2026. M0 to M4 and tasks are done. The whole loop is proven on a real repository, the author's portfolio, with real Claude Code sessions. A fresh session was briefed only by Continuum. It reported:
- the current task, the steps done and the next steps;
- which claims were verified and which were agent-reported;
- that a test result was out of date because a file had changed since it ran.

This document lists what to improve next and in what order. Each item records why it matters, what "done" means, and how it will be tested. Items marked **(measured)** come from numbers taken on real data, not guesses.

---

## Guiding principles (unchanged)

1. **Honest evidence.** Every claim is verified, observed or agent-reported, and the UI never blurs the three.
2. **Local-first.** Nothing leaves the machine, and there are no external AI APIs.
3. **Never disturb the agent.** Hooks must never block, slow down or break a session.
4. **Feature branches, atomic commits, CI green, code review before merge.**

---

## Phase 1: anyone can install it (highest priority)

Today Continuum runs from a git checkout through `tsx`, behind a shell alias. Hook and MCP configs contain absolute paths to that checkout. Nobody else can try it without cloning and building the monorepo. This is the one thing blocking every other kind of feedback.

| # | Item | Done when |
|---|---|---|
| 1.1 | **Bundle the CLI.** Bundle with esbuild or tsup into one ESM file with no `tsx` at runtime. The built dashboard ships inside the package. | `node dist/continuum.js --version` works from any folder, and the package is under about 5 MB. |
| 1.2 | **Publish to npm under a scope.** *Needs from you: the npm scope or org.* | `npx @<scope>/continuum setup claude-code` works in a fresh repo on a clean machine. |
| 1.3 | **Stable invocation in configs.** `setup` writes `npx -y @<scope>/continuum@<version> …` instead of checkout paths, so `.mcp.json` becomes shareable with a team. | Re-running `setup` after an upgrade moves the config to the new version. Tracked `.mcp.json` files can then be updated, with consent. |
| 1.4 | **Claude Code plugin.** It bundles the MCP server, hooks and a `/handoff` command, and installs in one step from a marketplace repo. | `/plugin install continuum@…` connects a repo with no terminal step, and `claude plugin validate --strict` passes. |
| 1.5 | **`continuum doctor`.** Checks Node version, git, SQLite, hook registration, MCP approval, store health and dashboard build, with a clear fix for each problem. | Each failure mode found so far produces an actionable message: closed terminal, missing alias, unapproved MCP server, wrong page opened. |
| 1.6 | **`continuum uninstall`.** Removes hooks and MCP entries and deletes `.continuum/` after confirmation. | It leaves the repository exactly as it was before setup, which is tested. |
| 1.7 | **Version and schema migrations.** Uses `meta.schema_version` with forward-only migrations, and older stores open read-only with a clear message. | An upgrade from every released schema version is tested. |
| 1.8 | **CI matrix:** macOS and Linux, on Node 22.x and 24.x. | Green on all four. |

---

## Phase 2: fast and small on big repositories

**(measured)** On the portfolio (70 files):
- A full briefing takes **0.42 s**.
- Each recorded check stores **about 6 KB**, roughly 85 bytes per tracked file, because it keeps the hash of every file it ran against.

On a 50,000-file monorepo that would be about **4 MB per test run**, and session start would hash the whole tree every time.

| # | Item | Done when |
|---|---|---|
| 2.1 | **Incremental working-tree hashing.** Take blob hashes for clean tracked files straight from the git index (`git ls-files -s`), and only hash dirty or untracked files (`git status --porcelain=v2`). | Briefing time on a 50k-file repo is under 1 s, with a benchmark in CI. |
| 2.2 | **Content-addressed coverage manifests.** `ranAgainst` stores the hash of a manifest object instead of the full map, so identical trees share one manifest. | A check payload is under 1 KB whatever the repo size, and unchanged-tree runs add no new manifest. |
| 2.3 | **Event log compaction.** Fold old `file.changed` events into a checkpoint snapshot. Keep the full log for a configurable window. | Store size stays bounded over months of use, and replay from the checkpoint equals a full replay. |
| 2.4 | **Watcher on Linux.** Detect the inotify limit (`ENOSPC`) and fall back to polling with a clear message. | Running `start` on a huge repo never crashes. |
| 2.5 | **Daemon pushes updates.** Uses Server-Sent Events instead of the 5 s cache. | The dashboard updates within about 1 s of an edit or check, with no polling. |

---

## Phase 3: capture what actually happened

Some of what an agent does is still invisible to Continuum.

| # | Item | Why | Done when |
|---|---|---|---|
| 3.1 | **Line counts and diffs per change** (`git diff --numstat` plus a bounded patch). | The dashboard says "not captured yet" today. | File drawers show real `+/-` and a real diff, never illustrative ones. |
| 3.2 | **Checks Claude runs itself.** Commands Claude runs through its Bash tool, such as `npm test`, are recorded from `PostToolUse` along with their exit code. | Today only `continuum run` produces evidence, so Claude's own test runs are lost. | These runs are recorded with a distinct label ("run by the agent, exit code observed"), weaker than `continuum run`. A setting to opt out is included. |
| 3.3 | **Commits as events.** A commit hook or a revision watcher records the hash, message and files. | Handoffs can say "committed as abc123" instead of only "files changed". | — |
| 3.4 | **Per-session current task.** | A known limit today: two agents in one repository share a single current task. | Sessions record which task they started. Attribution follows the session, and the repository-wide current task is only a fallback. |
| 3.5 | **Optional prompt capture** (`UserPromptSubmit`, off by default). | The user's own words are the best statement of intent. | It's an opt-in setting, redacted, and shown as "said by you". |
| 3.6 | **Explain unrecorded changes.** | — | The handoff groups changes made outside agent sessions, so manual edits are clearly marked as not explained by agents. The walkthrough showed this matters: the second session noticed an unexplained `about.html` change. |

---

## Phase 4: smarter briefings (M5, retrieval quality)

The handoff today is a fixed set of sections cut down to fit a character budget. It should instead give the next agent *the most useful* context for *its* task.

| # | Item | Done when |
|---|---|---|
| 4.1 | **Symbol graph via tree-sitter.** Functions, classes and exports become `symbol:` nodes linked to files and tasks. Starts with TypeScript/JavaScript and Python. | Decisions can be anchored to a symbol, and they go stale only when *that symbol* changes, not the whole file. |
| 4.2 | **Ranked retrieval within a token budget.** Score each item by relevance to the current task and its graph distance, recency and evidence strength. | Each briefing section is justified by a score. A `get_context(task, budget)` MCP tool is added. |
| 4.3 | **"Since you left" summary.** Lists what changed between this agent's last session and now, including changes by other agents and by hand. | It appears first when the same agent resumes. |
| 4.4 | **Evaluation harness.** Replays recorded real sessions and asks a fresh session standard questions (current task, next step, what is verified). Scored by script; no external API needed when run locally with Claude Code. | A baseline score is recorded, and every retrieval change must not lower it. |
| 4.5 | **Semantic search over memory** (local embeddings, optional). | `search_context` finds decisions by meaning, without leaving the machine. |

---

## Phase 5: more agents (second half of M6)

| # | Item | Done when |
|---|---|---|
| 5.1 | **`continuum setup codex`**: Codex CLI MCP configuration, project-scoped. | Codex sessions can read the handoff and update tasks. |
| 5.2 | **`continuum setup cursor`**: `.cursor/mcp.json` plus rules that prompt task updates. | Same as 5.1. |
| 5.3 | **Agent-agnostic capture.** For agents without hooks, `continuum start` plus a `session` CLI (`continuum session start/end --agent codex`). | Work by agents without hooks still shows up as sessions. |
| 5.4 | **Cross-agent handoff test.** Claude stops, Codex resumes through MCP, and Codex continues the same task. | An end-to-end script exists, run manually before each release. |

---

## Phase 6: trust, privacy and control

| # | Item | Done when |
|---|---|---|
| 6.1 | **`continuum forget`.** Removes recorded data by path, time range or session, using tombstone events and a rebuild. Deletion is real: objects are vacuumed. | Forgotten text cannot be found in the database file, which is tested by searching the raw bytes. |
| 6.2 | **Ignore rules.** A `.continuumignore` file lists paths that are never captured, never hashed and never sent in handoffs. | Ignored paths appear nowhere in the store. |
| 6.3 | **Stronger redaction.** Adds detection of high-entropy strings and a user-defined pattern list. It also reports how many items were redacted. | Fixtures with common secret formats are all caught, and the false-positive rate is measured on normal code. |
| 6.4 | **Export.** `continuum export` writes the event log as JSON for backup or moving to another machine. | Export followed by import reproduces the same graph. |

---

## Phase 7: dashboard you can act from

| # | Item | Done when |
|---|---|---|
| 7.1 | **Edit tasks in the UI** through a write API that requires the access token and a per-request CSRF token. | Status, next action and steps can be edited, and the edits are labelled "by you", distinct from "by an agent". |
| 7.2 | **Multiple repositories.** A small registry (`~/.config/continuum/repos.json`) lets `continuum serve` with no arguments show every connected repository. | Running `setup` in two repos shows both in one dashboard. |
| 7.3 | **Onboarding in local mode.** The first run shows "connect Claude Code", "record a check" and "open a session" with live state. | A new user reaches a first briefing without reading the README. |
| 7.4 | **Known rough edges:** the handoff dialog's Prepare button does nothing without a task, and `serve` must be restarted after pulling new code. | Both are fixed. |
| 7.5 | **Accessibility pass on local-mode screens** (axe in Playwright). | No serious violations. |

---

## Phase 8: public launch

| # | Item | Done when |
|---|---|---|
| 8.1 | **Public demo.** The landing page and mock dashboard are deployed to a static host. *Needs from you: the host account and domain.* | The demo is reachable, with every screen labelled as demo data. |
| 8.2 | **Landing page copy matches the real product.** It shows real install steps, real screenshots and the evidence model. | The copy is reviewed against the shipped features, with no claims beyond them. |
| 8.3 | **Docs.** Covers getting started (the walkthrough we just did), a concepts page (evidence, tasks, checks), troubleshooting (from `doctor`) and privacy. | A newcomer can follow them without help. |
| 8.4 | **`v0.1.0` release.** Includes a changelog, a security policy and an issue template. | Tagged and published. |

---

## Suggested order

```
Phase 1 (install)  ──►  Phase 2 (scale)  ──►  Phase 8.1–8.3 (public demo, docs)  ──►  v0.1.0
        │                                         ▲
        └──► Phase 3.1–3.4 (capture gaps) ────────┘
Then: Phase 4 (smarter briefings), Phase 5 (more agents), Phase 6 and 7 in parallel by demand.
```

Phase 1 goes first because every later decision benefits from other people using the tool. Phase 2 must land before anyone tries it on a big monorepo. Phase 3.2, Claude's own test runs, is probably the single biggest jump in usefulness per day of work.

---

## What I need from you

1. **An npm scope** (Phase 1.2), for example by creating a free npm org. The unscoped name `continuum` is taken.
2. **A static host and domain** for the public demo (Phase 8.1), for example Vercel, which the portfolio already uses.
3. **Your usage notes.** After a few days of real use: what felt useful, noisy or missing. They will reorder Phases 3 to 7.
4. **Which second agent comes first** (Phase 5): Codex or Cursor.
