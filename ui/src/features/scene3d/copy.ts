import type { ParseKeys, TOptions } from 'i18next'
import i18n from '../../i18n'

export function scene3dCopy(key: ParseKeys<'scene3d'>, options?: TOptions) {
  return String(i18n.t(key, { ns: 'scene3d', ...(options ?? {}) }))
}
