import { defineConfig } from '@playwright/test'
import path from 'node:path'

const baseURL = process.env.HOCUSPOCUS_BASE_URL
if (!baseURL) throw new Error('Set HOCUSPOCUS_BASE_URL to the running Pinokio URL, or use scripts/run_wizard_acceptance.py --base-url.')
const root = process.env.HOCUSPOCUS_E2E_ARTIFACT_DIR || path.resolve('test-results/wizard-live')
const executablePath = process.env.HOCUSPOCUS_E2E_CHROMIUM_EXECUTABLE
const scenario = process.env.HOCUSPOCUS_E2E_SCENARIO || 'smoke'
const filters: Record<string, RegExp> = {
  smoke: /wizard: Studio/, studio: /wizard: Studio/, language: /wizard: UI locale/,
  'music-video': /wizard: vocal/, 'music-video-new': /wizard: one-turn/,
  comic: /wizard: multi-page/, series: /wizard: Series Lab/, failure: /wizard: injected/,
  cancel: /wizard: a queued/, workspace: /wizard: workspace switching/,
  'wizard-media': /wizard: Ask to the Wizard real image and music outputs/,
  full: /wizard: (Studio|UI locale|vocal|multi-page|Series Lab)/,
  'app-tour': /app: feature tour/, 'app-generate': /app: real/, app: /app:/,
}
if (!filters[scenario]) throw new Error(`Unknown live acceptance scenario: ${scenario}`)

export default defineConfig({
  testDir: './live-specs', fullyParallel: false, workers: 1, retries: 0,
  timeout: 30 * 60_000, expect: { timeout: 30_000 }, grep: filters[scenario],
  outputDir: path.join(root, 'raw'),
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(root, 'report') }], ['json', { outputFile: path.join(root, 'results.json') }]],
  use: {
    baseURL, locale: 'en-US', viewport: { width: 1440, height: 1000 },
    trace: 'on', screenshot: 'on', video: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath, args: ['--no-sandbox', '--ignore-gpu-blocklist'] } : undefined,
  },
})
