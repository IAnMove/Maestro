import { mkdirSync, writeFileSync } from 'node:fs'
import { compileCutPaperPilotScene, compileCutPaperShot } from '../src/features/cutPaper/pilot.ts'
import { serializeSceneFile } from '../src/lib/sceneFile.ts'

const root = new URL('../public/examples/cut-paper/', import.meta.url)
mkdirSync(new URL('shots/', root), { recursive: true })
const full = compileCutPaperPilotScene()
writeFileSync(new URL('tijeral-la-fuente.maestro-scene.json', root), serializeSceneFile(full))
for (const shot of ['plaza', 'talk', 'sticker']) {
  const scene = compileCutPaperShot(shot)
  const name = shot === 'plaza' ? '01-plaza' : shot === 'talk' ? '02-talk' : '03-sticker'
  writeFileSync(new URL(`shots/${name}.maestro-scene.json`, root), serializeSceneFile(scene))
  console.log(name, scene.duration, scene.layers.length)
}
