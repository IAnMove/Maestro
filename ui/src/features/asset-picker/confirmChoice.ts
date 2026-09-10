import type { ApiOutput } from '../../api/outputs'
import { checkCompatibility, outputToPickerItem } from './adapters.ts'
import { isSameRef, type AssetConstraints, type PickerItem } from './types.ts'

export function livePickerItem(items: readonly PickerItem[], picked: PickerItem | null): PickerItem | null {
  if (!picked) return null
  return items.find(item => isSameRef(item.ref, picked.ref) && item.url === picked.url) ?? null
}

export function matchOutputByPicker(
  outputs: readonly ApiOutput[],
  item: PickerItem,
  workspaceId: string,
): ApiOutput | undefined {
  return outputs.find(entry => {
    const mapped = outputToPickerItem(entry, workspaceId)
    return isSameRef(mapped.ref, item.ref) && mapped.url === item.url
  })
}

export function confirmPickerChoice(
  outputs: readonly ApiOutput[],
  pickerItems: readonly PickerItem[],
  picked: PickerItem | null,
  workspaceId: string,
  constraints: AssetConstraints | undefined,
  onChoose: (item: ApiOutput | null) => void,
  onClose: () => void,
): boolean {
  if (!picked) {
    onChoose(null)
    onClose()
    return true
  }
  const live = livePickerItem(pickerItems, picked)
  if (!live) return false
  if (constraints && !checkCompatibility(live, constraints, 0).allowed) return false
  const output = matchOutputByPicker(outputs, live, workspaceId)
  if (!output) return false
  onChoose(output)
  onClose()
  return true
}
