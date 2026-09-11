import { EXPRESSIONS, VISEMES, type Expression, type Viseme } from './src/features/scene3d/speech/types.ts'
import {
  EXPRESSION_EYES,
  FACE_PLANE_REST_PROMPT,
  VISEME_ALIASES,
  VISEME_MOUTHS,
  expressionPrompt,
  fillFacePrompt,
  parseFacePackStillName,
  visemePrompt,
} from './src/features/scene3d/speech/facePackPrompts.ts'

const TILE = 128
const skinInput = document.querySelector('#skin') as HTMLInputElement
const restBox = document.querySelector('#rest-prompt') as HTMLTextAreaElement
const promptList = document.querySelector('#prompt-list') as HTMLDivElement
const slotsEl = document.querySelector('#slots') as HTMLDivElement
const status = document.querySelector('#status') as HTMLParagraphElement
const preview = document.querySelector('#preview') as HTMLCanvasElement
const downloadBtn = document.querySelector('#download') as HTMLButtonElement
const files = document.querySelector('#files') as HTMLInputElement
const stills = new Map<string, HTMLImageElement>()

function skin() {
  return skinInput.value.trim() || 'cream skin'
}

function renderPrompts() {
  restBox.value = fillFacePrompt(FACE_PLANE_REST_PROMPT, skin())
  promptList.replaceChildren()
  for (const viseme of VISEMES) {
    if (viseme === 'rest') continue
    const alias = VISEME_ALIASES[viseme]
    const block = document.createElement('div')
    const area = document.createElement('textarea')
    area.id = `p-${viseme}`
    area.readOnly = true
    area.value = alias
      ? `Alias of ${alias}. Optional. ${visemePrompt(viseme, skin())}`
      : visemePrompt(viseme, skin())
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = `Copiar ${viseme}`
    btn.dataset.copy = area.id
    const label = document.createElement('label')
    label.textContent = `Visema ${viseme} — ${VISEME_MOUTHS[viseme as Exclude<Viseme, 'rest'>].slice(22)}`
    block.append(label, area, btn)
    promptList.append(block)
  }
  for (const expression of EXPRESSIONS) {
    if (expression === 'neutral') continue
    const block = document.createElement('div')
    const area = document.createElement('textarea')
    area.id = `p-${expression}`
    area.readOnly = true
    area.value = expressionPrompt(expression, skin())
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = `Copiar ${expression}`
    btn.dataset.copy = area.id
    const label = document.createElement('label')
    label.textContent = `Expresión ${expression} — ${EXPRESSION_EYES[expression as Exclude<Expression, 'neutral'>].slice(40)}`
    block.append(label, area, btn)
    promptList.append(block)
  }
}

function drawSlot(key: string, img?: HTMLImageElement) {
  let slot = document.querySelector(`[data-slot="${key}"]`) as HTMLDivElement | null
  if (!slot) {
    slot = document.createElement('div')
    slot.className = 'slot'
    slot.dataset.slot = key
    slotsEl.append(slot)
  }
  slot.replaceChildren()
  const title = document.createElement('strong')
  title.textContent = key
  slot.append(title)
  if (img) {
    const previewImg = document.createElement('img')
    previewImg.src = img.src
    previewImg.alt = key
    slot.append(previewImg)
  }
}

function ensureSlots() {
  drawSlot('rest', stills.get('rest'))
  for (const viseme of VISEMES) {
    if (viseme === 'rest') continue
    drawSlot(viseme, stills.get(viseme))
  }
  for (const expression of EXPRESSIONS) {
    if (expression === 'neutral') continue
    drawSlot(expression, stills.get(expression))
  }
}

function luma(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function borderMean(data: Uint8ClampedArray) {
  let sr = 0, sg = 0, sb = 0, n = 0
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (x >= 10 && x < TILE - 10 && y >= 10 && y < TILE - 10) continue
      const i = (y * TILE + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      if (luma(r, g, b) < 28) continue
      sr += r; sg += g; sb += b; n++
    }
  }
  return n < 16 ? [1, 1, 1] : [sr / n, sg / n, sb / n]
}

function matchSkin(tile: ImageData, ref: ImageData) {
  const [tr, tg, tb] = borderMean(tile.data)
  const [rr, rg, rb] = borderMean(ref.data)
  const kr = rr / tr, kg = rg / tg, kb = rb / tb
  const out = new ImageData(new Uint8ClampedArray(tile.data), TILE, TILE)
  for (let i = 0; i < out.data.length; i += 4) {
    const r = out.data[i], g = out.data[i + 1], b = out.data[i + 2]
    if (luma(r, g, b) < 28) continue
    out.data[i] = Math.max(0, Math.min(255, Math.round(r * kr)))
    out.data[i + 1] = Math.max(0, Math.min(255, Math.round(g * kg)))
    out.data[i + 2] = Math.max(0, Math.min(255, Math.round(b * kb)))
  }
  return out
}

function pasteMouth(base: ImageData, viseme: ImageData, cx: number, cy: number, rx: number, ry: number) {
  const out = new ImageData(new Uint8ClampedArray(base.data), TILE, TILE)
  for (let y = 0; y < TILE; y++) {
    const ny = (y + 0.5 - cy) / ry
    for (let x = 0; x < TILE; x++) {
      const nx = (x + 0.5 - cx) / rx
      const d = nx * nx + ny * ny
      if (d > 1.2) continue
      const a = d <= 0.92 ? 1 : Math.max(0, 1 - (d - 0.92) / 0.28)
      const i = (y * TILE + x) * 4
      for (let c = 0; c < 3; c++) {
        out.data[i + c] = Math.round(out.data[i + c] * (1 - a) + viseme.data[i + c] * a)
      }
    }
  }
  return out
}

function raster(img: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = TILE
  canvas.height = TILE
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, TILE, TILE)
  return ctx.getImageData(0, 0, TILE, TILE)
}

function pickViseme(id: Viseme) {
  const alias = VISEME_ALIASES[id]
  return stills.get(id) ?? (alias ? stills.get(alias) : undefined) ?? stills.get('rest')
}

function build() {
  const restImg = stills.get('rest')
  if (!restImg) {
    status.textContent = 'Falta rest.png'
    return
  }
  const rest = raster(restImg)
  const vis: Record<string, ImageData> = { rest: matchSkin(rest, rest) }
  for (const viseme of VISEMES) {
    if (viseme === 'rest') continue
    const img = pickViseme(viseme)
    vis[viseme] = img ? matchSkin(raster(img), rest) : vis.rest
  }
  const expr: Record<string, ImageData> = { neutral: vis.rest }
  for (const expression of EXPRESSIONS) {
    if (expression === 'neutral') continue
    const img = stills.get(expression)
    expr[expression] = img ? matchSkin(raster(img), rest) : vis.rest
  }
  const ctx = preview.getContext('2d')!
  ctx.clearRect(0, 0, preview.width, preview.height)
  const scratch = document.createElement('canvas')
  scratch.width = TILE
  scratch.height = TILE
  const sctx = scratch.getContext('2d')!
  for (const [row, expression] of EXPRESSIONS.entries()) {
    const base = expr[expression]
    for (const [col, viseme] of VISEMES.entries()) {
      const tile = viseme === 'rest' ? base : pasteMouth(base, vis[viseme], 64, 92, 30, 18)
      sctx.putImageData(tile, 0, 0)
      ctx.drawImage(scratch, col * TILE, row * TILE)
    }
  }
  downloadBtn.disabled = false
  status.textContent = `9×6 listo (${TILE} px). Color anclado al reposo.`
}

function loadFile(file: File) {
  const parsed = parseFacePackStillName(file.name)
  if (!parsed) {
    status.textContent = `Nombre no reconocido: ${file.name}`
    return
  }
  const img = new Image()
  img.onload = () => {
    const key = parsed.kind === 'rest' ? 'rest' : parsed.id
    stills.set(key, img)
    ensureSlots()
    status.textContent = `Cargado ${key}`
  }
  img.src = URL.createObjectURL(file)
}

renderPrompts()
ensureSlots()
skinInput.addEventListener('input', renderPrompts)
document.addEventListener('click', event => {
  const btn = (event.target as HTMLElement).closest('button[data-copy]') as HTMLButtonElement | null
  if (!btn?.dataset.copy) return
  const area = document.getElementById(btn.dataset.copy) as HTMLTextAreaElement | null
  if (area) void navigator.clipboard.writeText(area.value)
})
files.addEventListener('change', () => {
  for (const file of files.files ?? []) loadFile(file)
})
document.querySelector('#build')!.addEventListener('click', build)
downloadBtn.addEventListener('click', () => {
  preview.toBlob(blob => {
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'pack.png'
    a.click()
  })
})
