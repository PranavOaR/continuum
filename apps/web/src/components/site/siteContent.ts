/** What the public website says about installing and running Continuum, in one place. */

export const PACKAGE_NAME = 'getcontinuum'
export const DASHBOARD_COMMAND = `npx ${PACKAGE_NAME} serve`
export const NPM_URL = `https://www.npmjs.com/package/${PACKAGE_NAME}`

export const DEMO_VIDEO = {
  src: '/demo/continuum-demo.mp4',
  poster: '/demo/continuum-demo.jpg',
  captions: '/demo/continuum-demo.vtt',
  /** As the cover shows it (scripts/site/images.mjs reads it from the video). */
  length: '1:17',
  caption: 'Claude Code fixes one of two bugs and stops. Codex starts with Continuum’s briefing, finishes the same task, and the dashboard shows who did what. Recorded from real sessions; voiceover by ElevenLabs.',
} as const

export const GET_STARTED = [
  {
    title: 'Connect your agent',
    // Shows the agent picker: the command depends on the agent.
    command: 'pick-agent',
    body: 'Pick your agent and run its command in your repository. Nothing is written to your global agent settings.',
  },
  {
    title: 'Work as usual',
    command: null,
    body: 'Start Claude Code in the repository and approve the continuum MCP server. Sessions, edits, test runs and tasks are recorded on your machine, and every new session starts with a briefing.',
  },
  {
    title: 'Open your dashboard',
    command: DASHBOARD_COMMAND,
    body: 'It prints a private sign-in link for your dashboard on 127.0.0.1. Open it to see every connected repository. Nothing leaves your machine.',
  },
] as const
