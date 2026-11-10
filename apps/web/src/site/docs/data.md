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
| **set by you** | You set it in the dashboard: a task you created or changed, a decision or known issue you added, or a record you marked resolved or still valid. A resolved record stays on the page and leaves what agents are told. |

## How to control it

| Control | What it does |
|---|---|
| `.continuumignore` | Paths, in gitignore syntax, that are never hashed, recorded, diffed or put in a handoff. |
| `continuum config` | `agent-checks off` stops recording agent-run checks. `prompts on` records what you type to agents, redacted, with pasted blocks dropped. `receipts off` hides the line Claude Code shows after a reply that recorded something ("Continuum recorded 2 file edits and `npm test` (passed) for the next session."). |
| `redactPatterns` | Extra regular expressions to mask, in `.continuum/config.json` or on the dashboard's Settings page, which shows what a pattern would mask in a sample and refuses one that will not compile or could hang, with the reason. They sit on top of built-in rules for common token formats and long random-looking strings. They apply to everything recorded from the repository, including what you type in the dashboard. If the config or `.continuumignore` cannot be read, Continuum records nothing until it is fixed; `doctor` says what is wrong. |
| `continuum forget` | Permanently removes data. `--path <p>` removes a file or folder's changes, its place in checks, decisions and commits, and its name in any text (those decisions and checks stay), `--session <id>` what a session said and was asked (its file changes stay, no longer attributed to it), and `--before <date>` the prompts, notes, summaries and check output recorded before that date. The database is rewritten, so the text is gone from the file itself. |
| `continuum export` · `import` | Moves the history between machines as JSON. |
| `continuum uninstall --purge` | Disconnects every agent and deletes `.continuum/`. |
