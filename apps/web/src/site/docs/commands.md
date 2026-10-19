# Commands

Run any command with `npx @pranavoar/continuum <command>`, from inside the repository. `-C <dir>` runs it as if started in another directory.

## Set up

| Command | What it does |
|---|---|
| `setup claude-code` | Connects Claude Code to this repository. `setup codex` and `setup cursor` connect those agents. `--remove` undoes it. |
| `init` | Sets up Continuum in this git repository and records its files, without connecting an agent. |
| `doctor` | Checks the install and this repository's setup, and says how to fix each problem. |
| `uninstall` | Disconnects every agent. `--purge` also deletes `.continuum/`. |

## While you work

| Command | What it does |
|---|---|
| `run -- <command>` | Runs a check (tests, lint, build) and records it as **verified**. `--name <check>` names it. |
| `start` | Watches the repository and records changes until Ctrl-C. |
| `scan` | Records the changes since the last scan, once. |
| `status` | Shows tracked files, unrecorded changes and check results. |
| `session start` · `note` · `end` | Records a session for an agent without hooks, or a chat. |

## Hand off and review

| Command | What it does |
|---|---|
| `handoff` | Prints where the project left off, for any agent or chat. |
| `serve [repo ...]` | Opens the dashboard for every connected repository, or the ones you name, on 127.0.0.1, and prints its sign-in link. |

## Your data

| Command | What it does |
|---|---|
| `config` | Shows settings. `config agent-checks off` stops recording agent-run checks; `config prompts on` records what you type to agents, redacted. |
| `forget` | Permanently removes recorded data: `--path <p>`, `--session <id>` or `--before <date>`. |
| `export <file>` · `import <file>` | Moves the whole history between clones or machines as JSON. |
| `compact` | Folds events older than 30 days into a checkpoint (`--keep-days <n>`). |

Agents use two more commands themselves: `mcp` (the MCP server) and `ingest` (hook payloads).
