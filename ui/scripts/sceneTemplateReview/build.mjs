import path from 'node:path'
import { build } from 'vite'

/** Compile the actual UI into this run's fresh temporary directory. No dev
 * websocket, source-file serving, backend proxy or modifications to ui/dist. */
export async function buildReviewUi({ uiRoot, outputDir }) {
  const uiDist = path.join(outputDir, 'ui')
  await build({
    root: uiRoot,
    configFile: path.join(uiRoot, 'vite.config.ts'),
    build: { outDir: uiDist, emptyOutDir: false },
  })
  return uiDist
}
