import { expect, test } from './fixtures'

test('activity flow animates and can be paused', async ({ page }) => {
  await page.goto('/')
  const flow = page.getByRole('img', { name: /How activity flows through Continuum/ })
  await flow.scrollIntoViewIfNeeded()
  await expect(flow).toBeVisible()

  const pause = page.getByRole('button', { name: 'Pause' })
  await pause.click()
  await expect(page.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'true')
  const isPaused = await flow.evaluate((svg) => (svg as SVGSVGElement).animationsPaused())
  expect(isPaused).toBe(true)
})

test('activity flow shows a static final frame when motion is reduced', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByText('Activity flow (motion reduced)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0)
  await expect(page.getByRole('img', { name: /How activity flows/ }).getByText('Ready to copy')).toBeVisible()
  expect(await page.locator('figure svg[role=img] animate, figure svg[role=img] animateMotion').count()).toBe(0)
  await context.close()
})

test('feature tiles animate, and render statically when motion is reduced', async ({ browser, page }) => {
  await page.goto('/#features')
  const tiles = page.locator('#features ul li svg')
  await expect(tiles).toHaveCount(6)
  expect(await page.locator('#features ul li svg :is(animate, animateMotion, animateTransform)').count()).toBeGreaterThan(50)

  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const reduced = await context.newPage()
  await reduced.goto('/#features')
  await expect(reduced.locator('#features ul li svg')).toHaveCount(6)
  expect(await reduced.locator('#features ul li svg :is(animate, animateMotion, animateTransform)').count()).toBe(0)
  await context.close()
})
