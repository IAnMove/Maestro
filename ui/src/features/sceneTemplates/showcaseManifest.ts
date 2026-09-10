export const SHOWCASE_SCHEMA = 'hocuspocus.scene-showcase' as const
export const SHOWCASE_VERSION = 1 as const
export const SHOWCASE_URL_PATTERN = /^\/scene-showcase\/[a-zA-Z0-9._-]+\.(mp4|png|jpg|json)$/

const MAX_ITEMS = 100
const MAX_SHOTS = 100
const MAX_ID_LENGTH = 100
const MAX_TITLE_LENGTH = 240
const MAX_DESCRIPTION_LENGTH = 4_000
const MAX_EFFECT_LENGTH = 240
const MAX_EFFECTS = 32
const MAX_FILENAME_LENGTH = 512
export const MAX_SCENE_JSON_BYTES = 4 * 1024 * 1024
const SHA256_PATTERN = /^[a-f0-9]{64}$/

export interface ShowcaseFileReference {
  url: string
  sha256: string
  bytes: number
  /** Required for JSON scene snapshots; absent on media-only references. */
  sceneName?: string
}

export interface ShowcaseShot {
  title: string
  scene: ShowcaseFileReference
}

export interface ShowcaseSourceAudio {
  id: string
  filename: string
  duration: number
}

export interface ShowcaseItem {
  id: string
  title: string
  kind: 'scene' | 'music_video'
  description: string
  effects: string[]
  video: ShowcaseFileReference
  poster?: ShowcaseFileReference
  scene?: ShowcaseFileReference
  shots?: ShowcaseShot[]
  sourceAudio?: ShowcaseSourceAudio
  imageProvider: 'minimax'
  imageModel: 'image-01'
  approval: 'pending'
}

export interface ShowcaseManifest {
  schema: typeof SHOWCASE_SCHEMA
  version: typeof SHOWCASE_VERSION
  title: string
  description: string
  items: ShowcaseItem[]
}

function fail(path: string, message: string): never {
  throw new Error(`Showcase ${path}: ${message}`)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'debe ser un objeto.')
  return value as Record<string, unknown>
}

function text(value: unknown, path: string, max: number, required = true): string {
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max) fail(path, `debe ser texto de 1-${max} caracteres.`)
  return value
}

function safeId(value: unknown, path: string): string {
  const id = text(value, path, MAX_ID_LENGTH)
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) fail(path, 'sólo admite caracteres seguros de identificador.')
  return id
}

function fileReference(value: unknown, path: string, extensions: readonly string[]): ShowcaseFileReference {
  const item = record(value, path)
  const url = text(item.url, `${path}.url`, 240)
  if (!SHOWCASE_URL_PATTERN.test(url)) fail(`${path}.url`, 'debe ser una URL relativa de /scene-showcase/.')
  const extension = url.slice(url.lastIndexOf('.') + 1)
  if (!extensions.includes(extension)) fail(`${path}.url`, `extensión no permitida; se esperaba ${extensions.join(' o ')}.`)
  const sha256 = text(item.sha256, `${path}.sha256`, 64)
  if (!SHA256_PATTERN.test(sha256)) fail(`${path}.sha256`, 'debe ser SHA-256 hexadecimal en minúsculas.')
  if (typeof item.bytes !== 'number' || !Number.isSafeInteger(item.bytes) || item.bytes <= 0) fail(`${path}.bytes`, 'debe ser un entero positivo seguro.')
  if (extension === 'json' && item.bytes > MAX_SCENE_JSON_BYTES) fail(`${path}.bytes`, 'el JSON de escena no puede superar 4 MiB.')
  const sceneName = extension === 'json'
    ? text(item.sceneName, `${path}.sceneName`, MAX_TITLE_LENGTH)
    : item.sceneName === undefined ? undefined : text(item.sceneName, `${path}.sceneName`, MAX_TITLE_LENGTH)
  return { url, sha256, bytes: item.bytes, ...(sceneName ? { sceneName } : {}) }
}

function sourceAudio(value: unknown, path: string): ShowcaseSourceAudio {
  const item = record(value, path)
  const id = safeId(item.id, `${path}.id`)
  const filename = text(item.filename, `${path}.filename`, MAX_FILENAME_LENGTH)
  if (/[/\\\0\r\n]/.test(filename)) fail(`${path}.filename`, 'no puede contener separadores ni controles.')
  if (typeof item.duration !== 'number' || !Number.isFinite(item.duration) || item.duration < 0 || item.duration > 86_400) fail(`${path}.duration`, 'debe estar entre 0 y 86400 segundos.')
  return { id, filename, duration: item.duration }
}

function parseItem(value: unknown, index: number): ShowcaseItem {
  const path = `items[${index}]`
  const item = record(value, path)
  const id = safeId(item.id, `${path}.id`)
  const title = text(item.title, `${path}.title`, MAX_TITLE_LENGTH)
  const kind = item.kind
  if (kind !== 'scene' && kind !== 'music_video') fail(`${path}.kind`, 'debe ser scene o music_video.')
  const description = text(item.description, `${path}.description`, MAX_DESCRIPTION_LENGTH)
  if (!Array.isArray(item.effects) || item.effects.length > MAX_EFFECTS) fail(`${path}.effects`, `debe contener como máximo ${MAX_EFFECTS} efectos.`)
  const effects = item.effects.map((effect, effectIndex) => text(effect, `${path}.effects[${effectIndex}]`, MAX_EFFECT_LENGTH))
  const video = fileReference(item.video, `${path}.video`, ['mp4'])
  const poster = item.poster === undefined ? undefined : fileReference(item.poster, `${path}.poster`, ['png', 'jpg'])
  const scene = item.scene === undefined ? undefined : fileReference(item.scene, `${path}.scene`, ['json'])
  const shots = item.shots === undefined ? undefined : (() => {
    if (!Array.isArray(item.shots) || item.shots.length > MAX_SHOTS) fail(`${path}.shots`, `debe contener como máximo ${MAX_SHOTS} planos.`)
    return item.shots.map((shot, shotIndex) => {
      const parsed = record(shot, `${path}.shots[${shotIndex}]`)
      return { title: text(parsed.title, `${path}.shots[${shotIndex}].title`, MAX_TITLE_LENGTH), scene: fileReference(parsed.scene, `${path}.shots[${shotIndex}].scene`, ['json']) }
    })
  })()
  const sourceAudioValue = item.sourceAudio === undefined ? undefined : sourceAudio(item.sourceAudio, `${path}.sourceAudio`)
  if (kind === 'scene' && !scene) fail(`${path}.scene`, 'las escenas necesitan una referencia JSON editable.')
  if (kind === 'music_video' && !scene && (!shots || shots.length === 0)) fail(`${path}.shots`, 'un videoclip necesita una escena editable o al menos un plano guardado.')
  if (item.imageProvider !== 'minimax') fail(`${path}.imageProvider`, 'debe ser minimax.')
  if (item.imageModel !== 'image-01') fail(`${path}.imageModel`, 'debe ser image-01.')
  if (item.approval !== 'pending') fail(`${path}.approval`, 'debe permanecer pending hasta una aprobación explícita.')
  return { id, title, kind, description, effects, video, ...(poster ? { poster } : {}), ...(scene ? { scene } : {}), ...(shots ? { shots } : {}), ...(sourceAudioValue ? { sourceAudio: sourceAudioValue } : {}), imageProvider: 'minimax', imageModel: 'image-01', approval: 'pending' }
}

/** Validates and returns a safe, typed manifest; it never downloads or mutates it. */
export function parseShowcaseManifest(value: unknown): ShowcaseManifest {
  const manifest = record(value, 'manifest')
  if (manifest.schema !== SHOWCASE_SCHEMA) fail('schema', `debe ser ${SHOWCASE_SCHEMA}.`)
  if (manifest.version !== SHOWCASE_VERSION) fail('version', 'versión no soportada.')
  const title = text(manifest.title, 'title', MAX_TITLE_LENGTH)
  const description = text(manifest.description, 'description', MAX_DESCRIPTION_LENGTH)
  if (!Array.isArray(manifest.items) || manifest.items.length > MAX_ITEMS) fail('items', `debe contener como máximo ${MAX_ITEMS} elementos.`)
  const items = manifest.items.map(parseItem)
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) fail('items', `id duplicado: ${item.id}.`)
    ids.add(item.id)
  }
  return { schema: SHOWCASE_SCHEMA, version: SHOWCASE_VERSION, title, description, items }
}

export function isShowcaseUrl(value: unknown): value is string {
  return typeof value === 'string' && SHOWCASE_URL_PATTERN.test(value)
}
