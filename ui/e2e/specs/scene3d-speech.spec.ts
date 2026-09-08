import { expect, test } from '@playwright/test'
import { gotoApp, closeApp } from '../helpers/gotoApp'

// Closed API simulation, real application/editor/WebGL. No generation providers.
test.use({ channel: 'msedge' })
test('new talking shots are reachable in the existing 3D video editor', async ({ page }) => {
  const session = await gotoApp(page)
  await page.getByRole('tab', { name: 'Video 3D', exact: true }).click()
  await page.getByRole('button', { name: 'Close Ask to the Wizard' }).click()
  const workspace = page.getByTestId('scene3d-workspace')
  // Available on ordinary shots too, without a new route, document or fullscreen.
  const toggle = workspace.getByTestId('world3d-speech-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(workspace.getByTestId('scene3d-speech')).toHaveCount(0)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(workspace.getByTestId('scene3d-speech')).toContainText('Voice and lip-sync')
  await expect(workspace.getByTestId('scene3d-speech')).toContainText('First choose a GLB')
  await workspace.getByLabel('Character', { exact: true }).selectOption('subject_2')
  await expect(workspace.getByTestId('scene3d-speech')).toContainText('Subject 2')
  await toggle.click()
  await expect(workspace.getByTestId('scene3d-speech')).toHaveCount(0)
  await expect(workspace.getByTestId('scene3d-roundtrip')).toHaveText('ok')
  await expect(page.getByRole('tab', { name: 'Video 3D', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL('/')
  await page.getByRole('button', { name: 'Expand editor', exact: true }).click()
  await workspace.locator('details').first().locator('summary').click()
  for (const id of ['speech-portrait', 'speech-dialogue', 'speech-presenter']) {
    await workspace.getByTestId('world3d-template-' + id).click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(workspace.getByTestId('scene3d-speech')).toContainText('Voice and lip-sync')
    await expect(workspace.getByRole('button', { name: 'Import Taberna kit (.zip)', exact: true })).toBeHidden()
    await expect(workspace.getByRole('button', { name: 'Calculate gestures with Rhubarb (local)', exact: true })).toBeDisabled()
    await expect(workspace.getByTestId('scene3d-roundtrip')).toHaveText('ok')
  }
  await closeApp(page, session)
})
