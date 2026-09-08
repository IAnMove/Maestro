import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const kit = process.argv[2]
if (!kit) throw new Error('Pass the absolute path to a Taberna v2 ZIP.')
const artifacts = path.resolve('../.codex-tmp/speech-review')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', event => { if (event.type() === 'error') errors.push(event.text()) })
try {
  await page.goto('http://127.0.0.1:8788/e2e/fixtures/scene3d-speech.html?fresh=1')
  await page.getByText('Biblioteca de planos · Retrato hablando', { exact: true }).waitFor()
  await page.getByTestId('speech-kit-file').setInputFiles(kit)
  await page.getByRole('checkbox', { name: 'Activar cara animada', exact: true }).waitFor({ timeout: 30000 })
  const animation = page.getByRole('combobox', { name: 'Animación del GLB subject_1', exact: true })
  await animation.waitFor({ timeout: 30000 })
  const option = await animation.locator('option').allTextContents()
  const idle = option.findIndex(text => /: Idle ·/.test(text))
  if (idle > 0) await animation.selectOption(String(idle - 1))
  // This source Idle clip faces +X; the shot uses +Z as its front.
  await page.getByLabel('Giro Y (°)', { exact: true }).fill('-90')
  await page.getByRole('button', { name: 'Ajustar duración a las voces', exact: true }).click()
  await page.getByRole('button', { name: 'Reproducir', exact: true }).click()
  await page.waitForFunction(() => Number(document.querySelector('[type=range]')?.value) > 1, { timeout: 20000 })
  await page.getByRole('button', { name: 'Pausar', exact: true }).click()
  await page.getByTestId('scene3d-stage').screenshot({ path: path.join(artifacts, 'mira-talking.jpg'), type: 'jpeg', quality: 88 })
  await page.getByTestId('scene3d-speech').screenshot({ path: path.join(artifacts, 'voice-controls.jpg'), type: 'jpeg', quality: 82 })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Guardar plano JSON', exact: true }).click()
  await (await download).saveAs(path.join(artifacts, 'demo.world3d.json'))
  const document = JSON.parse(await readFile(path.join(artifacts, 'demo.world3d.json'), 'utf8'))
  assert.equal(document.templateId, 'speech-portrait')
  assert.ok(document.slots[0].speech.cues.length > 10)
  assert.equal(document.slots[0].clip?.name, 'Idle')
  const saved = page.waitForResponse(response => response.url().endsWith('/api/v1/scenes/recordings') && response.request().method() === 'POST', { timeout: 180000 })
  await page.getByTestId('world3d-export').click()
  const response = await saved
  assert.equal(response.status(), 200)
  const output = await response.json()
  const video = await page.request.get('http://127.0.0.1:8788' + output.url)
  await writeFile(path.join(artifacts, 'mira-hocuspocus.mp4'), await video.body())
  await page.getByLabel('Abrir plano JSON', { exact: true }).setInputFiles(path.join(artifacts, 'demo.world3d.json'))
  assert.equal(await page.getByRole('checkbox', { name: 'Activar cara animada', exact: true }).isChecked(), true)
  console.log(JSON.stringify({ output, cueCount: document.slots[0].speech.cues.length, duration: document.duration, animations: option.length - 1, errors }, null, 2))
  await writeFile(path.join(artifacts, 'review-result.json'), JSON.stringify({ output, cueCount: document.slots[0].speech.cues.length, duration: document.duration, animations: option.length - 1, errors }, null, 2))
} catch (error) {
  console.log((await page.locator('body').innerText()).slice(-6500))
  console.log('Browser errors:', errors)
  await page.screenshot({ path: path.join(artifacts, 'failure.jpg'), type: 'jpeg', quality: 75 })
  throw error
} finally { await browser.close() }
