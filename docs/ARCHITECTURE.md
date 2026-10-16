# Continuum — Product Architecture

**Status:** proposal for review · **Companion to:** [`BUILD_PLAN.md`](./BUILD_PLAN.md) (phases, testing, risks)

This document answers two questions before building starts:

1. **How does Continuum plug into Claude (and other agents)?**
2. **How is context stored?** Specifically, the idea of a hash map whose values are graph nodes.

---

## 1. Integration: local-first *and* MCP

These are not alternatives; they are two layers.

- **Local-first is where Continuum lives.** Capture, storage, indexing and retrieval all run on your machine. The context store is a local file. Nothing leaves the laptop by default.
- **MCP (plus hooks) is how agents talk to it.** An agent never reads Continuum's database directly; it calls tools on a local MCP server, which reads the local store.

```
            your machine
┌───────────────────────────────────────────────────────────────┐
│  Claude Code ──hooks──▶ continuum ingest ─┐                   │
│       │                                   ▼                   │
│       └──MCP (stdio)──▶ continuum mcp ──▶ Context Store       │
│                                           ▲    (local file)   │
│  Codex / Cursor ──MCP──▶ continuum mcp ───┤                   │
│                                           │                   │
│  git + file watcher + test wrapper ───────┘                   │
│                                                               │
│  Web UI ◀──HTTP (127.0.0.1)── continuumd                      │
└───────────────────────────────────────────────────────────────┘
```

### 1.1 Claude Code specifically

Three mechanisms, packaged together so it is one install. Each is confirmed in a spike before we depend on it.

| Mechanism | Direction | What it does |
| --- | --- | --- |
| **MCP server** (`continuum mcp`, stdio) | Claude pulls | Tools such as `get_project_state`, `get_handoff`, `search_context`, `record_decision`, `record_progress`. Claude asks for context when it needs it. |
| **Hooks** | Continuum listens | Session start/end and file-edit/tool events are posted to `continuum ingest`, so capture is passive. A session-start hook can also inject a short "where we left off" summary. |
| **Plugin bundle** | Install | Packages the MCP server, hooks and slash commands (e.g. `/handoff`) so setup is a single step. |

Other agents get the MCP server (Codex, Cursor) or copy-paste (ChatGPT, until a better path is confirmed). Git, file watching and the test wrapper work for every agent, even with no integration at all.

---

## 2. The Context Store: hash map → graph

Your idea, made concrete: **a hash map keyed by hashes, whose values are nodes in a graph.** We use two kinds of key, because they answer different questions.

| Key | Example | Answers |
| --- | --- | --- |
| **Content hash** | `sha256(canonical bytes)` | "Has this exact thing changed?", deduplication, integrity |
| **Identity key** | `symbol:src/auth/session.ts#createSession` | "What is this thing, and how is it connected?" |

### 2.1 Three layers

```
 Layer 1: Object store (content-addressed, immutable)
   hash ──▶ object { kind, bytes/metadata }
   e.g. 3f9a… ──▶ symbol body of createSession @ a3f9c21

 Layer 2: Identity index (the hash map)
   identity ──▶ node { currentHash, history[], props, out: Edge[], in: Edge[] }
   e.g. symbol:src/auth/session.ts#createSession
        ──▶ { currentHash: 3f9a…, history: [7c1e…, 3f9a…],
              out: [defines←file, constrained_by→decision:session-service],
              in:  [touched_by←session:claude-auth, verified_by→check:auth-suite] }

 Layer 3: Graph (the values of the map, linked by typed edges)
   task ─touches─▶ file ─defines─▶ symbol ◀─constrains─ decision
     │                                   ▲
     └─verified_by─▶ check ──ran_against─┘ (pinned to content hashes)
```

- **Layer 1** is append-only. Same content means same hash, so nothing is stored twice.
- **Layer 2** is the hash map: O(1) lookup from any identity to its node, its current version, and its adjacency lists. This is "the graph as the value of the hash map".
- **Layer 3** is simply what you get by following the edges stored in Layer 2 values. Typed edges: `touches`, `defines`, `imports`, `constrains`, `verified_by`, `worked_on`, `supersedes`, `ran_against`.

### 2.2 Why hashing pays off here

1. **Precise "out of date".** A check stores the content hashes it ran against. It is out of date exactly when any of those hashes differs from the current one. No time-based guessing.
2. **Anchored decisions.** A decision linked to `createSession` records that symbol's hash. If the symbol changes, the decision is flagged "anchor changed, review" instead of silently going stale.
3. **Cheap change detection.** A Merkle tree over directories means comparing two snapshots touches only the subtrees whose hashes differ.
4. **Reuse git's hashing.** For tracked files, git already gives us content hashes (`git ls-files -s`, `git hash-object`), so we only hash dirty and untracked files ourselves.
5. **Cache keys for later.** Symbol extraction, summaries and any future embeddings are keyed by content hash, so unchanged code is never reprocessed.

### 2.3 Storage engine

- **In memory:** a `Map<IdentityKey, Node>` with adjacency lists. Traversal for retrieval is plain breadth-first walking with typed-edge weights. Per-repository graphs (thousands to tens of thousands of nodes) fit comfortably in memory.
- **On disk:** one SQLite file per workspace (`objects`, `nodes`, `edges`, `events`) as the source of truth; the in-memory map is rebuilt at start-up and updated incrementally.
- **No separate graph database server in v1.** It would break zero-config, local-first install for no gain at this scale. Everything sits behind a `GraphStore` interface, so an embedded graph engine can replace it later if traversal needs outgrow it (evaluate maturity and maintenance status before adopting one).
- **SQLite driver:** prefer Node's built-in `node:sqlite` (no native build step); fall back to `better-sqlite3` if the spike finds gaps.

### 2.4 How events feed the store

```
hook / watcher / test wrapper
        │  event { type, payload, evidence, revision }
        ▼
  events table (append-only)  ──▶  projector
                                      │ hash new content → Layer 1
                                      │ upsert identity  → Layer 2
                                      │ add/remove edges → Layer 3
                                      ▼
                          read models for UI, MCP and handoffs
```

---

## 3. Broad build plan

Milestones are sequential; each ends with something demonstrable. Detailed tasks, tests and risks live in `BUILD_PLAN.md`.

| # | Milestone | Outcome you can see |
| --- | --- | --- |
| M0 | **Restructure + spikes** | Monorepo (`apps/web`, `packages/*`); go/no-go notes on Claude Code hooks, MCP, `node:sqlite`, tree-sitter |
| M1 | **Context Store core** | Object store, identity map, graph, events, projectors, evidence and out-of-date rules, all unit-tested |
| M2 | **Repository capture** | `continuum init/start/status`; git + file watcher; `continuum run -- npm test` records verified checks against content hashes |
| M3 | **Claude Code integration** | MCP server + hooks + plugin bundle; Claude can call `get_handoff` and passive capture works in a real session |
| M4 | **Real UI** | Web app switches from mock to the local daemon; live activity; onboarding to pick a workspace; demo mode kept |
| M5 | **Retrieval quality** | Symbol-level graph via tree-sitter; ranked, token-budgeted handoffs; evaluated on real sessions |
| M6 | **Second agent + release** | Codex or Cursor over MCP; redaction, ignore rules, `forget`; packaged `v0.1` |

**The proof point** is reached at M3: you work in Claude Code, stop mid-task, open a fresh session, and it resumes from Continuum's state without you re-explaining anything.

---

## 4. Distribution: anyone can try it

The goal is that any developer can try Continuum in minutes, without an account.

| Surface | How people get it | Notes |
| --- | --- | --- |
| **CLI + daemon** | `npx <scope>/continuum init` inside any git repo | Published to npm under a scope we own (the unscoped `continuum` name is taken). Requires Node 22.5+ for built-in SQLite. |
| **Web dashboard** | Served locally by the daemon at `http://127.0.0.1:<port>` | The `apps/web` build ships inside the npm package; no separate install. |
| **Claude Code integration** | One plugin install that bundles the MCP server, hooks and `/handoff` | Project-scoped by default; nothing written to global settings without consent. |
| **Other agents** | `continuum mcp` registered in Codex or Cursor settings | Same MCP server. |
| **Public demo** | Landing page plus mock-data demo hosted on a static host | No backend; shows the product before install. |

Release checklist (M6): npm scope and name reserved, `npx` path tested on clean macOS and Linux machines, plugin install tested in a fresh repo, public demo deployed, and an "Uninstall / forget my data" section in the README.
