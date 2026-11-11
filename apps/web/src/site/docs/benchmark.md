# Handoff benchmark

When an agent starts a session, can it answer what the last one would have told it? This benchmark puts that question to a real model, with and without Continuum.

## Results

<!-- results:start -->
Not run yet.
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

An answer counts only if it contains every expected fact and none of the misleading ones (calling an out-of-date test "passed", say). The scenarios and their scoring patterns are in `scripts/eval/scenarios.ts` in the Continuum repository. CI uses the same scenarios for a stricter check of its own: every answer must be in the briefing word for word.

## Run it yourself

From a checkout of the Continuum repository, with the `claude` CLI signed in:

```bash
npm run bench:handoff
```

It makes about 14 calls on your Claude account and writes `docs/benchmark/results.json`. Models answer a little differently from run to run, so expect a point or two of difference.
