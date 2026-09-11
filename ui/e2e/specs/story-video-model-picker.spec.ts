import { expect, test } from '@playwright/test'
import { closeApp, gotoApp } from '../helpers/gotoApp'

const capability = { compatible: true, reason: '' }
const incompatible = { compatible: false, reason: 'Not a Director video model' }
const models = [
  { model_type: 'minimax_h3_legacy', name: 'H3 Legacy', family: 'minimax_h3', is_i2v: true },
  { model_type: 'ltx2_22B_distilled_1_1', name: 'LTX text only', family: 'ltx2', is_i2v: false },
  { model_type: 'unsupported-video', name: 'Unsupported video', family: 'ltx2', is_i2v: true },
].map(model => ({ ...model, architecture: model.family, is_t2v: true, fps: 24, is_downloaded: false,
  director: { image: incompatible, video: {
    music_video: model.model_type === 'unsupported-video' ? incompatible : capability,
    short_film_story: model.model_type === 'unsupported-video' ? incompatible : capability,
    short_film_audio: capability, seamless: incompatible,
  } },
}))

test('Story saves a model override without changing the global model', async ({ page }) => {
  const session = await gotoApp(page)
  const globalWrites: string[] = []
  page.on('request', request => {
    if (request.method() !== 'GET' && /\/api\/v1\/(production-profile|model-selections)$/.test(new URL(request.url()).pathname)) globalWrites.push(request.url())
  })
  try {
    await page.route('**/api/v1/models', route => route.fulfill({ json: { models, families: [
      { id: 'minimax_h3', label: 'MiniMax H3', order: 1 }, { id: 'ltx2', label: 'LTX', order: 2 },
    ] } }))
    await page.route('**/api/v1/model-visibility', route => route.fulfill({ json: {
      configured: true, enabled_models: models.map(model => model.model_type), initialized_mature_models: [], defaults_version: 9,
    } }))
    await page.reload()
    await page.getByRole('button', { name: 'Close Ask to the Wizard' }).click()
    await page.getByRole('button', { name: 'Studios', exact: true }).click()
    await page.getByRole('tab', { name: 'Story Lab' }).click()
    await page.getByRole('navigation', { name: 'Story Lab sections' }).getByRole('button', { name: 'Generate', exact: true }).click()
    const picker = page.getByRole('combobox', { name: /^Video model/ }).first()
    await expect(picker).toBeEnabled()
    expect(await picker.locator('option').allTextContents()).toEqual(['H3 Legacy', 'LTX text only'])
    globalWrites.length = 0 // Ignore the app's initial model-selection hydration.
    await picker.selectOption('ltx2_22B_distilled_1_1')
    await expect(picker).toHaveValue('ltx2_22B_distilled_1_1')
    await page.screenshot({ path: test.info().outputPath('story-model-choice.png') })
    await expect.poll(async () => page.evaluate(() => Object.keys(localStorage).some(key =>
      key.includes('story') && localStorage.getItem(key)?.includes('"useGlobalProfile":false')
      && localStorage.getItem(key)?.includes('ltx2_22B_distilled_1_1'),
    ))).toBe(true)
    expect(globalWrites).toEqual([])
    await page.reload()
    await page.getByRole('button', { name: 'Studios', exact: true }).click()
    await page.getByRole('tab', { name: 'Story Lab' }).click()
    await page.getByRole('navigation', { name: 'Story Lab sections' }).getByRole('button', { name: 'Generate', exact: true }).click()
    await expect(page.getByRole('combobox', { name: /^Video model/ }).first()).toHaveValue('ltx2_22B_distilled_1_1')
  } finally {
    await closeApp(page, session)
  }
})
