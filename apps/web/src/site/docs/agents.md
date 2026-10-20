# Agents

Continuum connects to each agent per repository. It never writes to your global agent settings.

## Claude Code

```bash
npx getcontinuum setup claude-code
```

Writes the hooks to `.claude/settings.local.json` and the MCP server to `.mcp.json`. Start Claude Code in the repository and approve the `continuum` server. Every session then starts with a briefing, and edits, test runs, tasks and commits are recorded as you work.

You can install the **Claude Code plugin** instead, which brings the hooks, the MCP server and a `/continuum:handoff` command in one step. Its hooks do nothing in repositories that don't use Continuum.

## Codex

```bash
npx getcontinuum setup codex
```

Writes `.codex/hooks.json` and a marked block in `.codex/config.toml`, never `~/.codex`. Codex loads them once you **trust the project** when it asks; then run **`/hooks`** in Codex and trust Continuum's hooks.

- Each Codex session starts briefed on where the work left off, including what Claude or another agent did since.
- Its patches are recorded as changes, and its last message as an agent-reported note.
- It can use the same MCP tools: `start_task`, `update_task`, `get_context`, `record_decision`.

Codex does not tell hooks a command's exit code, so its test runs are not recorded as checks. Run them with `continuum run -- <command>` for verified results.

## GitHub Copilot in VS Code

```bash
npx getcontinuum setup vscode
```

Connects Copilot's agent mode in VS Code. It writes three files in the repository, never your VS Code profile:
- `.vscode/mcp.json`: the `continuum` MCP server.
- `.github/hooks/continuum.json`: agent hooks that brief each chat and record Copilot's edits.
- `.github/instructions/continuum.instructions.md`: instructions for every chat, to keep the task current.

Open the repository in VS Code, **trust the workspace**, and start the `continuum` server when VS Code offers to (or with **MCP: List Servers**).
- Each Copilot agent chat starts briefed on where the work left off, including what Claude Code, Codex or a hand edit did since.
- Copilot's file edits are recorded as changes. Reads, searches and terminal commands don't start Continuum at all, so they cost nothing.
- It can use the same MCP tools: `start_task`, `update_task`, `get_context`, `record_decision`.

Agent hooks are a preview in VS Code (1.109 or newer, `chat.useHooks` on), and an organization can turn them off. Without them, the instructions ask Copilot to call `get_handoff` itself. VS Code does not tell hooks a command's exit code, and it has no end-of-session event, so Copilot's test runs are not recorded as checks and its sessions stay open. Run tests with `continuum run -- <command>` for verified results.

## Cursor

```bash
npx getcontinuum setup cursor
```

Adds the `continuum` MCP server to `.cursor/mcp.json` and an always-applied rule, `.cursor/rules/continuum.mdc`. Enable the server in Cursor's **Settings → MCP**. The rule asks Cursor's agent to read the handoff first, keep the task current, and record decisions.

Cursor has no hooks Continuum uses, so to capture its edits, open a session as described below.

## Any other agent or chat

```bash
npx getcontinuum session start --agent cursor   # prints a briefing to paste in
npx getcontinuum start                          # in another terminal: records file changes
npx getcontinuum session note "Parser done; tests next"
npx getcontinuum session end --summary "Parser rewritten, tests pass"
```

While a session is open, file changes are attributed to it. Notes and summaries are labelled agent-reported, like an agent's own messages.

## Removing an agent

`setup <agent> --remove` takes one agent out again. `uninstall` disconnects every agent, and `uninstall --purge` also deletes `.continuum/`.
