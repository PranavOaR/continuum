# Continuum — Build Plan (prototype → working product)

**Status:** draft for review · **Owner:** Pranav · **Last updated:** 2026-10-16

The frontend prototype proves the experience. This plan turns it into a working, local-first product: something that observes real agent sessions and repositories, maintains an evidence-backed project state, and prepares handoffs from it.

---

## 1. What "done" looks like for v1

A developer installs Continuum, runs it in a repository, works with Claude Code, then switches to Codex. Without writing a summary, they:

1. Open the dashboard and see the **real** task, changed files, recorded test runs, and decisions from the previous session.
2. Prepare a handoff and paste it into the next agent, **or** let the next agent pull it directly over MCP.
3. Trust what they see, because every item carries honest evidence (observed, verified, agent-reported, inferred).

**Non-goals for v1:** cloud sync, team accounts, billing, hosted inference, embeddings-first search, IDE plugins beyond MCP.

---

## 2. Principles carried over from the prototype

These are already encoded in `src/types` and the UI; the backend must honour them.

| Principle | Concrete rule |
| --- | --- |
| Evidence over assumptions | A check is `passed` only with a recorded run (exit code + revision). Agent claims are `agent-reported`, never `verified`. |
| Out-of-date is a first-class state | A verification result goes `out-of-date` as soon as a file it covers changes after the run. |
| Local-first | All capture, storage and retrieval run on the developer's machine. No network calls by default. |
| Deterministic before generative | Handoffs are assembled from structured records by templates. LLM summarisation is optional, off by default. |
| Honest UI | Never claim an agent "received" anything unless delivery was confirmed (e.g. an MCP tool call was logged). |

---

## 3. Architecture

```
┌──────────────── developer machine ────────────────────────────────────────┐
│                                                                            │
│  Agent adapters            continuumd (local daemon)          Clients      │
│  ─────────────             ─────────────────────────          ───────      │
│  Claude Code hooks ─┐      ┌──────────────────────┐   HTTP   Web UI       │
│  Codex (MCP/logs)  ─┼─────▶│ Ingest API (events)  │◀────────(this repo)   │
│  Cursor (MCP)      ─┤      │ Event log (append)   │                        │
│  Manual / CLI      ─┘      │ Projectors → state   │   MCP    Any agent     │
│                            │ Graph + retrieval    │◀────────(pull context) │
│  Repo watchers             │ Handoff builder      │                        │
│  ─────────────             └─────────┬────────────┘   CLI    continuum ... │
│  git (diff/commit/branch)            │                                     │
│  file watcher (debounced)       SQLite (one file per workspace)           │
│  `continuum run -- <test cmd>`  + tree-sitter symbol index                 │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Core idea: event-sourced project state

Everything that happens becomes an immutable **event** (`session.started`, `file.changed`, `check.recorded`, `decision.recorded`, …). **Projectors** fold events into the read models the UI already consumes (`ProjectWorkspace`, `MemoryGraph`, attention items). This gives us:

- an audit trail behind every evidence label;
- the ability to rebuild state when projection logic improves;
- natural "out-of-date" detection (a later `file.changed` invalidates an earlier `check.recorded`).

### 3.2 Components

| Component | Responsibility | Proposed tech |
| --- | --- | --- |
| `packages/core` | Domain types (moved from `src/types`), event schemas, evidence rules, projectors, handoff builder | TypeScript, Zod |
| `packages/store` | SQLite schema, migrations, event log, read models | `better-sqlite3`, Drizzle (or plain SQL) |
| `packages/watchers` | Git and filesystem observation, revision tracking | `simple-git` or git CLI, `chokidar` |
| `packages/symbols` | Map changed lines → symbols | `tree-sitter` (TS/JS, Python first) |
| `packages/daemon` | Local HTTP API implementing `ContinuumService`, ingest endpoint | Hono or Fastify on `127.0.0.1` |
| `packages/mcp` | MCP server exposing state and handoffs to agents | `@modelcontextprotocol/sdk` |
| `packages/cli` | `continuum init / start / status / run / handoff / decide` | `commander` |
| `packages/adapters/*` | Per-agent capture | see §5 |
| `apps/web` | This frontend, pointed at the daemon | existing Vite app |

**Language decision (recommended): TypeScript end to end** for v1. The domain types already exist, the frontend and backend share them, and MCP/tree-sitter both have mature Node bindings. Revisit Rust/Go for the daemon only if profiling shows a need.

### 3.3 Repository layout (npm workspaces)

```
apps/web/                 ← current src/, e2e/, vite config
packages/core/            ← types, events, evidence rules, projectors, buildHandoffContext
packages/store/
packages/watchers/
packages/symbols/
packages/daemon/
packages/mcp/
packages/cli/
packages/adapters/claude-code/
packages/adapters/codex/
packages/adapters/cursor/
docs/
```

---

## 4. Data model

The UI's types become read models. The new source of truth is the event log.

### 4.1 Tables (SQLite)

| Table | Purpose |
| --- | --- |
| `workspaces` | One per repository root (id, path, name, created_at) |
| `events` | Append-only: id, workspace_id, type, payload JSON, source (adapter/watcher/cli/user), evidence, occurred_at, revision |
| `sessions` | Projected: agent, started/ended, task_id, summary |
| `tasks` | Projected: title, objective, status, criteria (JSON), steps |
| `files` | Projected: path, change type, latest revision, +/− lines, task links |
| `symbols` | path, name, kind, line range, revision |
| `checks` | name, command, status, exit_code, ran_at, revision, covered_paths |
| `memory_records` | decision / known-issue / previous-attempt / next-action, source, evidence |
| `edges` | from_id, to_id, kind (touches, defines, constrains, verified_by, worked_on) |
| `handoffs` | as today, plus `delivered_via` (copy, mcp) and `delivered_at` |

### 4.2 Evidence rules (implemented in `packages/core`, unit-tested)

- **observed:** produced by a watcher or adapter from a concrete artefact (diff, hook payload).
- **verified:** produced only by `check.recorded` with an exit code and revision.
- **agent-reported:** text an agent wrote about itself (session summaries, "done" claims).
- **inferred:** derived by a projector (e.g. "next action" from remaining steps + failing checks).
- **simulated:** demo data only; never produced in a real workspace.
- **Out-of-date rule:** `check.status = out-of-date` when any `file.changed` for a path in `covered_paths` (or anywhere, if unknown) occurs after `ran_at`.

---

## 5. Capture: agent adapters and watchers

Integration details change quickly. **Each adapter starts with a 1–2 day spike** that confirms the mechanism against current docs before we build on it.

| Source | Mechanism to validate in spike | What we capture | Evidence |
| --- | --- | --- | --- |
| Claude Code | Hooks (session start/end, tool-use events) calling `continuum ingest` | session boundaries, edited files, commands run, final summary | observed / agent-reported |
| Codex | MCP server registration and/or session logs on disk | session boundaries via MCP calls, files via git | observed / agent-reported |
| Cursor | MCP server | explicit progress/decision records via tools; files via git | observed / agent-reported |
| ChatGPT | Manual import or copy-paste first; investigate connector support | user-pasted summaries | agent-reported |
| Any agent | MCP tools `record_progress`, `record_decision`, `get_handoff` | structured records | agent-reported |
| Git | poll/watch `HEAD`, index and working tree | changed files, diffs, commits, branch | observed |
| Tests | `continuum run -- npm test` wrapper | exit code, duration, revision, output tail | verified |

**Agent-agnostic fallback:** even with zero adapters, the git watcher plus `continuum run` produce a useful state. Adapters enrich it, they are not required.

---

## 6. Retrieval and handoff generation

1. **Seed** from the selected task.
2. **Walk** the graph: task → files → symbols → decisions/known issues → checks → recent sessions.
3. **Rank** by recency, evidence strength, and whether the item is unresolved (failing or out-of-date checks rank first).
4. **Budget:** fit within a configurable token budget, with a real tokenizer estimate replacing the prototype's chars ÷ 4 (still labelled as an estimate).
5. **Render** with the existing `buildHandoffContext` sections, moved into `packages/core`.

Optional, later: semantic search over decisions and summaries (e.g. a local vector extension), behind a flag.

---

## 7. Delivery

- **Copy** (already built): the user pastes into the next agent.
- **MCP pull** (new): the next agent calls `get_handoff(project, task)` or `get_project_state()`. The handoff is marked `delivered_via = mcp` only when that call is logged, so the UI can truthfully say "retrieved by Codex at 10:42".
- **Context file** (optional): write a generated section into a repo-local context file the next agent reads. Opt-in, clearly delimited, never overwriting user content.

---

## 8. Security and privacy

- Daemon binds to `127.0.0.1` only, with a per-install token for the HTTP API and CLI.
- Respect `.gitignore` plus a `.continuumignore`; never read ignored paths.
- Secret redaction before storage (common token patterns, `.env` values); unit-tested.
- No network egress by default. Optional LLM summarisation requires explicit opt-in and a user-provided key.
- `continuum forget <workspace>` deletes all local data.

---

## 9. Phased roadmap

Estimates assume one developer; adjust after Phase 0.

### Phase 0 — Foundations and spikes (week 1)
- Restructure into npm workspaces; move `src/types` and `buildHandoffContext` into `packages/core` (web app imports them).
- Spikes: Claude Code hooks, Codex MCP, Cursor MCP, tree-sitter symbol extraction. Each ends with a one-page finding in `docs/spikes/`.
- **Exit:** monorepo builds and tests green; written go/no-go per adapter.

### Phase 1 — Local core (weeks 2–3)
- SQLite store with migrations; event log; projectors for tasks, files, checks, sessions, memory.
- Git watcher and `continuum run` test wrapper with out-of-date detection.
- CLI: `init`, `start`, `status`, `run`, `decide`, `task`.
- **Exit:** in a real repo, editing files and running tests produces correct projected state (unit and integration tests on fixture repos).

### Phase 2 — Daemon API and real UI (weeks 4–5)
- Daemon implements `ContinuumService` over HTTP; add `HttpContinuumService` in the web app and switch via env flag (mock stays for demos).
- Replace polling with server-sent events for live activity.
- Onboarding: first-run screen to pick a workspace; empty states for real data.
- **Exit:** the dashboard shows the developer's own repository live; all existing E2E journeys pass against a seeded daemon.

### Phase 3 — Agent capture (weeks 6–7)
- Claude Code adapter (hooks → ingest).
- MCP server: `get_project_state`, `get_handoff`, `record_progress`, `record_decision`.
- Codex and Cursor via MCP; manual import for ChatGPT.
- **Exit:** a real Claude Code → Codex switch where Codex retrieves the handoff over MCP, and the UI shows delivery truthfully.

### Phase 4 — Retrieval quality and symbols (week 8)
- tree-sitter symbol mapping; graph-walk ranking; token budgeting with a real tokenizer.
- Handoff quality evaluation set: 10 recorded real sessions, scored by whether the next agent needed re-explanation.
- **Exit:** median handoff under budget, with failing/out-of-date checks always included.

### Phase 5 — Hardening and release (weeks 9–10)
- Secret redaction, ignore rules, `forget`, crash-safe writes, schema migration tests.
- Packaging: `npx continuum` or a single binary; docs site; demo mode retained.
- **Exit:** v0.1 tagged; installs and runs cleanly on macOS and Linux.

---

## 10. Testing strategy

| Layer | Tooling | Focus |
| --- | --- | --- |
| Core rules | Vitest | evidence rules, out-of-date logic, projectors, handoff builder, redaction |
| Store | Vitest + temp SQLite | migrations, event replay produces identical state |
| Watchers | Vitest + fixture git repos | diffs, renames, branch switches, debounce |
| Daemon / MCP | integration tests over HTTP and MCP client | contract matches `ContinuumService` types |
| Web | existing Playwright suite against mock and seeded daemon | journeys, console errors, responsive overflow |
| End to end | scripted session on a fixture repo | capture → state → handoff → MCP retrieval |

Coverage target stays at 80%+ on `packages/core` and `packages/store`.

---

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Agent integration surfaces change or are limited | Capture gaps | Git + test wrapper work without adapters; spikes first; adapters isolated behind one ingest contract |
| Inferred state is wrong and erodes trust | Users stop relying on it | Strict evidence labels; show the source event for every claim; inferred items visually distinct |
| Handoffs too long or noisy | Wasted context, worse agent output | Token budget, ranking, evaluation set in Phase 4 |
| Secrets captured from diffs or commands | Privacy incident | Redaction before storage, ignore rules, no egress by default |
| File-watch overhead on large repos | Laptop slowdown | Git-status-driven polling, debounce, ignore build dirs |

---

## 12. Decisions needed from you

1. **Language:** TypeScript end to end for v1 (recommended) or a Rust/Go daemon?
2. **First adapter:** Claude Code first (recommended, since it's your current primary agent) or Codex?
3. **Distribution:** `npx` package (fastest) or standalone binary?
4. **Demo mode:** keep the mock dataset shipped alongside real mode (recommended for onboarding and screenshots)?

---

## 13. First concrete tasks (start here)

1. Convert to npm workspaces: `apps/web`, `packages/core`. Move `src/types/*`, `utils/buildHandoffContext.ts`, `utils/labels.ts` into `packages/core`; keep all tests green.
2. Define event schemas in `packages/core/events.ts` with Zod, plus the evidence and out-of-date rules, test-first.
3. Create `packages/store` with the `events` table, a replay function, and the `checks` projector, test-first against fixture events.
4. Write the `continuum run -- <cmd>` wrapper that records a `check.recorded` event with exit code and `git rev-parse HEAD`.
5. Spike: Claude Code hooks posting to a local ingest endpoint; record findings in `docs/spikes/claude-code.md`.
