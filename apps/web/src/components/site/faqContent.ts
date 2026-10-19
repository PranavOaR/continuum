/** Questions a new visitor asks, with answers that hold for the current release. Backticks mark code. */
export const FAQ = [
  {
    question: 'Does my code leave my machine?',
    answer:
      'No. Continuum stores everything in `.continuum/` inside your repository and calls no AI service or server of its own. Your agents keep working exactly as they do now. The dashboard listens on 127.0.0.1 only, behind a private sign-in link.',
  },
  {
    question: 'Which agents does it work with?',
    answer:
      'Claude Code (hooks and MCP server, or the Claude Code plugin), Codex (hooks and MCP server) and Cursor (MCP server and an always-applied rule). Any other agent or chat can still leave a trail with `continuum session` and read `continuum handoff`.',
  },
  {
    question: 'Is it free?',
    answer: 'Yes. It is open source under the MIT license, with no account and no sign-up.',
  },
  {
    question: 'What do I need?',
    answer: 'Node.js 22.13 or newer, git, and a git repository. It is tested on macOS and Linux; Windows is not tested yet.',
  },
  {
    question: 'What exactly does it record?',
    answer:
      'Sessions, the files agents edit, the tests, lint and builds they run with their exit codes, tasks the agents keep through MCP, and your commits. What you type to agents is recorded only if you turn it on. The data docs list every detail and how to switch each part off.',
    link: { to: '/docs/data', label: 'What gets recorded' },
  },
  {
    question: 'How is this different from a CLAUDE.md or a pasted summary?',
    answer:
      'Those are written by hand and go stale. Continuum records what actually happened, labels every claim with how it knows (verified, observed, agent-reported or set by you), and tells the next agent which test results still hold for the code as it is now.',
  },
  {
    question: 'How do I remove it?',
    answer:
      '`npx getcontinuum uninstall` disconnects every agent from the repository. Add `--purge` to delete `.continuum/` as well. `continuum forget` removes specific data instead.',
  },
] as const
