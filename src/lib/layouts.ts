/**
 * Frame layouts (docs/user-flow.md, screen 2).
 *
 * All numbers are in output pixels of the final composed image.
 * A layout is plain data; cellRects() turns it into pixel rects.
 * Cells share the space left after pad (left/right/top), gap and footer.
 */

export type LayoutId = '1x4' | '2x3' | '2x4'

export interface Layout {
  id: LayoutId
  /** Korean display name */
  name: string
  /** Final canvas size in px */
  width: number
  height: number
  cols: number
  rows: number
  /** Photos to take in normal mode */
  shots: number
  /** Photos to take with eightShotMode (2x4 only) */
  shotsEight?: number
  /** Outer margin left/right/top */
  pad: number
  /** Space between cells */
  gap: number
  /** Reserved band at the bottom for logo / date / text */
  footer: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface CellRect extends Rect {
  /** Index into store.shots that fills this cell */
  shotIndex: number
}

export const LAYOUTS: Record<LayoutId, Layout> = {
  '1x4': {
    id: '1x4',
    name: '1x4 스트립',
    width: 600,
    height: 1800,
    cols: 1,
    rows: 4,
    shots: 4,
    pad: 40,
    gap: 24,
    footer: 200,
  },
  '2x3': {
    id: '2x3',
    name: '2x3 그리드',
    width: 1200,
    height: 1800,
    cols: 2,
    rows: 3,
    shots: 6,
    pad: 48,
    gap: 28,
    footer: 220,
  },
  '2x4': {
    id: '2x4',
    name: '2x4 그리드',
    width: 1200,
    height: 1800,
    cols: 2,
    rows: 4,
    // 4 shots: row r shows shot r in both columns (two identical strips).
    // eightShotMode: 8 distinct shots.
    shots: 4,
    shotsEight: 8,
    pad: 40,
    gap: 24,
    footer: 200,
  },
}

export const LAYOUT_IDS = Object.keys(LAYOUTS) as LayoutId[]
export const DEFAULT_LAYOUT_ID: LayoutId = '1x4'

/** Layout data; falls back to the default layout for unknown ids. */
export function getLayout(layoutId: LayoutId | string): Layout {
  return LAYOUTS[layoutId as LayoutId] ?? LAYOUTS[DEFAULT_LAYOUT_ID]
}

/** Number of photos the user takes for this layout/mode. */
export function shotCount(layout: Layout, eightShotMode = false): number {
  if (eightShotMode && layout.shotsEight) return layout.shotsEight
  return layout.shots
}

/**
 * Pixel rects for every cell, in reading order (left to right, top to bottom).
 * Pure function: same input, same output, no DOM.
 * For 2x4 without eightShotMode there are 8 cells but 4 shots (row r -> shot r).
 */
export function cellRects(layout: Layout, eightShotMode = false): CellRect[] {
  const { width, height, cols, rows, pad, gap, footer } = layout
  const innerW = width - pad * 2
  const innerH = height - pad - footer
  const w = (innerW - gap * (cols - 1)) / cols
  const h = (innerH - gap * (rows - 1)) / rows
  const duplicated = layout.id === '2x4' && !eightShotMode

  const rects: CellRect[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push({
        x: Math.round(pad + c * (w + gap)),
        y: Math.round(pad + r * (h + gap)),
        w: Math.round(w),
        h: Math.round(h),
        shotIndex: duplicated ? r : r * cols + c,
      })
    }
  }
  return rects
}

/** Footer band rect (for logo, date stamp, custom text). */
export function footerRect(layout: Layout): Rect {
  return { x: 0, y: layout.height - layout.footer, w: layout.width, h: layout.footer }
}

/** Aspect ratio (w / h) of one cell. Shoot uses it to crop the camera preview. */
export function cellAspect(layout: Layout, eightShotMode = false): number {
  const [first] = cellRects(layout, eightShotMode)
  return first.w / first.h
}
