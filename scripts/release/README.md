# Continuum

**Your work continues. Your agents change.**

Continuum is local project memory for AI coding agents. Every Claude Code, Codex, Cursor or GitHub Copilot (VS Code) session starts briefed on where the work left off:
- the current task and its next step;
- which test results still hold for the code as it is now;
- what another agent or a hand edit changed;
- which decisions apply.

Every claim is labelled **verified**, **observed**, **agent-reported** or **set by you**. Nothing leaves your machine.

Website and documentation: [continuumgroup.dev](https://continuumgroup.dev)

## Install

Requires Node.js 22.13+ and git. In your project:

```bash
npx getcontinuum setup claude-code   # or: setup codex, setup cursor, setup vscode
npx getcontinuum serve               # the dashboard for every connected repository
```

With Claude Code, you can install the plugin instead (hooks, MCP server and a `/continuum:handoff` command, in one step):

```
/plugin install continuum --marketplace PranavOaR/continuum-plugin
```

`npx getcontinuum doctor` diagnoses any setup problem and prints the fix.

## Agents

| Agent | Command | What it connects |
|---|---|---|
| Claude Code | `setup claude-code` | Hooks in `.claude/settings.local.json` and the MCP server in `.mcp.json`. Sessions, edits, test runs, tasks and commits are recorded. |
| Codex | `setup codex` | `.codex/hooks.json` and a block in `.codex/config.toml`. Trust the project, then review the hooks with `/hooks`. |
| GitHub Copilot in VS Code | `setup vscode` | `.vscode/mcp.json`, agent hooks in `.github/hooks/continuum.json` and instructions for every chat. Trust the workspace and start the server. |
| Cursor | `setup cursor` | The MCP server in `.cursor/mcp.json` and an always-applied rule. |
| Anything else | `session start --agent <name>` | Prints a briefing to paste in; `continuum start` records file changes meanwhile. |

Setup writes only to the repository, never to your global agent settings. `setup <agent> --remove` takes one agent out; `uninstall` disconnects all of them, and `uninstall --purge` also deletes the recorded history.

## Commands

| Command | What it does |
|---|---|
| `continuum run -- <command>` | Runs a check (tests, lint, build) and records it as **verified**, tied to the exact content of every file it ran against. Edit a covered file and the result is reported out of date. |
| `continuum handoff` | Prints the briefing, for pasting into any agent or chat. |
| `continuum status` | Tracked files, unrecorded changes and check results. |
| `continuum serve` | The dashboard on 127.0.0.1, behind a private link that changes on every run. |
| `continuum config` | Settings: `agent-checks on\|off`, `prompts on\|off` (off by default). |
| `continuum forget --path <p> \| --session <id> \| --before <date>` | Permanently removes recorded data from the database file itself. |
| `continuum export <file>` / `import <file>` | Moves the history between clones or machines. |

`continuum --help` lists every command.

## Your data

Everything is stored in `.continuum/` inside your repository, kept out of git. Continuum calls no AI service and no server of its own. `.continuumignore` keeps paths out entirely; secrets in recorded commands and output are redacted.

## Help

Report bugs and ask questions at [github.com/PranavOaR/continuum-plugin/issues](https://github.com/PranavOaR/continuum-plugin/issues). Include the output of `npx getcontinuum doctor`. CHANGELOG.md lists what is in each release.

## License

Free to use, for personal and commercial work. Continuum is proprietary software, not open source: see LICENSE. The open-source packages it includes are listed, with their licenses, in THIRD_PARTY_NOTICES.md.
