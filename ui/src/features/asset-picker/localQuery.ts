import type { AssetKind } from '../../api/assets'
import { assetRefKey, type CatalogSort, type PickerItem } from './types.ts'

export function filterPickerItems(
  items: readonly PickerItem[],
  query: string,
  kinds?: readonly AssetKind[],
): PickerItem[] {
  const needle = query.trim().toLowerCase()
  const wanted = kinds?.length ? new Set(kinds) : null
  return items.filter(item => {
    if (wanted && !wanted.has(item.kind)) return false
    if (!needle) return true
    return item.filename.toLowerCase().includes(needle)
      || item.title.toLowerCase().includes(needle)
      || item.kind.includes(needle)
  })
}

export function sortPickerItems(items: readonly PickerItem[], sort: CatalogSort): PickerItem[] {
  const copy = [...items]
  const ident = (item: PickerItem) => assetRefKey(item.ref)
  const name = (item: PickerItem) => item.filename.toLowerCase()
  if (sort === 'name_asc') {
    copy.sort((left, right) => name(left).localeCompare(name(right)) || ident(left).localeCompare(ident(right)))
    return copy
  }
  if (sort === 'name_desc') {
    copy.sort((left, right) => ident(left).localeCompare(ident(right)))
    copy.sort((left, right) => name(right).localeCompare(name(left)))
    return copy
  }
  const missing = (item: PickerItem) => item.createdAt == null
  const stamp = (item: PickerItem) => item.createdAt ?? 0
  if (sort === 'created_asc') {
    copy.sort((left, right) => (
      Number(missing(left)) - Number(missing(right))
      || stamp(left) - stamp(right)
      || ident(left).localeCompare(ident(right))
    ))
    return copy
  }
  copy.sort((left, right) => (
    Number(missing(left)) - Number(missing(right))
    || stamp(right) - stamp(left)
    || ident(left).localeCompare(ident(right))
  ))
  return copy
}

export function paginatePickerItems(items: readonly PickerItem[], page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize) || 1)
  const safePage = Math.min(Math.max(0, page), pages - 1)
  const start = safePage * pageSize
  return {
    pages,
    safePage,
    visible: items.slice(start, start + pageSize),
  }
}
