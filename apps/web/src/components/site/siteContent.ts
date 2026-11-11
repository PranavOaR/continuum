/** What the public website says about installing and running Continuum, in one place. */

export const PACKAGE_NAME = 'getcontinuum'
export const DASHBOARD_COMMAND = `npx ${PACKAGE_NAME} serve`

export const DEMO_VIDEO = {
  src: '/demo/continuum-demo.mp4',
  poster: '/demo/continuum-demo.jpg',
  captions: '/demo/continuum-demo.vtt',
  /** As the cover shows it (scripts/site/images.mjs reads it from the video). */
  length: '1:14',
  label: 'the demo video',
} as const

/** The second film: a passing test goes out of date when the code changes under it (scripts/demo-video/stale-film). */
export const STALE_TEST_VIDEO = {
  src: '/demo/stale-test.mp4',
  poster: '/demo/stale-test.jpg',
  captions: '/demo/stale-test.vtt',
  length: '0:54',
  label: 'the stale-test video',
} as const

export type SiteVideo = typeof DEMO_VIDEO | typeof STALE_TEST_VIDEO

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
    body: 'It prints a private sign-in link for your dashboard on 127.0.0.1. Open it to see every connected repository. Your records never leave your machine.',
  },
] as const
