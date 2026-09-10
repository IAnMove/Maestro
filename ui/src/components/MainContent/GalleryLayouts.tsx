import { useMemo, useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { GalleryTile } from './GalleryTile'
import type { OutputFile } from '../../types'

const GAP = 12
const MIN_TILE = 190
const MASONRY_PAGE_SIZE = 120

/** Grid and mosaic layouts for the gallery. Kept out of the entry chunk —
 *  the one-up feed is what loads with the app, and these arrive when the
 *  reader actually asks for them. */
export default function GalleryLayouts({
  view, outputs, workspace, activeIndex, containerWidth, containerHeight, scrollTop, onOpen,
}: {
  view: 'grid' | 'masonry'
  outputs: OutputFile[]
  workspace: string
  activeIndex: number
  containerWidth: number
  containerHeight: number
  scrollTop: number
  onOpen: (index: number) => void
}) {
  const { t } = useTranslation('activity')
  const [page, setPage] = useState(1)
  const columns = Math.max(1, Math.floor((containerWidth + GAP) / (MIN_TILE + GAP)))
  const tile = Math.floor((containerWidth - GAP * (columns - 1)) / columns)
  const rowHeight = tile + GAP

  // Every cell is square, so every row is the same height: the window is
  // arithmetic instead of per-item measurement.
  const grid = useMemo(() => {
    if (view !== 'grid') return null
    const totalRows = Math.ceil(outputs.length / columns)
    const overscan = 2
    const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    const lastRow = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan)
    const cells: JSX.Element[] = []
    for (let row = firstRow; row < lastRow; row++) {
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column
        const file = outputs[index]
        if (!file) break
        cells.push(
          <GalleryTile
            key={file.name}
            file={file}
            workspace={workspace}
            active={activeIndex === index}
            fixedAspect
            onOpen={() => onOpen(index)}
            style={{
              position: 'absolute',
              top: row * rowHeight,
              left: column * (tile + GAP),
              width: tile,
              height: tile,
            }}
          />
        )
      }
    }
    return { cells, height: totalRows * rowHeight }
  }, [view, outputs, columns, rowHeight, tile, scrollTop, containerHeight, activeIndex, workspace, onOpen])

  if (view === 'grid' && grid) {
    return <div className="relative" style={{ height: grid.height }}>{grid.cells}</div>
  }

  // Mosaic keeps every aspect ratio, so item heights are unknown until the
  // images load and a column layout cannot be windowed by height. It grows a
  // page at a time rather than asking the browser to lay out the workspace.
  const shown = outputs.slice(0, page * MASONRY_PAGE_SIZE)
  return (
    <div>
      <div
        className="[column-gap:12px] [columns:var(--hp-masonry-cols)]"
        style={{ '--hp-masonry-cols': String(columns) } as CSSProperties}
      >
        {shown.map((file, index) => (
          <div key={file.name} className="mb-3 break-inside-avoid">
            <GalleryTile
              file={file}
              workspace={workspace}
              active={activeIndex === index}
              fixedAspect={false}
              onOpen={() => onOpen(index)}
            />
          </div>
        ))}
      </div>
      {outputs.length > shown.length && (
        <div className="flex justify-center py-4">
          <button
            type="button"
            onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-light hover:text-text-primary"
          >
            {t('catalog.loadMore')}
          </button>
        </div>
      )}
    </div>
  )
}
