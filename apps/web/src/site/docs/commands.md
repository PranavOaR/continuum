# Commands

Run any command with `npx getcontinuum <command>`, from inside the repository. `-C <dir>` runs it as if started in another directory.

## Set up

| Command | What it does |
|---|---|
| `setup claude-code` | Connects Claude Code to this repository. `setup codex`, `setup cursor`, `setup vscode` (GitHub Copilot in VS Code) and `setup antigravity` (Antigravity CLI) connect those agents. `--remove` undoes it. |
| `init` | Sets up Continuum in this git repository and records its files, without connecting an agent. |
| `doctor` | Checks the install and this repository's setup, including hooks that never arrive or fail, and says how to fix each problem. `doctor --report` prints the same checks as a Markdown report to attach to an issue: versions, settings and counts, with your paths shortened and secrets masked, and none of your code, prompts, tasks or decisions. `doctor --report --open` opens a new issue in your browser with that report filled in; nothing is submitted until you press the button there. |
| `update` | Points every agent connected in this repository at the version you run it with, so run it as `npx getcontinuum@latest update`. `--all` does every connected repository. `setup` pins a version, so a release reaches your agents only after this. |
| `uninstall` | Disconnects every agent. `--purge` also deletes `.continuum/`. |

## While you work

| Command | What it does |
|---|---|
| `run -- <command>` | Runs a check (tests, lint, build) and records it as **verified**. `--name <check>` names it. |
| `start` | Watches the repository and records changes until Ctrl-C. |
| `scan` | Records the changes since the last scan, once. |
| `status` | Shows tracked files, unrecorded changes, when each agent's hooks last arrived, and check results. |
| `session start` · `note` · `end` | Records a session for an agent without hooks, or a chat. |

## Hand off and review

| Command | What it does |
|---|---|
| `handoff` | Prints where the project left off, for any agent or chat. |
| `search <words ...>` | Searches recorded decisions, known issues, attempts, tasks and session notes for those words, best match first, each with its evidence label. `--limit <n>` changes how many (10). |
| `why <file>` · `why <file>#<symbol>` | Lists what is recorded about a piece of code: decisions anchored to it, tasks and sessions that changed it, and checks that ran against it. |
| `share` · `share <id>` · `share --all` | Shares decisions, known issues and previous attempts with your team through `.continuum-decisions.json`, a file you commit and review like code. `share` lists what you can share with a short id; `share <id>` writes that record to the file (`--all` writes every one you have not resolved; `--remove <id>` takes one back out). Each teammate's clone takes the file in at its next scan, so their agents' briefings carry it. Nothing else leaves your clone. |
| `check` | For a pre-commit hook: lists recorded decisions whose anchored code the staged changes alter. Exits 0 whatever it finds; `--strict` exits 1 when it lists any. |
| `serve [repo ...]` | Opens the dashboard for every connected repository, or the ones you name, on 127.0.0.1: it prints its sign-in link and opens it in your browser (`--no-open` to skip). |

## Your data

| Command | What it does |
|---|---|
| `profile` | Shows your preferences for every repository, which every briefing carries labelled set by you. `profile add "Use pnpm, never npm"` adds one; `profile remove <number>` removes one. They are kept in Continuum's per-user folder, outside any repository. |
| `config` | Shows settings. `config agent-checks off` stops recording agent-run checks; `config prompts on` records what you type to agents, redacted; `config receipts off` hides the line Claude Code shows after a reply that recorded something. `config recall off` stops adding the recorded decisions your words point to on each prompt; `config reflection on` asks Claude Code to record its decisions once per session. `config update-check off` stops the once-a-day question to npm about a newer version; it is your setting, for every repository. |
| `forget` | Permanently removes recorded data: a file or folder's changes, its place in checks, decisions and commits, and its name in any text (`--path <p>`; those decisions and checks stay), what a session said and was asked (`--session <id>`), or the prompts, notes and check output from before a date (`--before <date>`). |
| `export <file>` · `import <file>` | Moves the whole history between clones or machines as JSON. |
| `compact` | Folds events older than 30 days into a checkpoint (`--keep-days <n>`). |

Agents use two more commands themselves: `mcp` (the MCP server) and `ingest` (hook payloads).
