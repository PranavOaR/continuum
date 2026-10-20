# Changelog

## [Unreleased]

### Changed
- **Continuum is now proprietary software, free to use** for personal and commercial work, under the Continuum Software License (LICENSE). It is no longer open source; versions up to 0.1.2 remain available under the MIT License.
- The package ships `THIRD_PARTY_NOTICES.md`, the licenses of the open-source packages it bundles, and its own README for users.
- The Claude Code plugin installs from a new public repository: `/plugin install continuum --marketplace PranavOaR/continuum-plugin`. Report bugs there.

### Added
- **GitHub Copilot in VS Code** (`setup vscode`): Copilot's agent mode gets the MCP server (`.vscode/mcp.json`), agent hooks (`.github/hooks/continuum.json`) and instructions for every chat (`.github/instructions/continuum.instructions.md`).
  - Each chat starts briefed on where the work left off.
  - Copilot's edits (`create_file`, `replace_string_in_file`, `multi_replace_string_in_file`, `apply_patch` and the rest) and task updates are recorded.
  - VS Code runs its `PostToolUse` hook for every tool, so the hook starts Continuum only for those tools, in the background, and never holds Copilot up.
  - `doctor`, `setup vscode --remove` and `uninstall` cover it.
  - VS Code reports no exit codes and no session end to hooks, so its test runs are not recorded as checks, and its sessions stay open.

### Fixed
- `uninstall` without `--purge` said only Claude Code was disconnected; it disconnects every agent.

## [0.1.2] - 2026-10-19

### Fixed
- `start_task` with the title of an unfinished task resumes that task instead of creating a duplicate. An agent continuing another agent's work (for example Codex after Claude Code) sometimes calls `start_task` instead of `update_task`; the work used to split across two tasks, with the first one set back to planned. The resumed task keeps its finished steps and met criteria, and gains any new steps and criteria.
- Symbol anchors work in more React files: a self-closing JSX tag after an `{expression}` on the same line (`<C d={e} />}</div>`) no longer makes the whole file unreadable to the symbol scanner, which then fell back to file-level anchors.

## [0.1.1] - 2026-10-19

### Renamed
- The package is now **`getcontinuum`**: run `npx getcontinuum setup claude-code`. The command it installs is still `continuum`. `@pranavoar/continuum` is deprecated and points here.

### Fixed
- Briefings date commits by git, not by when a scan noticed them, so a commit made before a session is no longer listed under it, or as news since an agent's last session.
- `setup` records the files it writes, so `.codex/` and `.cursor/` files are no longer reported as changes no agent session explained.
- The Claude Code plugin's hooks read their payload before skipping a repository that doesn't use Continuum, avoiding `EPIPE` errors with large payloads.
- `--help` and `uninstall` say `setup` and `uninstall` cover Claude Code, Codex and Cursor.

## [0.1.0] - 2026-10-18

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
