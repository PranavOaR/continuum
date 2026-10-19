# What gets recorded

Everything stays on your machine, in `.continuum/` at the repository root. Continuum calls no AI service and no server of its own.

## What Continuum records

With an agent connected, Continuum records:

- **sessions**, and the files each agent edits;
- each agent's **last message** in a turn, labelled *agent-reported*;
- **tasks**, which agents keep through the MCP tools;
- your **commits**;
- the **tests, lint, typecheck and build commands** Claude Code runs, labelled *observed (run by an agent)*. Commands whose exit code is hidden by a pipe, `;` or `||` are skipped.

What you type to agents is **not** recorded unless you turn it on.

Handoffs also list **changes no agent session made**, so the next agent asks about them instead of assuming.

## How each claim is labelled

| Label | Meaning |
|---|---|
| **verified** | A check Continuum ran itself (`continuum run`), tied to the exact files it covered. It goes out of date when one of them changes. |
| **observed** | An agent ran it, and Continuum saw the exit code. |
| **agent-reported** | An agent said so. A note, not proof. |
| **set by you** | You changed it in the dashboard. |

## How to control it

| Control | What it does |
|---|---|
| `.continuumignore` | Paths, in gitignore syntax, that are never hashed, recorded, diffed or put in a handoff. |
| `continuum config` | `agent-checks off` stops recording agent-run checks. `prompts on` records what you type to agents, redacted, with pasted blocks dropped. |
| `redactPatterns` | Extra regular expressions to mask, in `.continuum/config.json`, on top of built-in rules for common token formats and long random-looking strings. |
| `continuum forget` | Permanently removes data. `--path <p>` removes everything about a file or folder, `--session <id>` what a session said and was asked (its file changes stay, no longer attributed to it), and `--before <date>` the prompts, notes, summaries and check output recorded before that date. The database is rewritten, so the text is gone from the file itself. |
| `continuum export` · `import` | Moves the history between machines as JSON. |
| `continuum uninstall --purge` | Disconnects every agent and deletes `.continuum/`. |
