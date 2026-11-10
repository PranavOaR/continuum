import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { expect, test } from './fixtures'

/**
 * Local mode end to end: a throwaway repository with a recorded Claude Code
 * session and check, served by the real `continuum serve` and the built web app.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const CLI = ['--import', 'tsx', join(ROOT, 'packages/cli/src/bin.ts')]
const GIT_IDENTITY = ['-c', 'user.name=Continuum Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false']

let repo = ''
/** A second repository with Continuum set up but no task recorded yet. */
let emptyRepo = ''
/** A third, where an agent worked and left a note without ever recording a task. */
let noteRepo = ''
let server: ChildProcess | undefined
let url = ''
let launchUrl = ''
/** Continuum's per-user folder for this run, so the profile written here is never the developer's own. */
let configDir = ''
const env = () => ({ ...process.env, CONTINUUM_CONFIG_DIR: configDir })

function continuum(args: string[], input?: string): string {
  return execFileSync(process.execPath, [...CLI, '-C', repo, ...args], { cwd: ROOT, input, encoding: 'utf8', env: env() })
}

function write(path: string, content: string) {
  mkdirSync(dirname(join(repo, path)), { recursive: true })
  writeFileSync(join(repo, path), content)
}

function hook(fields: Record<string, unknown>) {
  continuum(['ingest'], JSON.stringify({ session_id: 'e2e-session', cwd: repo, transcript_path: '/t.jsonl', ...fields }))
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  test.skip(!existsSync(join(ROOT, 'apps/web/dist/index.html')), 'needs `npm run build` first')
  configDir = realpathSync(mkdtempSync(join(tmpdir(), 'continuum-e2e-config-')))
  repo = realpathSync(mkdtempSync(join(tmpdir(), 'continuum-e2e-')))
  execFileSync('git', [...GIT_IDENTITY, 'init', '--quiet', '--initial-branch=main'], { cwd: repo })
  write('package.json', '{"name":"e2e-app"}\n')
  write('src/app.ts', 'export const app = 1\n')
  execFileSync('git', [...GIT_IDENTITY, 'add', '-A'], { cwd: repo })
  execFileSync('git', [...GIT_IDENTITY, 'commit', '--quiet', '-m', 'initial'], { cwd: repo })

  continuum(['init'])

  // Record a task through the real MCP server, exactly as Claude Code would.
  const mcp = new Client({ name: 'e2e', version: '0' })
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [...CLI, '-C', repo, 'mcp'], cwd: ROOT, stderr: 'pipe' }))
  await mcp.callTool({
    name: 'start_task',
    arguments: { title: 'Load config from env', objective: 'The app reads its config from the environment', acceptance_criteria: ['Reads APP_PORT'], steps: ['Parse env', 'Validate'] },
  })
  await mcp.callTool({ name: 'update_task', arguments: { completed_steps: ['Parse env'], next_action: 'Validate the parsed values' } })
  await mcp.callTool({ name: 'record_decision', arguments: { title: 'Config comes from the environment', kind: 'decision', files: ['package.json'] } })
  await mcp.close()
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  write('src/app.ts', 'export const app = 2\n')
  hook({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: join(repo, 'src/app.ts') } })
  hook({ hook_event_name: 'Stop', last_assistant_message: 'Bumped app to 2. Next: wire the config loader.' })
  continuum(['run', '--name', 'unit', '--', process.execPath, '-e', '0'])

  emptyRepo = realpathSync(mkdtempSync(join(tmpdir(), 'continuum-e2e-empty-')))
  execFileSync('git', [...GIT_IDENTITY, 'init', '--quiet', '--initial-branch=main'], { cwd: emptyRepo })
  writeFileSync(join(emptyRepo, 'notes.md'), 'nothing yet\n')
  execFileSync(process.execPath, [...CLI, '-C', emptyRepo, 'init'], { cwd: ROOT })

  noteRepo = realpathSync(mkdtempSync(join(tmpdir(), 'continuum-e2e-note-')))
  execFileSync('git', [...GIT_IDENTITY, 'init', '--quiet', '--initial-branch=main'], { cwd: noteRepo })
  writeFileSync(join(noteRepo, 'notes.md'), 'draft\n')
  execFileSync(process.execPath, [...CLI, '-C', noteRepo, 'init'], { cwd: ROOT })
  const noteHook = (fields: Record<string, unknown>) =>
    execFileSync(process.execPath, [...CLI, '-C', noteRepo, 'ingest'], { cwd: ROOT, input: JSON.stringify({ session_id: 'e2e-note', cwd: noteRepo, transcript_path: '/n.jsonl', ...fields }) })
  noteHook({ hook_event_name: 'SessionStart', source: 'startup' })
  noteHook({ hook_event_name: 'Stop', last_assistant_message: 'Outlined the release notes. Next: add the migration section.' })

  server = spawn(process.execPath, [...CLI, '-C', repo, 'serve', '--port', '0', '.', emptyRepo, noteRepo], {
    cwd: ROOT,
    // No Claude Code settings, so a Continuum plugin enabled on this machine does not count as connected here.
    env: { ...env(), CLAUDE_CONFIG_DIR: join(repo, '.no-claude-settings') },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  launchUrl = await new Promise<string>((resolve, reject) => {
    let output = ''
    server?.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      const match = /http:\/\/127\.0\.0\.1:\d+\/app\?token=[\w-]+/.exec(output)
      if (match) resolve(match[0])
    })
    server?.once('exit', (code) => reject(new Error(`continuum serve exited with ${code}: ${output}`)))
  })
  url = new URL(launchUrl).origin
})

// Every test opens the launch link first, as a person would; it sets the access cookie.
test.beforeEach(async ({ page }) => {
  await page.goto(launchUrl)
})

test('refuses visitors without the access token', async ({ browser }) => {
  const stranger = await browser.newPage()
  const response = await stranger.goto(`${url}/app`)
  expect(response?.status()).toBe(401)
  await stranger.close()
})

test.afterAll(async () => {
  // Stop the server before deleting the repository it is reading.
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server?.once('exit', resolve))
    server.kill('SIGTERM')
    await exited
  }
  if (repo) rmSync(repo, { recursive: true, force: true })
  if (emptyRepo) rmSync(emptyRepo, { recursive: true, force: true })
  if (noteRepo) rmSync(noteRepo, { recursive: true, force: true })
})

test('the printed link opens the dashboard, labelled as live local data', async ({ page }) => {
  await page.goto(launchUrl)
  await expect(page).toHaveURL(`${url}/app`)
  await expect(page.getByText('Local workspace').first()).toBeVisible()
  await expect(page.getByText('Mock data')).toHaveCount(0)
  await expect(page.getByText('Live records from repositories on this machine')).toBeVisible()
})

test('the overview shows every repository worked on recently, task or not', async ({ page }) => {
  await page.goto(`${url}/app`)
  const projects = page.getByRole('region', { name: 'Active projects' })
  await expect(projects.getByText('Load config from env')).toBeVisible()
  // Work without a task: the latest session's own words, labelled with its agent.
  await expect(projects.getByText('Outlined the release notes. Next: add the migration section.')).toBeVisible()
  await expect(projects.getByText(/Latest session · Claude Code/)).toBeVisible()
  // Connected but not yet used: listed, with what to do next.
  await expect(projects.getByText('No agent session yet. Start one in this repository and it appears here.')).toBeVisible()
  await expect(page.getByText('No recent work')).toHaveCount(0)
})

test('live screens carry none of the demo or prototype wording', async ({ page }) => {
  const slug = (path: string) => (path.split('/').at(-1) as string).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const FORBIDDEN = ['simulated', 'demo user', 'demo workspace', 'would read', 'mock data', 'demo dataset', 'prototype', 'dark is the default']
  for (const path of ['/app', '/app/projects', `/app/projects/${slug(repo)}`, `/app/projects/${slug(emptyRepo)}`, `/app/projects/${slug(noteRepo)}`, '/app/activity', '/app/memory', '/app/briefings', '/app/settings']) {
    await page.goto(`${url}${path}`)
    await expect(page.getByRole('main')).toBeVisible()
    await page.waitForLoadState('networkidle')
    const text = await page.locator('body').innerText()
    for (const phrase of FORBIDDEN) expect(text.toLowerCase(), `${path} says "${phrase}"`).not.toContain(phrase)
    // A project no agent has worked in names no agent (the Activity page may still list "Other agent" as a filter).
    if (path.startsWith('/app/projects/')) expect(text, `${path} names an agent that never ran`).not.toContain('Other agent')
  }
  await page.goto(`${url}/app/projects/${slug(emptyRepo)}`)
  await expect(page.getByText('None yet')).toBeVisible()
})

test('the root of the dashboard opens the dashboard, not the website', async ({ page }) => {
  await page.goto(`${url}/`)
  await expect(page).toHaveURL(`${url}/app`)
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
})

test('shows the repository, its session, changed file and verified check', async ({ page }) => {
  const name = repo.split('/').at(-1) as string
  await page.goto(`${url}/app/projects`)
  await page.getByRole('link', { name: new RegExp(name) }).first().click()
  await expect(page.getByRole('heading', { name: 'Load config from env' })).toBeVisible()
  await expect(page.getByText('Validate the parsed values').first()).toBeVisible()
  await expect(page.getByText('Reads APP_PORT')).toBeVisible()
  await expect(page.getByText('src/app.ts').first()).toBeVisible()
  await expect(page.locator('#verification').getByText('unit')).toBeVisible()

  await page.getByText('src/app.ts').first().click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('Modified by Claude Code.')).toBeVisible()
  await expect(drawer.getByText('Uncommitted changes (against the last commit)')).toBeVisible()
  await expect(drawer.getByText('export const app = 2')).toBeVisible()
  await expect(drawer.getByText('Mock excerpt')).toHaveCount(0)
  await expect(drawer.getByText('unit', { exact: true })).toBeVisible()
  await expect(drawer.getByText('Unchanged since this run')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#verification').getByText(/^\d+ covered files? unchanged since it ran$/)).toBeVisible()
})

test('the copied briefing is what `continuum handoff` prints for the same repository', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const name = repo.split('/').at(-1) as string
  await page.goto(`${url}/app/briefings?project=${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
  await expect(page.getByLabel('Briefing text')).toContainText('The app reads its config from the environment')
  await page.getByRole('button', { name: 'Copy briefing' }).click()
  await expect(page.getByText('Briefing copied.', { exact: false })).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  // Only the moment each was generated may differ.
  const undated = (text: string) => text.trim().replace(/^Generated \S+/m, 'Generated').replace(/just now|\d+[mhd] ago/g, 'ago')
  expect(undated(copied)).toBe(undated(continuum(['handoff'])))
  expect(copied).not.toMatch(/mock data|demo/i)
})

test('memory graph comes from the local context graph', async ({ page }) => {
  // No ?project=: the page must pick a project that exists locally, not the demo default.
  await page.goto(`${url}/app/memory`)
  await expect(page.getByText('straight from the local context graph')).toBeVisible()
})

test('updates without a reload when something new is recorded', async ({ page }) => {
  const name = repo.split('/').at(-1) as string
  await page.goto(`${url}/app/projects/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
  await expect(page.locator('#verification').getByText('unit')).toBeVisible()
  await expect(page.locator('#verification').getByText('typecheck')).toHaveCount(0)
  continuum(['run', '--name', 'typecheck', '--', process.execPath, '-e', '0'])
  // Pushed by the daemon's change stream: nothing in the page reloads or navigates.
  await expect(page.locator('#verification').getByText('typecheck')).toBeVisible({ timeout: 4_000 })
})

test('flags a check whose name now runs a different command, in the panel and the file drawer', async ({ page }) => {
  const name = repo.split('/').at(-1) as string
  await page.goto(`${url}/app/projects/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
  await expect(page.locator('#verification').getByText('unit')).toBeVisible()
  continuum(['run', '--name', 'unit', '--', process.execPath, '-e', '1'])
  const unit = page.locator('#verification li').filter({ hasText: 'unit' })
  await expect(unit.getByText('Command changed')).toBeVisible({ timeout: 4_000 })
  await expect(unit.getByText(/Previously ran .* -e 0/)).toBeVisible()

  await page.getByText('src/app.ts').first().click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('Command changed')).toBeVisible()
  await expect(drawer.getByText(/Previously ran .* -e 0/)).toBeVisible()
})

test('edits a task from the dashboard and records it as set by you', async ({ page }) => {
  const name = repo.split('/').at(-1) as string
  await page.goto(`${url}/app/projects/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
  const panel = page.locator('#task')
  await panel.getByRole('button', { name: 'Mark "Validate" as done' }).click()
  await expect(panel.getByRole('button', { name: 'Mark "Validate" as not done' })).toBeVisible()
  await panel.getByLabel('Status').selectOption('blocked')
  await expect(panel.getByText('Changed by you: status, steps')).toBeVisible()

  // Saved in the repository's store, not just on screen.
  await page.reload()
  await expect(page.locator('#task').getByLabel('Status')).toHaveValue('blocked')
  const handoff = continuum(['handoff'])
  expect(handoff).toContain('[agent-reported] "Load config from env" (blocked)')
  expect(handoff).toContain('[set by you] Changed in the dashboard: status, steps done')
})

const projectPage = () => `${url}/app/projects/${(repo.split('/').at(-1) as string).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

test('creates a task from the dashboard, and the next briefing leads with it', async ({ page }) => {
  await page.goto(projectPage())
  await page.getByRole('button', { name: 'New task' }).click()
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await dialog.getByLabel('Title').fill('Prepare the release')
  await dialog.getByLabel('Objective').fill('Everything is ready to tag')
  await dialog.getByLabel('Next action').fill('Update the changelog')
  await dialog.getByRole('button', { name: 'Create task' }).click()

  await expect(dialog).toBeHidden()
  const panel = page.locator('#task')
  await expect(panel.getByRole('heading', { name: 'Prepare the release' })).toBeVisible()
  await expect(panel.getByText('Set by you').first()).toBeVisible()

  const handoff = continuum(['handoff'])
  expect(handoff).toContain('[set by you] "Prepare the release" (in-progress)')
  expect(handoff).toContain('Next action: "Update the changelog"')
})

test('plans a task for later, and the briefing lists it without making it current', async ({ page }) => {
  await page.goto(projectPage())
  await page.getByRole('button', { name: 'New task' }).click()
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await dialog.getByLabel('Title').fill('Write the upgrade guide')
  await dialog.getByLabel('When').selectOption('later')
  await dialog.getByRole('button', { name: 'Create task' }).click()
  await expect(dialog).toBeHidden()

  const handoff = continuum(['handoff'])
  expect(handoff).toContain('[set by you] "Prepare the release" (in-progress)')
  expect(handoff).toContain('## Planned by you\n- "Write the upgrade guide"')
})

test('refuses a task that is already open, and keeps what was typed', async ({ page, consoleErrors }) => {
  await page.goto(projectPage())
  await page.getByRole('button', { name: 'New task' }).click()
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await dialog.getByLabel('Title').fill('prepare the RELEASE')
  await dialog.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByText('"prepare the RELEASE" is already an open task.')).toBeVisible()
  await expect(dialog.getByLabel('Title')).toHaveValue('prepare the RELEASE')
  // The refused request is the point of this test: the browser logs every 400.
  expect(consoleErrors.splice(0)).toEqual(['Failed to load resource: the server responded with a status of 400 (Bad Request)'])
})

test('adds a decision and a known issue, and both reach the next briefing as yours', async ({ page }) => {
  await page.goto(projectPage())
  const panel = page.locator('#memory')
  await panel.getByRole('button', { name: 'Add a decision or issue' }).click()
  await panel.getByLabel('Title').fill('Releases go out on Tuesdays')
  await panel.getByLabel('Details').fill('Support is fully staffed then.')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.getByText('Releases go out on Tuesdays')).toBeVisible()

  await panel.getByRole('button', { name: 'Add a decision or issue' }).click()
  await panel.getByLabel('Kind').selectOption('known-issue')
  await panel.getByLabel('Title').fill('The tag script needs a clean tree')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.getByText('The tag script needs a clean tree')).toBeVisible()

  const handoff = continuum(['handoff'])
  expect(handoff).toContain('- [set by you] Decision: Releases go out on Tuesdays. Support is fully staffed then.')
  expect(handoff).toContain('- [set by you] Known issue: The tag script needs a clean tree.')
})

test('a resolved record leaves the briefing, and reopening brings it back', async ({ page }) => {
  await page.goto(projectPage())
  const panel = page.locator('#memory')
  await panel.getByRole('button', { name: 'Mark "The tag script needs a clean tree" as resolved' }).click()
  await expect(panel.getByRole('button', { name: 'Reopen "The tag script needs a clean tree"' })).toBeVisible()
  expect(continuum(['handoff'])).not.toContain('The tag script needs a clean tree')

  await panel.getByRole('button', { name: 'Reopen "The tag script needs a clean tree"' }).click()
  await expect(panel.getByRole('button', { name: 'Mark "The tag script needs a clean tree" as resolved' })).toBeVisible()
  expect(continuum(['handoff'])).toContain('The tag script needs a clean tree')
})

test('saying a stale record is still valid clears its warning from the briefing', async ({ page }) => {
  write('package.json', '{"name":"e2e-app","version":"2.0.0"}\n')
  expect(continuum(['handoff'])).toContain('(anchored code changed since: `package.json`)')

  await page.goto(projectPage())
  await page.locator('#task').getByRole('button', { name: 'Load config from env' }).click()
  await page.locator('#memory').getByRole('button', { name: 'Mark "Config comes from the environment" as still valid' }).click()
  await expect(page.locator('#memory').getByText('You confirmed this still holds.')).toBeVisible()

  const handoff = continuum(['handoff'])
  expect(handoff).toContain('Config comes from the environment. (you confirmed it still holds)')
  expect(handoff).not.toContain('anchored code changed')
})

test('a project without tasks still has a briefing to copy', async ({ page }) => {
  const name = emptyRepo.split('/').at(-1) as string
  await page.goto(`${url}/app/projects/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
  await page.getByRole('link', { name: 'View Briefing' }).click()
  await expect(page.getByLabel('Briefing text')).toContainText('No agent sessions recorded yet.')
  await expect(page.getByRole('button', { name: 'Copy briefing' })).toBeVisible()
})

test('a new project shows a getting-started checklist that ticks itself off live', async ({ page }) => {
  const name = emptyRepo.split('/').at(-1) as string
  await page.goto(`${url}/app/projects/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
  const guide = page.locator('#getting-started')
  await expect(guide.getByText('0 of 4 done', { exact: false })).toBeVisible()
  await expect(guide.getByText('continuum setup claude-code')).toBeVisible()

  execFileSync(process.execPath, [...CLI, '-C', emptyRepo, 'run', '--name', 'smoke', '--', process.execPath, '-e', '0'], { cwd: ROOT })
  await expect(guide.getByText('1 of 4 done', { exact: false })).toBeVisible({ timeout: 4_000 })
  await expect(guide.getByText('Record a check (done)')).toBeAttached()

  await guide.getByRole('button', { name: 'Hide getting started' }).click()
  await expect(page.locator('#getting-started')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Where we left off' })).toBeVisible()
  await expect(page.locator('#getting-started')).toHaveCount(0)
})

test('a preference added in Settings reaches the next briefing, labelled set by you', async ({ page }) => {
  await page.goto(`${url}/app/settings`)
  const profile = page.getByRole('region', { name: 'Your profile' })
  await expect(profile.getByText('No preferences yet.')).toBeVisible()
  await profile.getByLabel('Add a preference').fill('Use pnpm, never npm')
  await profile.getByRole('button', { name: 'Add' }).click()
  await expect(profile.getByRole('list', { name: 'Your preferences' })).toContainText('Use pnpm, never npm')
  await expect(profile.getByLabel('Add a preference')).toHaveValue('')

  const handoff = continuum(['handoff'])
  expect(handoff).toContain('## Your preferences')
  expect(handoff).toContain('- "Use pnpm, never npm"')
  expect(continuum(['profile'])).toContain('1. Use pnpm, never npm')

  await profile.getByRole('button', { name: 'Remove “Use pnpm, never npm”' }).click()
  await expect(profile.getByText('No preferences yet.')).toBeVisible()
  expect(continuum(['handoff'])).not.toContain('Your preferences')
})

test('a redaction pattern is previewed on a sample, a bad one is refused with its reason, and a good one is saved', async ({ page }) => {
  await page.goto(`${url}/app/settings`)
  const settings = page.getByRole('region', { name: 'Repository settings' })
  await settings.getByLabel('Repository').selectOption({ label: repo.split('/').at(-1) as string })
  await settings.getByLabel('Try it on a sample').fill('Ticket ACME-123456 is open')

  await settings.getByLabel('New pattern').fill('(a+)+$')
  await expect(settings.getByRole('alert')).toContainText('This pattern cannot be used. It repeats a group that itself repeats')
  await expect(settings.getByRole('button', { name: 'Add pattern' })).toBeDisabled()

  await settings.getByLabel('New pattern').fill('ACME-[0-9]{6}')
  await expect(settings.getByLabel('Sample as it would be stored')).toHaveText('Ticket [redacted] is open')
  await expect(settings.getByRole('alert')).toHaveCount(0)
  await settings.getByRole('button', { name: 'Add pattern' }).click()
  await expect(settings.getByRole('list', { name: 'Redaction patterns' })).toContainText('ACME-[0-9]{6}')
  expect(JSON.parse(readFileSync(join(repo, '.continuum', 'config.json'), 'utf8')).redactPatterns).toEqual(['ACME-[0-9]{6}'])

  await settings.getByRole('switch', { name: 'Record your prompts' }).click()
  await expect(settings.getByRole('switch', { name: 'Record your prompts' })).toHaveAttribute('aria-checked', 'true')
  await page.reload()
  await expect(page.getByRole('region', { name: 'Repository settings' }).getByRole('switch', { name: 'Record your prompts' })).toHaveAttribute('aria-checked', 'true')
})

test('Settings links to a new issue with the diagnostic report filled in', async ({ page }) => {
  await page.goto(`${url}/app/settings`)
  const link = page.getByRole('link', { name: 'Report a problem' })
  await expect(link).toHaveAttribute('href', /^https:\/\/github\.com\/PranavOaR\/continuum-plugin\/issues\/new\?template=bug_report\.md&body=/)
  const body = new URL((await link.getAttribute('href')) as string).searchParams.get('body') ?? ''
  expect(body).toContain('## Continuum diagnostic report')
  expect(body).not.toContain(repo)
})

test("the activity page reads one project's history back to its first event", async ({ page }) => {
  const slug = (repo.split('/').at(-1) as string).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  await page.goto(`${url}/app/activity?project=${slug}`)
  await expect(page.getByText(/\d+ events, back to the first recorded/)).toBeVisible()
  await expect(page.getByText('Claude Code session started').first()).toBeVisible()
  await page.getByLabel('Event type').selectOption('test-result')
  await expect(page.getByText('unit passed').first()).toBeVisible()
  await expect(page.getByText('Claude Code session started')).toHaveCount(0)
})

test('the forms for adding to a project have no serious or critical axe violations', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const serious = async () => {
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    return violations
      .filter((item) => item.impact === 'serious' || item.impact === 'critical')
      .flatMap((item) => item.nodes.map((node) => `${item.id}: ${node.html.slice(0, 90)} [${node.any.map((check) => check.message).join('; ').slice(0, 110)}]`))
  }
  await page.goto(projectPage())
  await page.getByRole('button', { name: 'Add a decision or issue' }).click()
  await expect(page.locator('#memory').getByLabel('Title')).toBeFocused()
  expect(await serious()).toEqual([])
  await page.getByRole('button', { name: 'New task' }).click()
  await expect(page.getByRole('dialog', { name: 'New task' }).getByLabel('Title')).toBeFocused()
  expect(await serious()).toEqual([])
})

test.describe('accessibility of live screens', () => {
  const pages = () => {
    const slug = (path: string) => (path.split('/').at(-1) as string).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    return [
      ['overview', '/app'],
      ['project with a task', `/app/projects/${slug(repo)}`],
      ['project without tasks', `/app/projects/${slug(emptyRepo)}`],
      ['activity', '/app/activity'],
      ['memory', '/app/memory'],
      ['briefing', `/app/briefings?project=${slug(repo)}`],
      ['settings', '/app/settings'],
    ] as const
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`has no serious or critical axe violations in the ${theme} theme`, async ({ page }) => {
      const { default: AxeBuilder } = await import('@axe-core/playwright')
      const failures: string[] = []
      // Measure settled colours, not elements caught halfway through a fade-in.
      await page.emulateMedia({ reducedMotion: 'reduce' })
      for (const [name, path] of pages()) {
        await page.goto(`${url}${path}`)
        await expect(page.getByRole('main')).toBeVisible()
        // Switch instantly: a colour transition would be measured halfway between themes.
        await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' })
        await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme)
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
        for (const violation of violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')) {
          const where = violation.nodes.map((node) => `${node.html.slice(0, 100)} [${node.any.map((check) => check.message).join('; ')}]`)
          failures.push(`${name}: ${violation.id} (${violation.impact}) on ${where.slice(0, 3).join(' | ')}`)
        }
      }
      expect(failures).toEqual([])
    })
  }
})
