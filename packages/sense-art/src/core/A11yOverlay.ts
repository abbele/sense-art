import type { GridCell, GridConfig } from '../types/index.js'

/**
 * Manages the transparent ARIA grid overlay positioned above the OSD canvas.
 *
 * The overlay is a `role="grid"` container populated with `role="gridcell"` buttons.
 * It uses `pointer-events: none` on the container and `pointer-events: auto` on cells
 * so that OSD mouse interactions are not blocked.
 */
export class A11yOverlay {
  private root: HTMLDivElement | null = null
  private cells: GridCell[][] = []
  private readonly container: HTMLElement
  private readonly grid: GridConfig

  constructor(container: HTMLElement, grid: GridConfig) {
    this.container = container
    this.grid = grid
  }

  /**
   * Injects the ARIA grid overlay into the container element.
   *
   * @accessibility
   * - Creates `<div role="grid" aria-label="Navigazione opera d'arte">`.
   * - Each row is wrapped in `<div role="row" style="display:contents">` — required
   *   by WAI-ARIA 1.2 Grid Pattern. `display:contents` makes the wrapper invisible
   *   to CSS layout while preserving the ARIA tree structure (VoiceOver/NVDA compliant).
   * - Each cell is `<button role="gridcell">` inside its row wrapper.
   * - The first cell (0,0) receives `tabindex="0"` (roving tabindex); all others get `-1`.
   * - `aria-rowcount` and `aria-colcount` reflect the configured grid dimensions.
   */
  render(getCellLabel: (row: number, col: number) => string): void {
    this.destroy()

    this.root = document.createElement('div')
    this.root.setAttribute('role', 'grid')
    this.root.setAttribute('aria-label', 'Navigazione opera d\'arte')
    this.root.setAttribute('aria-rowcount', String(this.grid.rows))
    this.root.setAttribute('aria-colcount', String(this.grid.columns))
    Object.assign(this.root.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      display: 'grid',
      gridTemplateRows: `repeat(${this.grid.rows}, 1fr)`,
      gridTemplateColumns: `repeat(${this.grid.columns}, 1fr)`,
    })

    this.cells = []

    for (let r = 0; r < this.grid.rows; r++) {
      // role="row" wrapper — required by WAI-ARIA 1.2 Grid Pattern.
      // display:contents removes it from the box model so CSS grid still
      // treats the buttons as direct grid children.
      const rowEl = document.createElement('div')
      rowEl.setAttribute('role', 'row')
      rowEl.setAttribute('aria-rowindex', String(r + 1))
      rowEl.style.display = 'contents'

      const rowCells: GridCell[] = []

      for (let c = 0; c < this.grid.columns; c++) {
        const label = getCellLabel(r, c)
        const btn = document.createElement('button')
        btn.setAttribute('role', 'gridcell')
        btn.setAttribute('aria-label', label)
        btn.setAttribute('aria-rowindex', String(r + 1))
        btn.setAttribute('aria-colindex', String(c + 1))
        btn.setAttribute('aria-current', 'false')
        btn.setAttribute('tabindex', r === 0 && c === 0 ? '0' : '-1')
        btn.className = 'sa-gridcell'
        Object.assign(btn.style, {
          pointerEvents: 'auto',
          background: 'transparent',
          border: 'none',
          cursor: 'default',
          width: '100%',
          height: '100%',
          outline: 'none',
        })
        btn.addEventListener('focus', () => {
          btn.style.outline = '3px solid #005fcc'
          btn.style.outlineOffset = '-3px'
        })
        btn.addEventListener('blur', () => {
          btn.style.outline = 'none'
        })

        rowEl.appendChild(btn)
        rowCells.push({ element: btn, position: { row: r, col: c }, label })
      }

      this.root.appendChild(rowEl)
      this.cells.push(rowCells)
    }

    this.container.style.position = 'relative'
    this.container.appendChild(this.root)
  }

  /**
   * Updates the `aria-label` of a specific cell.
   *
   * @param row - Zero-based row index
   * @param col - Zero-based column index
   * @param label - New label string
   *
   * @accessibility
   * Label changes take effect immediately. If the cell is focused, the screen
   * reader will re-read the button label on the next announcement cycle.
   */
  updateCellLabel(row: number, col: number, label: string): void {
    const cell = this.getCell(row, col)
    cell.element.setAttribute('aria-label', label)
    cell.label = label
  }

  /**
   * Sets `aria-current="true"` on the given cell and removes it from all others.
   *
   * @accessibility
   * `aria-current` marks the cell that corresponds to the currently visible viewport
   * region, even when the user navigated via mouse or touch (not keyboard).
   */
  setCurrentCell(row: number, col: number): void {
    for (const rowCells of this.cells) {
      for (const cell of rowCells) {
        const isCurrent = cell.position.row === row && cell.position.col === col
        cell.element.setAttribute('aria-current', isCurrent ? 'true' : 'false')
      }
    }
  }

  /**
   * Updates the roving tabindex: only the given cell has `tabindex="0"`.
   *
   * @accessibility
   * Required by the Grid Pattern (WAI-ARIA 1.2). Only one cell is in the
   * tab sequence at a time to prevent excessive Tab stops.
   */
  setRovingFocus(row: number, col: number): void {
    for (const rowCells of this.cells) {
      for (const cell of rowCells) {
        const isActive = cell.position.row === row && cell.position.col === col
        cell.element.setAttribute('tabindex', isActive ? '0' : '-1')
      }
    }
  }

  getCell(row: number, col: number): GridCell {
    const cell = this.cells[row]?.[col]
    if (!cell) throw new Error(`Cell (${row}, ${col}) does not exist in the grid`)
    return cell
  }

  getAllCells(): GridCell[][] {
    return this.cells
  }

  /** Remove the overlay from the DOM and release references. */
  destroy(): void {
    this.root?.remove()
    this.root = null
    this.cells = []
  }
}
