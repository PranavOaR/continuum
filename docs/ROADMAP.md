# Continuum roadmap

Status, 22 October 2026. Continuum is published on npm as `getcontinuum` and as a Claude Code plugin. It connects Claude Code, Codex, Cursor and GitHub Copilot in VS Code. The October 2026 plan (install, scale, capture, smarter briefings, more agents, privacy, an actionable dashboard, a public launch) has shipped, apart from the items under [Next](#next).

## Guiding principles

1. **Honest evidence.** Every claim is verified, observed, agent-reported or set by you, and the UI never blurs them.
2. **Local-first.** Nothing leaves the machine, and there are no external AI APIs.
3. **Never disturb the agent.** Hooks must never block, slow down or break a session.
4. **Feature branches, atomic commits, CI green, code review before merge.**

---

## Shipped

| Area | What shipped |
|---|---|
| **Install** | A single minified ESM bundle (about 900 KB) with the dashboard, on npm as `getcontinuum`. `setup` writes `npx -y getcontinuum@<version>`, so `.mcp.json` can be shared. A Claude Code plugin from [PranavOaR/continuum-plugin](https://github.com/PranavOaR/continuum-plugin), whose hooks run their own copy of the bundle with `node` (about 0.1 s, against 0.5 s through `npx`). `doctor`, `uninstall [--purge]`, forward-only schema migrations, and CI on macOS and Linux with Node 22.13 and 24. |
| **Scale** | Clean files' hashes come from the git index, and only dirty or untracked files are hashed. Checks store content-addressed coverage manifests. `compact` folds old events into a checkpoint. The watcher falls back to polling when the OS runs out of watches. The dashboard updates over Server-Sent Events. |
| **Capture** | Line counts and uncommitted diffs per file. Claude Code's own test, lint and build runs, with exit codes (observed). Commits. A current task per session. Opt-in prompt capture. Changes no agent session made are listed separately. |
| **Briefings** | Decisions anchored to a symbol (`path#name`, TypeScript, JavaScript and Python), which go stale only when that symbol changes. `get_context` ranks context for a task within a token budget. "Since you left" opens a resumed session. An evaluation harness (`npm run eval`) that CI requires to score 100%. |
| **Agents** | `setup claude-code`, `setup codex`, `setup cursor` and `setup vscode` (Copilot agent mode). `continuum session` for agents without hooks. A cross-agent test (`npm run test:cross-agent`). Agents that report no exit codes are asked to run checks through `continuum run`. |
| **Privacy** | `forget` (rewrites and vacuums the database), `.continuumignore`, built-in redaction with user patterns, and `export` / `import`. |
| **Dashboard** | Task editing ("set by you"), behind the access token and a CSRF token. Every connected repository in one dashboard. A live getting-started checklist. A command palette. axe checks on live screens in both themes. |
| **Launch** | [continuumgroup.dev](https://continuumgroup.dev): a landing page, docs, privacy page, and a demo video recorded from real sessions. Releases 0.1.0 to 0.1.2 on npm (MIT); later versions are proprietary and free to use. |

## Next

| # | Item | Why | Done when |
|---|---|---|---|
| 1 | **Release 0.2.0** | VS Code support, the faster plugin and the import fix are on `main` but not on npm, and the plugin is still pinned to 0.1.2. | `npx getcontinuum setup vscode` works, and the plugin repository carries the 0.2.0 bundle. |
| 2 | **A new demo video** | The current one is plain, and its voice sounds synthetic. | A re-recorded video with motion design and a natural voice is on the website. |
| 3 | **Windows** | The hooks run through `sh`, so Windows is refused with a pointer to WSL 2. | Decide between WSL-only (documented, tested in CI) and native support (PowerShell or Node hooks, a Windows CI job). |
| 4 | **Semantic search over memory** | Finding decisions by meaning, with local embeddings and no network. | Only if users ask for it: it is optional, and `get_context` covers most needs. |
| 5 | **Turn on private vulnerability reporting** in the public plugin repository | Its `SECURITY.md` points there, and its bug-report template asks for `doctor` output. | The repository's Security tab accepts reports. |
| 6 | **Usage feedback** | Real use should order everything after this list. | Issues and notes from people other than the author. |

The demo video's pipeline is described in [`scripts/demo-video/README.md`](../scripts/demo-video/README.md).
