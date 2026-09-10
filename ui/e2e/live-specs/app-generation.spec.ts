import { expect, test } from '@playwright/test'
import { openAuditApp } from '../helpers/appAudit'
import { isolateLiveWorkspace } from '../helpers/liveWorkspace'
import { directMode, generateAndVerify, selectModel } from '../helpers/liveMedia'

test('app: real image generation and image upscale through visible controls', async ({ page, request }, info) => {
  const isolation = await isolateLiveWorkspace(page, request, info)
  try {
    await openAuditApp(page, isolation.workspace)
    await directMode(page, 'Image')
    await selectModel(page, /Flux 2 Klein 9B/i)
    await page.getByPlaceholder('Describe your image...').fill('A small handcrafted toy wizard with a cobalt blue coat holding a glowing orange keyboard, full body, clean white studio background, soft shadows, no text.')
    const source = await generateAndVerify(page, request, info, isolation.workspace, 'image', async () => {
      await page.locator('[data-wizard-anchor="generate"]').click()
    }, 'image')
    await directMode(page, 'Tools')
    await page.getByRole('button', { name: 'Upscale', exact: true }).click()
    await page.getByRole('button', { name: 'Use selected gallery image', exact: true }).click()
    await page.locator('select').filter({ has: page.locator('option[value="lanczos2"]') }).selectOption('lanczos2')
    await expect(page.getByRole('button', { name: 'Upscale Image', exact: true })).toBeEnabled()
    const enlarged = await generateAndVerify(page, request, info, isolation.workspace, 'upscale', async () => {
      await page.getByRole('button', { name: 'Upscale Image', exact: true }).click()
    }, 'image')
    const dimensions = await page.evaluate(async urls => Promise.all(urls.map(url => new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(Error(`Cannot decode ${url}`))
      image.src = url
    }))), [source.url, enlarged.url])
    expect(dimensions[1]).toEqual({ width: dimensions[0].width * 2, height: dimensions[0].height * 2 })
  } finally { await isolation.evidence() }
})

test('app: real instrumental music generation through visible controls', async ({ page, request }, info) => {
  const isolation = await isolateLiveWorkspace(page, request, info)
  try {
    await openAuditApp(page, isolation.workspace)
    const defaults = page.waitForResponse(response => /\/api\/v1\/defaults\/ace_step/.test(response.url()) && response.ok())
    await directMode(page, 'Audio')
    await defaults
    await page.getByRole('button', { name: 'Music', exact: true }).click()
    await page.getByRole('checkbox', { name: 'Instrumental', exact: true }).check()
    await page.getByPlaceholder(/Genre, instruments/i).fill('Playful chiptune instrumental, warm synth bass, bright arpeggios, 110 BPM, a wizard programming at midnight, no vocals.')
    await page.getByRole('slider').first().fill('30')
    await expect(page.getByRole('slider').first()).toHaveValue('30')
    const music = await generateAndVerify(page, request, info, isolation.workspace, 'music', async () => {
      await page.locator('[data-wizard-anchor="generate"]').click()
    }, 'audio')
    const duration = await page.evaluate(url => new Promise<number>((resolve, reject) => {
      const audio = new Audio()
      audio.onloadedmetadata = () => resolve(audio.duration)
      audio.onerror = () => reject(Error(`Cannot decode ${url}`))
      audio.src = url
    }), music.url)
    expect(duration).toBeGreaterThan(28)
    expect(duration).toBeLessThan(32)
  } finally { await isolation.evidence() }
})
