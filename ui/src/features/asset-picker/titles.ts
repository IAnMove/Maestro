import type { ParseKeys } from 'i18next'
import type { AssetKind } from '../../api/assets'
import i18n from '../../i18n'

const TYPE_KEYS: Record<AssetKind, ParseKeys<'common'>> = {
  image: 'explorer.typeImage',
  video: 'explorer.typeVideo',
  model3d: 'explorer.typeModel',
  audio: 'explorer.typeAudio',
  scene: 'explorer.typeScene',
  document: 'explorer.typeDocument',
  other: 'explorer.typeDocument',
}

export function knownCreatedAt(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value
}

export function formatUnknownDate(): string {
  return String(i18n.t('picker.unknownDate', { ns: 'common' }))
}

export function formatCreatedDate(createdAt: number | null, locale?: string): string {
  if (createdAt == null) return formatUnknownDate()
  return new Date(createdAt * 1000).toLocaleString(locale)
}

export function displayAssetTitle(kind: AssetKind, createdAt: number | null): string {
  const type = String(i18n.t(TYPE_KEYS[kind] ?? 'explorer.typeImage', { ns: 'common' }))
  if (createdAt == null) return String(i18n.t('picker.titleUnknownDate', { ns: 'common', type }))
  return String(i18n.t('picker.titleWithDate', { ns: 'common', type, date: formatCreatedDate(createdAt) }))
}
