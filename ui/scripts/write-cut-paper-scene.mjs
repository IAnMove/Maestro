import { writeFileSync } from 'node:fs'
import { compileCutPaperPilotScene } from '../src/features/cutPaper/pilot.ts'
import { serializeSceneFile } from '../src/lib/sceneFile.ts'

const scene = compileCutPaperPilotScene()
writeFileSync(new URL('../public/examples/cut-paper/tijeral-la-fuente.maestro-scene.json', import.meta.url), serializeSceneFile(scene))
console.log(`wrote ${scene.layers.length} layers, ${scene.duration}s`)
