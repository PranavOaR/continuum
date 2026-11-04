import { expect, test } from './fixtures'

const ROUTES = ['/', '/app', '/app/projects', '/app/projects/startup-app', '/app/activity', '/app/memory', '/app/briefings?project=startup-app', '/app/settings']

for (const width of [375, 820]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    for (const route of ROUTES) {
      test(`${route} has no horizontal overflow`, async ({ page }) => {
        await page.goto(route)
        await page.waitForLoadState('networkidle')
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBeLessThanOrEqual(0)
      })
    }
  })
}

test('mobile navigation drawer opens and navigates', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/app')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Memory' }).click()
  await expect(page).toHaveURL(/\/app\/memory/)
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toHaveCount(0)
})

test('a project on a phone has one View Briefing, and long branch names end in an ellipsis', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/app/projects/startup-app')
  await expect(page.getByRole('heading', { name: 'Implement Google authentication' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View Briefing', exact: true }).filter({ visible: true })).toHaveCount(1)
  const branch = page.getByTitle('feature/google-auth')
  await expect(branch).toBeVisible()
  // The name is cut inside its cell rather than running past it.
  const fits = await branch.evaluate((element) => element.getBoundingClientRect().right <= (element.closest('dd')?.getBoundingClientRect().right ?? Infinity) + 0.5)
  expect(fits).toBe(true)
})
