import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FocusTrap } from './FocusTrap.js'
import type { GridCell, GridConfig } from '../types/index.js'

const GRID: GridConfig = { rows: 3, columns: 3 }

function makeCell(row: number, col: number): GridCell {
  const btn = document.createElement('button')
  btn.focus = vi.fn() // jsdom focus is a no-op; mock it to track calls
  return { element: btn, position: { row, col }, label: `Cell ${row}-${col}` }
}

function makeGrid(grid: GridConfig): GridCell[][] {
  return Array.from({ length: grid.rows }, (_, r) =>
    Array.from({ length: grid.columns }, (_, c) => makeCell(r, c)),
  )
}

function fire(container: HTMLElement, key: string, shiftKey = false): void {
  container.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
}

describe('FocusTrap', () => {
  let container: HTMLDivElement
  let cells: GridCell[][]
  let trap: FocusTrap

  beforeEach(() => {
    container = document.createElement('div')
    cells = makeGrid(GRID)
    trap = new FocusTrap(container, cells, GRID)
  })

  // ─── Activate / deactivate ─────────────────────────────────────────────────

  it('does not fire callbacks before activate()', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    fire(container, 'ArrowRight')
    expect(cb).not.toHaveBeenCalled()
  })

  it('fires callbacks after activate()', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    fire(container, 'ArrowRight')
    expect(cb).toHaveBeenCalledOnce()
  })

  it('stops firing after deactivate()', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    trap.deactivate()
    fire(container, 'ArrowRight')
    expect(cb).not.toHaveBeenCalled()
  })

  it('activate() is idempotent — does not double-register the listener', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    trap.activate()
    fire(container, 'ArrowRight')
    expect(cb).toHaveBeenCalledOnce()
  })

  // ─── Arrow key navigation ──────────────────────────────────────────────────

  it('ArrowRight moves col +1', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    fire(container, 'ArrowRight')
    expect(cb).toHaveBeenCalledWith(0, 1)
  })

  it('ArrowDown moves row +1', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    fire(container, 'ArrowDown')
    expect(cb).toHaveBeenCalledWith(1, 0)
  })

  it('ArrowLeft wraps to previous row last column', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    // Start at (0,0) — ArrowLeft should wrap to last cell (2,2)
    fire(container, 'ArrowLeft')
    expect(cb).toHaveBeenCalledWith(2, 2)
  })

  it('ArrowRight wraps column at end of row', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    // Move to (0,2) then ArrowRight → (1,0)
    trap.focusCell(0, 2)
    cb.mockClear()
    fire(container, 'ArrowRight')
    expect(cb).toHaveBeenCalledWith(1, 0)
  })

  it('ArrowDown wraps row at bottom', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    trap.focusCell(2, 1)
    cb.mockClear()
    fire(container, 'ArrowDown')
    expect(cb).toHaveBeenCalledWith(0, 1)
  })

  it('ArrowUp wraps row at top', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    fire(container, 'ArrowUp')
    expect(cb).toHaveBeenCalledWith(2, 0)
  })

  // ─── Tab / Shift+Tab ───────────────────────────────────────────────────────

  it('Tab moves to next cell linearly', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    fire(container, 'Tab')
    expect(cb).toHaveBeenCalledWith(0, 1)
  })

  it('Tab wraps from last cell to first', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    trap.focusCell(2, 2)
    cb.mockClear()
    fire(container, 'Tab')
    expect(cb).toHaveBeenCalledWith(0, 0)
  })

  it('Shift+Tab moves to previous cell linearly', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    trap.focusCell(1, 1)
    cb.mockClear()
    fire(container, 'Tab', true)
    expect(cb).toHaveBeenCalledWith(1, 0)
  })

  // ─── Enter / Space ────────────────────────────────────────────────────────

  it('Enter fires callback on the current cell (zoom intent)', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    trap.focusCell(1, 2)
    cb.mockClear()
    fire(container, 'Enter')
    expect(cb).toHaveBeenCalledWith(1, 2)
  })

  it('Space fires callback on the current cell (zoom intent)', () => {
    const cb = vi.fn()
    trap.onCellFocus(cb)
    trap.activate()
    trap.focusCell(0, 1)
    cb.mockClear()
    fire(container, ' ')
    expect(cb).toHaveBeenCalledWith(0, 1)
  })

  // ─── Escape ───────────────────────────────────────────────────────────────

  it('Escape fires sentinel (-1, -1) then focuses (0,0)', () => {
    const calls: [number, number][] = []
    trap.onCellFocus((r, c) => calls.push([r, c]))
    trap.activate()
    trap.focusCell(2, 2)
    calls.length = 0
    fire(container, 'Escape')
    expect(calls[0]).toEqual([-1, -1])  // sentinel first
    expect(calls[1]).toEqual([0, 0])    // then home cell
  })
})
