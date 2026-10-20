# Getting started with Continuum

About ten minutes. You need Node.js 22.13 or newer, git, and Claude Code (Codex, Cursor and GitHub Copilot in VS Code work too; see the end).

## 1. Connect a repository

```bash
cd ~/code/my-app
npx getcontinuum setup claude-code
```

This records the repository's current files in `.continuum/` (kept out of git through `.git/info/exclude`). It also writes two project-scoped files and nothing in `~/.claude`:
- `.claude/settings.local.json` holds the hooks.
- `.mcp.json` holds the MCP server.

Check it with:

```bash
npx getcontinuum doctor
```

## 2. Work in Claude Code

Start Claude Code in the repository and approve the `continuum` MCP server when it asks. Then work as usual. Continuum records:
- the session, and the files Claude edits;
- tests, lint and build commands Claude runs, with their exit codes (labelled *observed: run by an agent*);
- Claude's last message in each turn (*agent-reported*);
- commits.

Ask Claude to "start a Continuum task for this". It then records the task with `start_task` (objective, steps, next action) and keeps it current with `update_task`.

For a result you can trust, record a check yourself:

```bash
npx getcontinuum run -- npm test
```

That result is *verified*: it is tied to the exact content of every file it ran against. If you edit a covered file afterwards, the check is reported as **out of date**, naming the file.

## 3. Hand off

Stop the session, and later start a new one. Its first message already knows:
- what changed since the last session;
- the task and its next step;
- which checks still hold, and which decisions apply.

You can see the same briefing yourself:

```bash
npx getcontinuum handoff
```

## 4. Open the dashboard

```bash
npx getcontinuum serve
```

Open the printed link. It carries a one-time access token, and the dashboard listens on 127.0.0.1 only. You'll see:
- tasks, which you can edit (your changes are labelled *set by you*);
- changed files with their uncommitted diffs;
- checks and decisions;
- activity, updated live.

## 5. Bring in another agent

```bash
npx getcontinuum setup codex    # trust the project in Codex, then review the hooks with /hooks
npx getcontinuum setup cursor   # enable the server in Cursor's Settings → MCP
npx getcontinuum setup vscode   # trust the workspace in VS Code, then start the continuum server
```

A Codex session picks up the same task where Claude stopped. For agents without hooks, use `continuum session start --agent <name>` with `continuum start`.

## Control what is recorded

| Tool | What it does |
|---|---|
| `.continuumignore` | Keeps paths out of everything Continuum records. |
| `continuum config` | Turns agent-run checks off, or prompt capture on. |
| `continuum forget` | Permanently removes data. |
| `continuum export` / `continuum import` | Moves the history between machines. |
| `continuum uninstall --purge` | Removes Continuum and leaves the repository as it was. |
