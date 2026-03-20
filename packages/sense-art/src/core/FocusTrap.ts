import type { GridCell, GridConfig } from '../types/index.js'

type CellFocusCallback = (row: number, col: number) => void

/**
 * Manages keyboard navigation within the ARIA grid.
 *
 * Implements the Grid Pattern keyboard interaction model from WAI-ARIA 1.2:
 * Arrow keys for spatial navigation, Tab/Shift+Tab for linear cycling,
 * Escape to reset zoom and return to home cell.
 */
export class FocusTrap {
  private active = false
  private currentRow = 0
  private currentCol = 0
  private focusCallbacks: CellFocusCallback[] = []
  private boundHandler: (e: KeyboardEvent) => void
  private readonly container: HTMLElement
  private readonly cells: GridCell[][]
  private readonly grid: GridConfig

  constructor(container: HTMLElement, cells: GridCell[][], grid: GridConfig) {
    this.container = container
    this.cells = cells
    this.grid = grid
    this.boundHandler = this.handleKeydown.bind(this)
  }

  /**
   * Activates keyboard interception on the container.
   *
   * @accessibility
   * - Intercepts `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Tab`,
   *   `Shift+Tab`, and `Escape` within the grid container.
   * - Prevents default browser behavior for all intercepted keys to avoid
   *   page scrolling during grid navigation.
   * - Does NOT intercept keys outside the container element.
   */
  activate(): void {
    if (this.active) return
    this.container.addEventListener('keydown', this.boundHandler)
    this.active = true
  }

  /** Deactivates keyboard interception. */
  deactivate(): void {
    this.container.removeEventListener('keydown', this.boundHandler)
    this.active = false
  }

  /**
   * Programmatically moves focus to the specified cell.
   *
   * @param row - Zero-based row index
   * @param col - Zero-based column index
   *
   * @accessibility
   * - Calls `.focus()` on the cell's `<button>` element.
   * - Fires all registered `onCellFocus` callbacks.
   * - Screen reader announces the button's `aria-label` automatically on focus.
   */
  focusCell(row: number, col: number): void {
    const cell = this.cells[row]?.[col]
    if (!cell) return
    this.currentRow = row
    this.currentCol = col
    cell.element.focus()
    this.focusCallbacks.forEach((cb) => cb(row, col))
  }

  /**
   * Registers a callback invoked whenever the focused cell changes.
   *
   * @param callback - Receives the new (row, col) position
   */
  onCellFocus(callback: CellFocusCallback): void {
    this.focusCallbacks.push(callback)
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (!this.active) return

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        this.move(0, 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        this.move(0, -1)
        break
      case 'ArrowDown':
        e.preventDefault()
        this.move(1, 0)
        break
      case 'ArrowUp':
        e.preventDefault()
        this.move(-1, 0)
        break
      case 'Tab':
        e.preventDefault()
        e.shiftKey ? this.movLinear(-1) : this.movLinear(1)
        break
      case 'Escape':
        e.preventDefault()
        this.focusCallbacks.forEach((cb) => cb(-1, -1)) // sentinel: reset signal
        this.focusCell(0, 0)
        break
    }
  }

  private move(dRow: number, dCol: number): void {
    let nextRow = this.currentRow + dRow
    let nextCol = this.currentCol + dCol

    // Wrap columns
    if (nextCol >= this.grid.columns) {
      nextCol = 0
      nextRow++
    } else if (nextCol < 0) {
      nextCol = this.grid.columns - 1
      nextRow--
    }

    // Wrap rows
    if (nextRow >= this.grid.rows) nextRow = 0
    else if (nextRow < 0) nextRow = this.grid.rows - 1

    this.focusCell(nextRow, nextCol)
  }

  private movLinear(direction: 1 | -1): void {
    const totalCells = this.grid.rows * this.grid.columns
    const current = this.currentRow * this.grid.columns + this.currentCol
    const next = (current + direction + totalCells) % totalCells
    const nextRow = Math.floor(next / this.grid.columns)
    const nextCol = next % this.grid.columns
    this.focusCell(nextRow, nextCol)
  }
}
