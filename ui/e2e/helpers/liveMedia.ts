import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'
import { liveJson } from './liveRead'

type Task = { id: string; parent_id?: string; status: string; result_refs?: string[]; metadata?: Record<string, unknown> }
type Output = { name: string; type: string; url: string; size: number }

export async function directMode(page: Page, name: string) {
  const primary = page.getByRole('button', { name: 'Direct generation', exact: true })
  if (await primary.getAttribute('data-navigation-expanded') !== 'true') await primary.click()
  await page.locator('[role="tablist"][data-navigation-category="direct-generation"]').getByRole('tab', { name, exact: true }).click()
}

export async function selectModel(page: Page, name: RegExp) {
  const selector = page.locator('[data-wizard-anchor="model"]')
  await selector.getByRole('button').first().click()
  await selector.getByRole('button', { name }).last().click()
  await expect(selector.getByRole('button').first()).toContainText(name)
}

async function tasks(request: APIRequestContext, workspace: string): Promise<Task[]> {
  return (await liveJson(request, `/api/v1/tasks?status=all&workspace=${encodeURIComponent(workspace)}`)).tasks
}

/** Observe actual UI submissions and server results. Never execute a store action. */
export async function generateAndVerify(page: Page, request: APIRequestContext, info: TestInfo, workspace: string, label: string, submit: () => Promise<void>, kind: string) {
  const before = new Set((await tasks(request, workspace)).map(task => task.id))
  const samples: unknown[] = []
  let task: Task | undefined
  await page.screenshot({ path: info.outputPath(`${label}-form.png`), fullPage: true })
  const initial = await liveJson(request, '/api/v1/system-stats')
  samples.push({ at: new Date().toISOString(), ...initial })
  expect(initial.ram.percent, 'Do not start inference while the host is already under memory pressure').toBeLessThan(80)
  const submission = page.waitForResponse(response => response.request().method() === 'POST' && /\/api\/v1\/(generate|tools\/)/.test(response.url()), { timeout: 30_000 })
  await submit()
  const accepted = await submission
  expect(accepted.ok(), `Submission HTTP ${accepted.status()}: ${await accepted.text()}`).toBeTruthy()
  try {
    await expect.poll(async () => {
      task = (await tasks(request, workspace)).find(item => !item.parent_id && !before.has(item.id))
      return task?.id
    }, { timeout: 60_000, intervals: [1000, 2000] }).toBeTruthy()
    const id = task!.id
    console.log(`[generation] ${label}: ${workspace} / ${id}`)
    await page.screenshot({ path: info.outputPath(`${label}-queued.png`), fullPage: true })
    await expect.poll(async () => {
      task = (await tasks(request, workspace)).find(item => item.id === id)
      samples.push({ at: new Date().toISOString(), ...await liveJson(request, '/api/v1/system-stats') })
      await fs.writeFile(info.outputPath(`${label}-resources.json`), JSON.stringify(samples, null, 2))
      return task?.status
    }, { timeout: 20 * 60_000, intervals: [5000, 10_000] }).toMatch(/^(completed|failed|cancelled|interrupted)$/)
    expect(task?.status, JSON.stringify(task)).toBe('completed')
    const result = await request.get(`/api/v1/outputs?workspace=${encodeURIComponent(workspace)}`)
    const outputs: Output[] = (await result.json()).outputs
    const names = task!.result_refs || []
    const output = outputs.find(item => names.includes(item.name) && item.type === kind)
    expect(output, 'Canonical result must resolve to a published output of the requested kind').toBeTruthy()
    const media = await request.get(output!.url)
    expect(media.ok()).toBeTruthy()
    const bytes = await media.body()
    expect(bytes.length).toBeGreaterThan(256)
    const metadataResponse = await request.get(`/api/v1/outputs/${encodeURIComponent(output!.name)}/metadata?workspace=${encodeURIComponent(workspace)}`)
    expect(metadataResponse.ok()).toBeTruthy()
    const metadata = await metadataResponse.json()
    expect(metadata.execution?.mode, 'Output must declare the selected execution profile').toBe(process.env.HOCUSPOCUS_E2E_PROFILE || 'simulate')
    const serialized = JSON.stringify(metadata)
    expect(serialized).not.toContain('"simulated":true')
    await fs.writeFile(info.outputPath(`${label}-result.json`), JSON.stringify({ workspace, task, output, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), metadata }, null, 2))
    await fs.writeFile(info.outputPath(output!.name), bytes)
    await page.screenshot({ path: info.outputPath(`${label}-completed.png`), fullPage: true })
    return output!
  } finally {
    await fs.writeFile(info.outputPath(`${label}-resources.json`), JSON.stringify(samples, null, 2))
    const finalTasks = await tasks(request, workspace).catch(error => ({ observationError: String(error) }))
    await fs.writeFile(info.outputPath(`${label}-tasks.json`), JSON.stringify(finalTasks, null, 2))
  }
}
