import type { AssetCatalogItem, AssetLocation } from '../../api/assets'

/** Match the API's urllib.parse.quote(value, safe=''), including !'()*. */
const quote = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)

/** One shared location contract for preview and compile; metadata suitability
 * is separate so a legacy image may be previewed without claiming durable ID. */
export function catalogLocation(item: AssetCatalogItem, workspace: string): AssetLocation {
  const locations = item.locations.filter(location => location.workspace_id === workspace)
  if (locations.length !== 1) throw new Error('El asset necesita una ubicación inequívoca en el workspace activo.')
  const location = locations[0]
  if (!location.filename || ['.', '..'].includes(location.filename) || /[\\/]/.test(location.filename)
    || [...location.filename].some(char => char.charCodeAt(0) < 32)) throw new Error('Nombre de archivo de Library no válido.')
  const expectedUrl = `/api/v1/file/${quote(location.filename)}?workspace=${quote(workspace)}`
  if (location.url !== expectedUrl) throw new Error('Referencia de Library no válida para este workspace; no se aceptan URLs externas ni temporales.')
  return location
}
