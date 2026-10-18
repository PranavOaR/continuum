import { expect, test } from './fixtures'

test('landing page explains the product, with the install command and the demo video', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your work continues.')
  await expect(page.getByText('npx @pranavoar/continuum setup claude-code')).toBeVisible()
  await expect(page.locator('video')).toHaveAttribute('src', '/demo/continuum-demo.mp4')
  await expect(page.getByRole('heading', { name: 'What the next agent is told' })).toBeVisible()
  await expect(page.locator('pre')).toContainText('## Current task')
  for (const agent of ['Claude Code', 'Codex', 'Cursor']) await expect(page.getByRole('list').getByText(agent, { exact: true })).toBeVisible()
  // The prototype's wording is gone for good.
  await expect(page.getByText(/mock data|prototype|explore the demo|ChatGPT/i)).toHaveCount(0)
})

test('landing page copies the install command', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Copy' }).click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npx @pranavoar/continuum setup claude-code')
})

test('overview shows coherent summary values and opens a project', async ({ page }) => {
  await page.goto('/app')
  const card = (label: string) => page.getByRole('link', { name: new RegExp(`^${label}`) })
  await expect(card('Active projects')).toContainText('3')
  await expect(card('Active tasks')).toContainText('5')
  await expect(card('Recent changes')).toContainText('12')
  await expect(card('Pending handoffs')).toContainText('2')
  await expect(page.getByText('Session ended before full verification').first()).toBeVisible()
  await page.getByRole('link', { name: /Startup App/ }).first().click()
  await expect(page).toHaveURL(/\/app\/projects\/startup-app/)
  await expect(page.getByRole('heading', { name: 'Implement Google authentication' })).toBeVisible()
})

test('attention item links to the relevant project task', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('link', { name: /Blocked: Add retry with backoff/ }).click()
  await expect(page).toHaveURL(/analytics-platform\?task=task-ingest-retry/)
  await expect(page.getByRole('heading', { name: 'Add retry with backoff to event ingestion' })).toBeVisible()
})

test('project workspace exposes files, events, verification and memory', async ({ page }) => {
  await page.goto('/app/projects/startup-app')
  await expect(page.getByText('Out of date').first()).toBeVisible()
  await expect(page.getByText('Authentication callbacks must use the existing session service.')).toBeVisible()

  await page.getByRole('button', { name: /src\/auth\/google-callback\.ts/ }).click()
  const fileDrawer = page.getByRole('dialog')
  await expect(fileDrawer).toContainText('handleGoogleCallback')
  await expect(fileDrawer).toContainText('Illustrative diff excerpt')
  await fileDrawer.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: /Session ended before full verification/ }).click()
  await expect(page.getByRole('dialog')).toContainText('not a real Claude Code session')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: /Process subscription billing webhooks/ }).click()
  await expect(page).toHaveURL(/task=task-billing-webhooks/)
  await expect(page.getByText('src/billing/webhooks.ts')).toBeVisible()
})

test('handoff can be prepared, marked, copied and found in history', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/app/projects/startup-app')
  await page.getByRole('button', { name: 'Prepare Handoff' }).first().click()

  const dialog = page.getByRole('dialog', { name: 'Prepare handoff' })
  await expect(dialog).toBeVisible()
  const target = dialog.getByLabel('Target agent')
  await expect(target.locator('option', { hasText: 'Claude Code' })).toHaveCount(0)
  await target.selectOption('cursor')

  await expect(dialog.getByRole('heading', { name: 'Next steps' })).toBeVisible()
  await dialog.locator('label', { hasText: 'Remaining work and recommended action' }).click()
  await expect(dialog.getByRole('heading', { name: 'Next steps' })).toHaveCount(0)
  await dialog.locator('label', { hasText: 'Known issues and what failed before' }).click()
  await expect(dialog.getByRole('heading', { name: 'Previous attempts' })).toBeVisible()
  await expect(dialog).toContainText('tokens (estimate)')

  await page.getByRole('button', { name: 'Prepare Handoff' }).last().click()
  await expect(page).toHaveURL(/\/app\/handoffs\/h-/)
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Mark as Prepared' }).click()
  await expect(page.getByText('Handoff prepared. Your context is ready to use with the selected agent.')).toBeVisible()

  await page.getByRole('button', { name: 'Copy Context' }).click()
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toContain('# Continuum handoff context')
  expect(clipboard).toContain('To: Cursor')
  expect(clipboard).toContain('## Previous attempts')
  expect(clipboard).not.toContain('## Next steps')
  await expect(page.getByText('Copied', { exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/has received/i)

  await page.goto('/app/handoffs')
  await expect(page.getByRole('link', { name: /Startup App.*Cursor.*Implement Google authentication/ })).toBeVisible()
})

test('clipboard failure offers a manual copy fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('Permission denied')) } })
  })
  await page.goto('/app/handoffs/h-mdx')
  await page.getByRole('button', { name: 'Copy Context' }).click()
  const dialog = page.getByRole('dialog', { name: 'Copy manually' })
  await expect(dialog).toContainText('Permission denied')
  await expect(dialog.getByRole('textbox')).toHaveValue(/Continuum handoff context/)
})

test('activity filters and search work, with an empty state', async ({ page }) => {
  await page.goto('/app/activity')
  await page.getByLabel('Event type').selectOption('test-result')
  await expect(page.getByText(/^5 of \d+ events$/)).toBeVisible()
  await page.getByLabel('Agent').selectOption('cursor')
  await expect(page.getByText(/^2 of \d+ events$/)).toBeVisible()
  await page.getByLabel('Search activity').fill('nothing-matches-this')
  await expect(page.getByText('No activity matches these filters')).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await page.getByRole('button', { name: /Production build failed/ }).click()
  await page.getByRole('link', { name: /Open in project/ }).click()
  await expect(page).toHaveURL(/dev-portfolio\?task=task-mdx-blog/)
})

test('memory explorer nodes can be selected and related entities followed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/app/memory')
  await page.getByRole('button', { name: 'Task: Implement Google authentication' }).click()
  const details = page.getByRole('complementary', { name: 'Record details' })
  await expect(details.getByRole('heading', { name: 'Implement Google authentication' })).toBeVisible()
  await details.getByRole('button', { name: /src\/auth\/session\.ts/ }).click()
  await expect(details.getByRole('heading', { name: 'src/auth/session.ts' })).toBeVisible()
  await page.getByRole('button', { name: 'Decisions', exact: true }).click()
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(page.getByText(/^4 of \d+ records$/)).toBeVisible()
})

test('global search finds files and navigates to them', async ({ page }) => {
  await page.goto('/app')
  await page.keyboard.press('ControlOrMeta+k')
  const dialog = page.getByRole('dialog', { name: 'Search' })
  await dialog.getByLabel('Search query').fill('session.ts')
  await dialog.getByRole('option').first().click()
  await expect(page).toHaveURL(/file=f-session/)
  await expect(page.getByRole('dialog')).toContainText('createSessionFromOAuth')
})

test('settings change theme and reset handoff history', async ({ page }) => {
  await page.goto('/app/settings')
  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('button', { name: 'Clear handoff history' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Clear history' }).click()
  await page.goto('/app/handoffs')
  await expect(page.getByText('No handoffs yet')).toBeVisible()

  await page.goto('/app/settings')
  await page.getByRole('button', { name: 'Restore defaults' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Restore defaults' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.goto('/app/handoffs')
  await expect(page.getByRole('link', { name: /Developer Portfolio/ })).toBeVisible()
})

test('unknown routes and records show coherent states', async ({ page }) => {
  await page.goto('/app/projects/does-not-exist')
  await expect(page.getByText('Project not found')).toBeVisible()
  await page.goto('/app/handoffs/missing')
  await expect(page.getByText('Handoff not found')).toBeVisible()
  await page.goto('/app/nope')
  await expect(page.getByText('Page not found')).toBeVisible()
})

test('the demo shows tasks read-only: editing needs your own dashboard', async ({ page }) => {
  await page.goto('/app/projects/startup-app')
  const panel = page.locator('#task')
  await expect(panel).toBeVisible()
  await expect(panel.getByLabel('Status')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: /Mark ".*" as done/ })).toHaveCount(0)
})
