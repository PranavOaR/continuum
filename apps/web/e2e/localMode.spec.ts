import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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
let server: ChildProcess | undefined
let url = ''
let launchUrl = ''

function continuum(args: string[], input?: string): string {
  return execFileSync(process.execPath, [...CLI, '-C', repo, ...args], { cwd: ROOT, input, encoding: 'utf8' })
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

  server = spawn(process.execPath, [...CLI, '-C', repo, 'serve', '--port', '0', '.', emptyRepo], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] })
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
})

test('the printed link opens the dashboard, labelled as live local data', async ({ page }) => {
  await page.goto(launchUrl)
  await expect(page).toHaveURL(`${url}/app`)
  await expect(page.getByText('Local workspace').first()).toBeVisible()
  await expect(page.getByText('Mock data')).toHaveCount(0)
  await expect(page.getByText('Live records from repositories on this machine')).toBeVisible()
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
})

test('prepare handoff builds from the recorded task', async ({ page }) => {
  const name = repo.split('/').at(-1) as string
  await page.goto(`${url}/app/projects/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
  await page.getByRole('button', { name: 'Prepare Handoff', exact: true }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('combobox', { name: 'Task' })).toHaveValue(/^load-config-from-env-/)
  await expect(dialog.getByText('The app reads its config from the environment', { exact: false }).first()).toBeVisible()
})

test('handoff history starts empty instead of showing demo samples', async ({ page }) => {
  await page.goto(`${url}/app/handoffs`)
  await expect(page.getByText('startup-app')).toHaveCount(0)
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

test('edits a task from the dashboard and records it as set by you', async ({ page }) => {
  const name = repo.split('/').at(-1) as string
  await page.goto(`${url}/app/projects/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
  const panel = page.locator('#task')
  await panel.getByRole('button', { name: 'Mark "Validate" as done' }).click()
  await expect(panel.getByRole('button', { name: 'Mark "Validate" as not done' })).toBeVisible()
  await panel.getByLabel('Status').selectOption('blocked')
  await expect(panel.getByText('Set by you', { exact: true })).toBeVisible()

  // Saved in the repository's store, not just on screen.
  await page.reload()
  await expect(page.locator('#task').getByLabel('Status')).toHaveValue('blocked')
  expect(continuum(['handoff'])).toContain('[set by you] "Load config from env" (blocked)')
})

test('a project without tasks offers its briefing, and Prepare Handoff says why it is unavailable', async ({ page }) => {
  const name = emptyRepo.split('/').at(-1) as string
  await page.goto(`${url}/app/projects/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
  await page.getByRole('button', { name: 'Prepare Handoff', exact: true }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Copy briefing' })).toBeVisible()
  const prepare = dialog.getByRole('button', { name: 'Prepare Handoff', exact: true })
  await expect(prepare).toBeDisabled()
  await expect(dialog.getByText('This project has no recorded task to hand off. Copy the briefing instead.')).toBeVisible()
})
