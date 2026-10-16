import { expect, test } from './fixtures'

const ROUTES = ['/', '/app', '/app/projects', '/app/projects/startup-app', '/app/activity', '/app/memory', '/app/handoffs', '/app/handoffs/h-mdx', '/app/settings']

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
