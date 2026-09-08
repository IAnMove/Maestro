import fs from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
const output=process.argv[2]
if(!output)throw Error('Pass a JSON output path')
const source=process.env.HOCUSPOCUS_E2E_UI_SOURCE || path.resolve('.')
const {listCapabilities}=await import(pathToFileURL(path.join(source,'src/features/agent/capabilityRegistry.ts')).href)
const capabilities=listCapabilities().map(c=>({name:c.name,title:c.title,description:c.description,useWhen:c.useWhen,parameters:c.parameters,inputSchema:c.inputSchema,risk:c.risk,presentation:c.presentation}))
await fs.writeFile(output,JSON.stringify({source,capabilities},null,2))
console.log(`${capabilities.length} registered capabilities exported to ${output}`)
