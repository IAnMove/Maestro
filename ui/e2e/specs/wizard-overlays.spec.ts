import { expect, test, type Page } from '@playwright/test'
import { closeApp, gotoApp } from '../helpers/gotoApp'

const wizard = (page: Page) => page.locator('.hp-agent-panel')

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 740 }]) {
  test(`resource picker uses the viewport and keeps Wizard open on Escape (${viewport.width})`, async ({ page }) => {
    const session = await gotoApp(page)
    try {
      await page.setViewportSize(viewport)
      await page.evaluate(() => window.dispatchEvent(new Event('hocuspocus:wizard-open')))
      await wizard(page).locator('summary').click()
      await wizard(page).getByRole('button', { name: 'From HocusPocus' }).click()
      const dialog = page.getByRole('dialog').filter({ has: page.getByTestId('asset-explorer') })
      await expect(dialog).toBeVisible()
      expect(await dialog.evaluate(node => node.parentElement === document.body)).toBe(true)
      expect(await dialog.boundingBox()).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height })
      expect((await page.getByTestId('asset-explorer').boundingBox())!.width).toBeGreaterThan(viewport.width - 40)
      await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport()
      await dialog.locator('button[title="hero.png"]').click()
      await expect(dialog.getByRole('button', { name: 'Choose', exact: true })).toBeEnabled()
      await page.screenshot({ path: test.info().outputPath('resource-picker.png') })
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(wizard(page)).toBeVisible()
      await expect(wizard(page).getByRole('button', { name: 'From HocusPocus' })).toBeFocused()
    } finally {
      await closeApp(page, session)
    }
  })
}

test('Activity opens above Wizard and closes without closing the chat', async ({ page }) => {
  const session = await gotoApp(page)
  const task = {
    id: 'task-layout', root_id: 'task-layout', parent_id: null, title: 'Layout review task',
    kind: 'generation', workflow: 'generation', status: 'running', phase: 'running',
    message: 'Rendering', detail: '', current: 1, total: 10, progress: 0.1,
    created_at: 10, started_at: 10, updated_at: 20, attempt: 1, max_attempts: 1,
  }
  try {
    await page.route('**/api/v1/tasks?*', route => route.fulfill({ json: { tasks: [task], latest_event_id: 1 } }))
    await page.reload()
    await page.evaluate(() => window.dispatchEvent(new Event('hocuspocus:wizard-open')))
    await expect(wizard(page)).toBeVisible()
    await page.getByRole('button', { name: /Activity/ }).click()
    const details = page.getByTestId('activity-details')
    await expect(details).toContainText('Layout review task')
    expect(await details.evaluate(node => {
      const box = node.getBoundingClientRect()
      return node.contains(document.elementFromPoint(box.x + 25, box.y + 25))
    })).toBe(true)
    await page.screenshot({ path: test.info().outputPath('activity-over-wizard.png') })
    await details.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(details).toHaveCount(0)
    await expect(wizard(page)).toBeVisible()
  } finally {
    await closeApp(page, session)
  }
})

test('Wizard hydration keeps replies between questions without scrolling the page', async ({ page }) => {
  const session = await gotoApp(page)
  const messages = ['Question one', 'Answer one', 'Question two', 'Answer two'].map((text, index) => ({
    id: `turn-${index}`, role: index % 2 ? 'assistant' : 'user', text, createdAt: index + 1,
  }))
  try {
    await page.addInitScript(values => {
      localStorage.setItem('hocuspocus-agent-chat-v2:default', JSON.stringify(values))
      localStorage.setItem('hocuspocus-wizard-sidebar-collapsed', 'false')
    }, messages)
    await page.route('**/api/v1/wizard/conversations?*', route => route.fulfill({ json: {
      version: 1, revision: 1, messages: [messages[0], messages[2]], executions: [],
    } }))
    await page.reload()
    const timeline = wizard(page).locator('[aria-live="polite"]')
    await expect(timeline).toContainText('Answer two')
    expect(await timeline.innerText()).toMatch(/Question one[\s\S]*Answer one[\s\S]*Question two[\s\S]*Answer two/)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  } finally {
    await closeApp(page, session)
  }
})
