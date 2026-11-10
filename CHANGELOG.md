# Changelog

## [0.5.0] - 2026-11-10

### Added
- **A warning beside a note the code has moved on from.** When a file a session changed has since been changed by hand (committed or not), by another agent's session, or deleted, the briefing says so under that session's note, names each file and who changed it, and asks the next agent to check the note against the code. The next step a stale note named carries the same warning, and so does each earlier session listed. It is judged per file the session changed, against the code as it is now, so unrelated commits raise nothing and uncommitted edits are caught. Thanks to a reader on LinkedIn for the case.
- **Search memory.** `search_memory` (MCP) and `continuum search <words>` find decisions, known issues, failed attempts, tasks and session notes by the words in them, including old ones on other tasks that a briefing no longer shows. Each result carries its evidence label, when it was recorded, the task and code it belongs to, and whether that code changed since. `get_context` takes a `query`: a decision or note holding those words ranks higher, whichever task it was recorded on, and the line says which words matched. Results are masked by the repository's redaction patterns as they are now, and show nothing `.continuumignore` lists. Records you resolved are still found, and say so. Search reads what Continuum already holds in memory, so it adds no index and nothing to the install; SQLite's FTS5 is not used, because Node.js 22.13 and 22.14 ship without it.
- **`continuum why <file>` or `<file>#<symbol>`.** Lists what is recorded about a piece of code: the decisions anchored to it, the tasks and agent sessions that changed it and the checks that ran against it, each with its evidence label.
- **A warning when a task is closed with unverified work.** When an agent marks a task completed while a check on that task's files failed, or passed against code that has changed since, the reply to `update_task` names the check and the command that records a fresh result. The task still closes: it never blocks. A task with no recorded files lists every failed or out-of-date check.
- **`continuum check`**, for a pre-commit hook. It lists the recorded decisions whose anchored file or symbol the staged changes alter, so a commit that quietly undoes one is seen before it lands. A symbol anchor ignores staged edits elsewhere in its file. It exits 0 whatever it finds, and when it cannot look (Continuum not set up, a config it cannot read) it says why on stderr and still exits 0, so it never stops a commit; `--strict` exits 1 in either case.
- **A personal profile.** Preferences that should hold in every repository ("Use pnpm, never npm") live in `profile.json` in Continuum's per-user folder, never in a repository. Every briefing opens with them, labelled set by you, including a new repository's first session. Edit them with `continuum profile`, `profile add "<text>"` and `profile remove <number>`, or on the dashboard's Settings page. Secrets are masked before a preference is saved, and each repository's own redaction patterns apply when its briefing is built. `doctor` warns about a profile it cannot read; briefings then leave it out instead of failing.
- **Repository settings in the dashboard.** Settings shows each repository's switches (agent checks, prompt capture, receipts) and redaction patterns, and saves a change at once. Paste a sample to see it as it would be stored. A new pattern is refused, with the reason, when it will not compile, matches empty text, repeats a group that itself repeats (`(a+)+`), or runs past half a second on test text. A pattern with such a shape in `config.json` stops capture, as an invalid one already did, and `doctor` names it with the reason: capture applies patterns on the main thread of every hook, where one that backtracks for minutes would freeze the session. (`\w+\w+\w+\w+@` took 28 seconds on 300 characters.)
- **The whole activity history.** With a project chosen, the Activity page reads its history a page at a time, back to the first recorded event, filtered by type, agent and date. It used to stop at the newest 200 events.
- **Report a problem in one step.** A failing `doctor` ends with `continuum doctor --report --open`, which opens a new issue on the plugin repository with the scrubbed report filled in. The dashboard's Settings page has the same link. Nothing is submitted until you press the button on GitHub; a report too long for a link is asked for instead. The plugin repository gains issue templates for bug reports and feature requests.

### Changed
- `scripts/windows-e2e.mjs --registry npm` and the Windows end-to-end workflow's `registry: npm` input play a Windows user against the package npm really serves and the public plugin repository, not only a private registry. 0.4.0 passes it on Node 22.13 and 24.
- The dashboard accepts writes to settings and your profile through the same access, origin and CSRF checks as task edits.

## [0.4.0] - 2026-11-09

### Added
- **Windows.** Continuum runs on native Windows, with no WSL. `setup` no longer refuses there, and `doctor` no longer fails. For Claude Code, Codex, Cursor and VS Code, setup writes `cmd /c npx -y getcontinuum@<version>`, since agents cannot start npx's `.cmd` shim without a shell; because that line works only on Windows, those files are kept out of git. CI runs the unit tests and the release smoke test on Windows, macOS and Linux.
- **A banner when Continuum starts.** `continuum`, `setup`, `start` and `serve` open with the Continuum wordmark in block letters, the version and a reminder that everything stays on this machine. It shows only to someone at a terminal 68 columns or wider: agents, pipes, CI and `mcp` output are unchanged, `NO_COLOR` turns its colour off, and `serve` shows it once, not again after an automatic restart.
- **Create and correct from the dashboard.** New task starts a task now or plans it for later; starting one pauses the task in progress. The memory panel adds a decision or known issue to the task on screen. Each record has **Resolved**, which takes it out of briefings, `get_context` and the attention list while keeping it on the page to reopen, and **Still valid**, which vouches for it against today's code, so a stale warning clears and the next change to that code raises it again. What you write is labelled set by you in the dashboard and in what agents read; reviewing an agent's record records your verdict beside it and leaves its text under the agent's label. Everything you type is masked by the repository's redaction rules before it is stored, and goes through the same access and CSRF checks as task edits. Records added here anchor to no code.

### Changed
- **The Claude Code plugin no longer needs `sh`.** Its hooks and MCP server start a small launcher with `node`, with no shell, which skips at once in a repository without a `.continuum` store and otherwise runs the plugin's copy of the CLI in the same process. A hook in a repository without Continuum now takes about 40 ms instead of 10 ms on a Mac; Continuum's own hooks are as fast as before.
- **VS Code hooks carry a PowerShell command** beside the POSIX one, and VS Code runs it on Windows. PowerShell cannot hand the payload to a background program, so on Windows file edits and task updates are recorded before Copilot moves on (other tools still start nothing).
- `serve` opens the dashboard in your browser on Windows too.
- `continuum run -- npm test` starts tools that Windows installs as `.cmd` shims, such as npm, npx and pnpm, with every argument passed through intact (through cross-spawn).
- `continuum serve` stops listing connected repositories whose folders are gone, and says so once in one line, instead of repeating a `skipping` line for each on every start and advising a `setup` that could not work. If you moved one, run `setup` in its new location. A port already in use now names another `continuum serve` as the likely cause.
- **The Handoffs page is now Briefings.** It shows the text `continuum handoff` prints for a project, with a copy button and its estimated size in tokens, and it says how the shorter version agents get at session start differs. Connected agents were already briefed automatically, so the handoff text the browser built for itself, with its status tracking and history, is gone, and so are the agent and context defaults in Settings. Old links open the new page, and your other preferences are kept. The stored handoff history is deleted from your browser the next time the dashboard opens, and it cannot be brought back; a briefing is always rebuilt from the records. Settings now has one reset, for preferences.
- What you write now reads as yours everywhere: ranked context, the memory graph and the "since you left" section of a briefing used to call every task and record agent-reported.
- A record that belongs to no task shows with every task in the memory panel.
- The overview's fourth card counts what needs attention, in place of pending handoffs. Each project has one View Briefing button in place of Prepare Handoff.

### Fixed
- **Two sessions in one repository no longer cross, in Claude Code or Codex.** `record_decision`, `update_task` and `get_context` used the repository's newest task, so a decision could land on the other agent's task, and `update_task` without a `task_id` could mark the other agent's task complete. Each now acts on the task its own session started. A session that has not started one joins the repository's current task, as its briefing asks, and so does one past `/clear` until it starts a task. The exception is a task another session took up and has not finished with: `update_task` is refused unless it names that task with `task_id`, and the reply says how to go on, and `start_task` leaves that task in progress instead of pausing it. That session stops counting when it ends, or an hour after its last reply or the last update to the task, so a session that crashed lets go of it by itself. Agents that report no end, such as Copilot in VS Code, hold a task the same way, so a session continuing from one names the task once. Codex sessions follow the same rules: Codex names its session on each tool call, and Continuum reads it there. Continuum cannot yet tell which Copilot in VS Code or Cursor session is calling, so they are not held back.
- **A resumed session is running again.** Once a session had ended it stayed ended, so briefings and the dashboard showed it ended while it worked, and its MCP tools fell back to the repository's newest task. A resume is now recorded even after a crash, an end from the earlier run that is recorded late no longer closes it, and the activity feed says it resumed.
- The activity feed no longer adds "Session took up a task" on every `update_task` for a task the session already has.

## [0.3.0] - 2026-11-04

### Changed
- Releases publish to npm through npm trusted publishing, with no stored npm token, and the Claude Code plugin repository is updated by the same release run, so the plugin no longer lags npm (it was still at 0.2.1). The package now names its source repository, as trusted publishing requires.
- The website sends a strict Content-Security-Policy: everything it loads comes from its own origin.
- **Clearer verification in the dashboard.** Each check in the Verification panel shows how many of the files its latest run covered have changed since ("2 of 38 covered files changed since it ran"). A check whose name now runs a different command is marked **Command changed** and names the earlier command, as briefings already did. A file's drawer lists the checks that covered it, each with its result, when it last ran and whether this file changed since.
- `continuum serve` opens the dashboard in your browser when run from a terminal (`--no-open` to skip; never from scripts or CI, and not again after an automatic restart). The browser is handed a private page that redirects to the sign-in link, so the access token never appears in a command line other users could read. `setup` ends with the command that opens the dashboard.
- On a phone, a project shows one Prepare Handoff button instead of two, long branch names end in an ellipsis, and task tabs fade at the edge where more are hidden.
- **The dashboard shows work without a task.** A repository counted as active only while it had an open task, so the overview read "No active projects" minutes after agents worked in it. Active now means an open task or anything recorded in the last 7 days, and a project without a task shows its latest session: the agent, its note and when. A repository connected but not used yet is listed with what to do next.
- Truthful copy on live screens: a project no agent has worked in says "None yet" instead of "Other agent", and a connected one is no longer told to run `setup`; empty panels no longer mention a task that does not exist; the verification note says where verified and observed results come from; Settings names the real default theme; the Handoffs page explains that connected agents are briefed automatically. Project paths under your home folder are written with `~`. "Idle" is now "No task". Activity in a project is listed newest first, like everywhere else, and the live dashboard no longer shows a demo account menu. An end-to-end check fails if demo or prototype wording appears on a live screen.
- **Briefings name agents and lead with the next step.** Sessions read "Claude Code session" and "Codex session" instead of their ids (an agent Continuum does not know keeps its id). With no task, a briefing opens with the next step the most recent note names ("Next: add a test for empty names"), labelled agent-reported and with the session it came from. A task keeps its own next action. A new briefing-quality scenario covers it.

### Fixed
- A handoff copied from the live dashboard was labelled "Generated by the Continuum demo from mock data", though it held your real records. Only the demo says that now.
- The dashboard knew only about Claude Code's hooks, so a repository connected to Codex, Cursor or VS Code, or through the Claude Code plugin, was told to connect an agent. Getting started now sees every agent, and its steps fit the agent you connected: Claude Code's steps no longer appear for other agents, and only Claude Code is said to record test runs automatically.
- Website: missing pages ask search engines not to index them. Links in the docs leave modified clicks, new-tab links and downloads to the browser. Escape on the phone menu returns focus to its button. Arriving at a section link scrolls there again once images have loaded. The privacy page and the `forget` docs say exactly what happens, and the demo film's length is right (1:14).
- **A redaction pattern that cannot be used now stops capture.** A `redactPatterns` entry that is not a valid regular expression, or is longer than 200 characters, was skipped and only `doctor` warned, so what it was meant to mask was stored. Continuum now records nothing until it is fixed, as it already did for a config it cannot read, and `doctor` names the pattern.
- A check run under an existing name with a different command (`continuum run --name tests -- true`) took over the old check's result silently. The briefing now marks it `COMMAND CHANGED` and names the earlier command, on every run until the name runs that command again. `setup` also checks the config before writing anything, so a pattern it cannot use no longer leaves setup half-done.
- `@modelcontextprotocol/sdk` 1.32.2 and `npm audit fix` clear the advisories against `fast-uri` (bundled) and `body-parser`.

### Added
- **A receipt after each reply.** When a Claude Code reply edited files or ran checks, Claude Code now shows one line from Continuum: "Continuum recorded 2 file edits and `npm test` (passed) for the next session." Replies that recorded nothing stay silent. It counts only this session's own edits and checks since its previous reply. Turn it off with `continuum config receipts off`. Other agents get no receipt until their display of hook messages is confirmed.
- **`continuum doctor --report`** prints a Markdown report to attach to an issue: Continuum, Node.js and platform versions, how it is installed, every `doctor` finding, the store's schema, size and event counts by type, settings (the number of redaction patterns, not the patterns) and each agent's hook health. The repository is shortened to `<repo>` and your home folder to `~`, and secrets are masked. It holds none of your code, prompts, tasks or decisions. Pipe it to a file or the clipboard: `npx getcontinuum doctor --report | pbcopy`.
- `setup claude-code` and `doctor` warn when the Continuum plugin is also enabled for the repository, since every hook would then run twice, and say how to keep only one.

## [0.2.1] - 2026-10-31

### Fixed
- **Your own `redactPatterns` now apply everywhere.** `continuum start`, `scan`, `session`, `init` and `setup` recorded diff excerpts, commit messages and session notes with only the built-in rules, so a pattern you added (a customer or ticket id, say) could still be stored. Every path now masks with the repository's own patterns, and one repository's patterns never apply to another's.
- A `.continuum/config.json` that cannot be read (a trailing comma, say) silently fell back to the defaults, dropping your redaction patterns, and the next `continuum config` overwrote it. Continuum now records nothing until the config is fixed, `config` refuses to overwrite it, settings it does not know are kept, and `doctor` names the problem and any pattern that is not a valid regular expression.
- A `.continuumignore` that exists but cannot be read meant nothing was ignored. Continuum now records nothing until it can read it.
- A next action typed in the dashboard was stored as typed; it is now redacted like everything an agent records.

### Added
- **Hook health.** Hooks stay quiet so they never disturb the agent, which also hid a broken one. Each hook that reaches Continuum now notes its arrival, and any failure with its reason. `doctor` fails when an agent's last hook failed and warns when a connected agent has sent none; `status` shows when each agent's hooks last arrived.
  - git that cannot run in a Continuum repository (on macOS, before the Xcode license is accepted) is reported instead of the repository being skipped, and the plugin's hooks still start Continuum so it can say so.

### Changed
- The dashboard served by `continuum serve` no longer downloads the sample dataset.

## [0.2.0] - 2026-10-22

### Changed
- **Continuum is now proprietary software, free to use** for personal and commercial work, under the Continuum Software License (LICENSE). It is no longer open source; versions up to 0.1.2 remain available under the MIT License.
- The package ships `THIRD_PARTY_NOTICES.md`, the licenses of the open-source packages it bundles, and its own README for users.
- The Claude Code plugin installs from a new public repository: `/plugin install continuum --marketplace PranavOaR/continuum-plugin`. Report bugs there.
- **Faster plugin hooks.** The plugin carries its own copy of the CLI and starts it with `node` instead of `npx`, which added about half a second to every hook. Session start and the end of each turn, which Claude Code waits for, now take about 0.1 s.
- Codex and Copilot sessions, the Cursor rule and the Copilot instructions ask the agent to run tests, lint and builds through `continuum run`, so their results are recorded as verified. These agents report no exit codes, so their own runs are not recorded.
- `setup` refuses to run on Windows, and `doctor` reports it, with a pointer to WSL 2: the hooks need a POSIX shell. Before, setup succeeded and the hooks never ran.
- Dashboard: <kbd>⌘K</kbd> opens a command palette (pages, projects and actions, then search results); dialogs open centred, with focus in their first field; surfaces gain elevation, and the common "observed" label is quieter so the stronger labels stand out.

### Added
- **GitHub Copilot in VS Code** (`setup vscode`): Copilot's agent mode gets the MCP server (`.vscode/mcp.json`), agent hooks (`.github/hooks/continuum.json`) and instructions for every chat (`.github/instructions/continuum.instructions.md`).
  - Each chat starts briefed on where the work left off.
  - Copilot's edits (`create_file`, `replace_string_in_file`, `multi_replace_string_in_file`, `apply_patch` and the rest) and task updates are recorded.
  - VS Code runs its `PostToolUse` hook for every tool, so the hook starts Continuum only for those tools, in the background, and never holds Copilot up.
  - `doctor`, `setup vscode --remove` and `uninstall` cover it.
  - VS Code reports no exit codes and no session end to hooks, so its test runs are not recorded as checks, and its sessions stay open.

### Fixed
- `uninstall` without `--purge` said only Claude Code was disconnected; it disconnects every agent.
- `continuum import` refused any history holding a task edited in the dashboard ("malformed events"), so moving such a repository's history to another machine failed.

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
