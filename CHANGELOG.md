# Changelog

## [0.1.0] - unreleased

The first public release.

### Continuity
- Every session starts briefed on where the work left off. The briefing covers:
  - the current task and its next step;
  - what changed since the agent's last session (other agents' work, hand edits, your task changes, checks, commits, decisions);
  - which checks still hold for the current code;
  - decisions, and changes no agent explained.
- Every claim is labelled verified, observed, agent-reported or set by you.
- `get_context` ranks recorded context for a task within a token budget, showing each item's score and why.
- Decisions can be anchored to a file or to a single function, class or constant (`path#name`).

### Agents
- **Claude Code** (`setup claude-code`, or the plugin) records:
  - sessions, edits and task links;
  - test, lint and build runs with their exit codes;
  - commits;
  - prompts, opt-in.
- **Codex** (`setup codex`): sessions, `apply_patch` edits, tasks and briefings. Verified with real sessions.
- **Cursor** (`setup cursor`): MCP server plus an always-applied rule.
- Agents without hooks: `continuum session start|note|end`.
- `npm run test:cross-agent`: Claude Code starts a task, and Codex finishes it from the briefing alone.

### Evidence
- `continuum run` records verified checks against exact file hashes, which go out of date when a covered file changes.
- `npm run eval` checks, in CI, that briefings carry what a fresh agent needs. In Claude mode, Claude Code answered every standard question correctly.

### Dashboard
- `continuum serve` shows every connected repository, on 127.0.0.1 only with a per-run access token.
- Live updates, real uncommitted diffs, and task editing (CSRF-protected).
- A getting-started checklist.
- It restarts itself after an update.
- Accessibility: no serious or critical axe findings, in both themes.

### Privacy and control
- `.continuumignore`.
- Redaction:
  - common token formats;
  - long random-looking strings;
  - your own patterns;
  - zero false positives on Continuum's own source.
- `forget`, which removes data from the database file itself.
- `export` / `import`, `compact`, and `uninstall --purge`.

### Install
- One self-contained package (about 1.2 MB) for Node.js 22.13+.
- `doctor` diagnoses setup problems.
- Store schema migrations.
- CI on macOS and Linux, with a release smoke test.
