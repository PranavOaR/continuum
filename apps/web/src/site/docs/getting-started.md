# Getting started

About ten minutes. You need **Node.js 22.13 or newer**, **git**, and Claude Code, Codex, Cursor or GitHub Copilot in VS Code. It runs on macOS and Linux; on Windows, use WSL 2.

## 1. Connect a repository

```bash
cd ~/code/my-app
npx getcontinuum setup claude-code
```

This records the repository's current files in `.continuum/`, which is kept out of git. It also writes two project files, and nothing in your global Claude Code settings:

- `.claude/settings.local.json`, with the hooks;
- `.mcp.json`, with the MCP server.

Using Codex, Cursor or Copilot in VS Code? Run `setup codex`, `setup cursor` or `setup vscode` instead; see [Agents](/docs/agents). To check everything is wired up:

```bash
npx getcontinuum doctor
```

## 2. Work as usual

Start Claude Code in the repository and approve the `continuum` MCP server when it asks. Then work the way you always do. Continuum records:

- the session, and the files Claude edits;
- the tests, lint and build commands Claude runs, with their exit codes;
- Claude's last message in each turn, labelled *agent-reported*;
- your commits.

Ask Claude to "start a Continuum task for this". It records the task with `start_task` (the objective, the steps and the next action) and keeps it current with `update_task`.

For a result you can trust, run a check through Continuum:

```bash
npx getcontinuum run -- npm test
```

That result is **verified**: it is tied to the exact content of every file it ran against. Edit one of them later and the result is reported as **out of date**, naming the file.

## 3. Hand off

End the session, and later start a new one, in Claude Code or another agent. Its first message already knows:

- the task and its next step;
- what changed since that agent last worked;
- which checks still hold, and which decisions apply.

You can read the same briefing yourself:

```bash
npx getcontinuum handoff
```

## 4. Open your dashboard

```bash
npx getcontinuum serve
```

It prints a private sign-in link. Open it to see every connected repository: tasks (which you can edit), changed files with their diffs, checks, decisions and live activity. The dashboard runs on your machine, on 127.0.0.1 only, and the link's one-time token is what signs you in.
