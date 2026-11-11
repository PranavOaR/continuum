# Handoff benchmark

When an agent starts a session, can it answer what the last one would have told it? This benchmark puts that question to a real model, with and without Continuum.

## Results

<!-- results:start -->
Run on 2026-11-11 with `claude-opus-5-5`, through the `claude` CLI.

| Scenario | With Continuum | Without memory |
|---|---|---|
| resume a half-finished task after another agent and a hand edit | 8/8 | 1/8 |
| no task recorded: pick up from the last session and pending edits | 4/4 | 1/4 |
| no task, two agents: the next step one of them named | 2/2 | 0/2 |
| a task you changed in the dashboard | 4/4 | 1/4 |
| an old decision on another task, found by a word in its body | 3/3 | 0/3 |
| a note the code moved on from: a commit by hand between sessions | 2/2 | 1/2 |
| **All questions** | **23/23 (100%)** | **4/23 (17%)** |
<!-- results:end -->

## How it works

Each scenario is a recorded history: sessions by Claude Code, Codex and Cursor, file edits, test runs, tasks, decisions, and changes made by hand between sessions. Each comes with the questions a fresh agent needs answered before it can carry on:

- What task is in progress, and what is the next step?
- Can the test that passed still be trusted, given what changed since?
- Did another agent, or a person, change something since your last session?
- Which recorded decision should you follow, even one made long ago on another task?
- Is a note from the last session about code that has since moved on?

The same questions go to Claude twice, through the `claude` CLI in an empty folder, with no tools:

- **With Continuum**: the briefing a session starts with, plus the reply of any Continuum tool a question names (`search_memory`, `get_context` with a query, recall on a prompt).
- **Without memory**: what an agent has without Continuum: the repository's files and its git history.

## What it does and does not show

- **Without memory, the model said it could not know**, rather than guessing: there was no task, check result, note or decision for it to find. The gap measures what an agent is told at the start of a session, not how careful it is.
- **An agent without memory could go and look**, by reading files or running tests. It still could not recover what was never written into the code: which test passed against which version of a file, what another agent decided, or what a person changed between sessions.
- **The full score with Continuum is partly by construction.** CI already requires every answer to be in the briefing; this benchmark measures whether a model reads it out correctly, misleading answers included.

## Scoring

An answer counts only if it contains every expected fact and none of the misleading ones (calling an out-of-date test "passed", say). The scenarios and their scoring patterns are in `scripts/eval/scenarios.ts` in the Continuum repository. CI uses the same scenarios for a stricter check of its own: every answer must be in the briefing word for word.

## Run it yourself

From a checkout of the Continuum repository, with the `claude` CLI signed in:

```bash
npm run bench:handoff
```

It makes 12 calls on your Claude account (one per scenario in each condition) and writes `docs/benchmark/results.json`. Models answer a little differently from run to run, so expect a question or two of difference.
