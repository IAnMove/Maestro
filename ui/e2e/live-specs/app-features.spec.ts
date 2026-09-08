import fs from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { captureFeature, openAuditApp, type FeatureEvidence } from '../helpers/appAudit'
import { isolateLiveWorkspace } from '../helpers/liveWorkspace'

test('app: feature tour captures every main destination and tool panel', async ({ page, request }, info) => {
  const isolation = await isolateLiveWorkspace(page, request, info)
  const records: FeatureEvidence[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await openAuditApp(page, isolation.workspace)
    for (const [category, label] of [['direct-generation', 'Direct generation'], ['studios', 'Studios'], ['production', 'Production'], ['media', 'Media']]) {
      const primary = page.getByRole('button', { name: label, exact: true })
      if (await primary.getAttribute('data-navigation-expanded') !== 'true') await primary.click()
      const tabs = page.locator(`[role="tablist"][data-navigation-category="${category}"]`)
      await expect(tabs).toBeVisible()
      const names = await tabs.getByRole('tab').evaluateAll(items => items.map(item => item.getAttribute('aria-label')!))
      for (const name of names) {
        await captureFeature(page, info, records, [label, name], async () => {
          if (await primary.getAttribute('data-navigation-expanded') !== 'true') await primary.click()
          const tab = tabs.getByRole('tab', { name, exact: true })
          await tab.click()
          await expect(tab).toHaveAttribute('aria-selected', 'true')
          await page.evaluate(() => document.fonts.ready)
        })
        if (category === 'direct-generation' && name === 'Tools') {
          for (const tool of ['Upscale', 'Revoice', 'Remove background']) {
            await captureFeature(page, info, records, [label, name, tool], async () => {
              await page.getByRole('button', { name: tool, exact: true }).click()
            })
          }
        }
        const subModes = name === 'Audio' ? ['Speech', 'Music', 'SFX', 'Mixer']
          : name === 'Video' ? ['Frames', 'Multi-Shot', 'Extend', 'Blend']
            : name === 'Edit' ? ['Retake', 'Edit Anything', 'Outpaint', 'Repaint', 'Recast'] : []
        if (category === 'direct-generation') for (const subMode of subModes) {
          await captureFeature(page, info, records, [label, name, subMode], async () => {
            await page.getByRole('button', { name: subMode, exact: true }).click()
          })
        }
      }
    }
    for (const name of ['Workspaces', 'Activity']) {
      await captureFeature(page, info, records, [name], async () => {
        await page.getByRole(name === 'Activity' ? 'button' : 'tab', { name, exact: true }).click()
      })
    }
    await captureFeature(page, info, records, ['Settings'], async () => {
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await expect(page.getByText('Storage Manager', { exact: true })).toBeVisible()
    })
    await page.getByRole('button', { name: 'Close settings', exact: true }).click()
    const activity = page.getByRole('button', { name: 'Activity', exact: true })
    if (await activity.getAttribute('aria-expanded') === 'true') await activity.click()
    await page.setViewportSize({ width: 390, height: 844 })
    await captureFeature(page, info, records, ['Mobile navigation'], async () => {
      await page.getByRole('button', { name: 'Studios', exact: true }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2)
    })
  } finally {
    await isolation.evidence()
    await fs.writeFile(info.outputPath('page-errors.json'), JSON.stringify(errors, null, 2))
    await info.attach('feature-inventory', { body: JSON.stringify(records, null, 2), contentType: 'application/json' })
  }
  expect(errors).toEqual([])
})
