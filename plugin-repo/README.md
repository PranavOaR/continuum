# Continuum for Claude Code

**Your work continues. Your agents change.**

[Continuum](https://continuumgroup.dev) is local project memory for AI coding agents. Every Claude Code, Codex, Cursor or GitHub Copilot session starts briefed on where the work left off: the current task and its next step, which test results still hold for the code as it is now, what another agent or a hand edit changed, and which decisions apply. Nothing leaves your machine.

This repository holds the Claude Code plugin only: its hooks and MCP server run the published [`getcontinuum`](https://www.npmjs.com/package/getcontinuum) package through `npx`.

## Install

In Claude Code:

```
/plugin install continuum --marketplace PranavOaR/continuum-plugin
```

Then, in each repository you want Continuum to remember:

```bash
npx getcontinuum setup claude-code
```

The plugin's hooks do nothing in repositories that don't use Continuum. It also adds a `/continuum:handoff` command. Requires Node.js 22.13+ and git.

Other agents connect with `npx getcontinuum setup codex`, `setup cursor` or `setup vscode`. The [documentation](https://continuumgroup.dev/docs) covers each one.

## Help and bug reports

[Open an issue](https://github.com/PranavOaR/continuum-plugin/issues) here. `npx getcontinuum doctor` diagnoses most setup problems; include its output.

## License

Continuum is free to use, for personal and commercial work. It is proprietary software, not open source: see [LICENSE](LICENSE).
