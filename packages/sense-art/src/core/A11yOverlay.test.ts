import { describe, it, expect, beforeEach } from 'vitest'
import { A11yOverlay } from './A11yOverlay.js'
import type { GridConfig } from '../types/index.js'

const GRID_3X3: GridConfig = { rows: 3, columns: 3 }
const label = (r: number, c: number) => `Cell ${r}-${c}`

describe('A11yOverlay', () => {
  let container: HTMLDivElement
  let overlay: A11yOverlay

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    overlay = new A11yOverlay(container, GRID_3X3)
  })

  // ─── ARIA structure ────────────────────────────────────────────────────────

  it('renders a role="grid" root element', () => {
    overlay.render(label)
    const grid = container.querySelector('[role="grid"]')
    expect(grid).not.toBeNull()
  })

  it('sets aria-label on the grid', () => {
    overlay.render(label)
    const grid = container.querySelector('[role="grid"]')
    expect(grid?.getAttribute('aria-label')).toBe("Navigazione opera d'arte")
  })

  it('sets aria-rowcount and aria-colcount', () => {
    overlay.render(label)
    const grid = container.querySelector('[role="grid"]')
    expect(grid?.getAttribute('aria-rowcount')).toBe('3')
    expect(grid?.getAttribute('aria-colcount')).toBe('3')
  })

  it('renders role="row" wrappers — one per row (WAI-ARIA 1.2 Grid Pattern)', () => {
    overlay.render(label)
    const rows = container.querySelectorAll('[role="row"]')
    expect(rows).toHaveLength(3)
  })

  it('each role="row" wrapper has display:contents', () => {
    overlay.render(label)
    const rows = container.querySelectorAll<HTMLElement>('[role="row"]')
    rows.forEach((row) => {
      expect(row.style.display).toBe('contents')
    })
  })

  it('renders 9 gridcell buttons in a 3x3 grid', () => {
    overlay.render(label)
    const cells = container.querySelectorAll('[role="gridcell"]')
    expect(cells).toHaveLength(9)
  })

  it('gridcells are nested inside role="row" elements', () => {
    overlay.render(label)
    const cells = container.querySelectorAll('[role="row"] [role="gridcell"]')
    expect(cells).toHaveLength(9)
  })

  it('assigns correct aria-rowindex and aria-colindex to each cell', () => {
    overlay.render(label)
    const cell = overlay.getCell(1, 2).element
    expect(cell.getAttribute('aria-rowindex')).toBe('2')
    expect(cell.getAttribute('aria-colindex')).toBe('3')
  })

  it('assigns aria-label from getCellLabel callback', () => {
    overlay.render(label)
    expect(overlay.getCell(0, 0).element.getAttribute('aria-label')).toBe('Cell 0-0')
    expect(overlay.getCell(2, 2).element.getAttribute('aria-label')).toBe('Cell 2-2')
  })

  // ─── Roving tabindex ───────────────────────────────────────────────────────

  it('only cell (0,0) has tabindex="0" after render', () => {
    overlay.render(label)
    const allCells = container.querySelectorAll('[role="gridcell"]')
    const withTabZero = Array.from(allCells).filter(
      (el) => el.getAttribute('tabindex') === '0',
    )
    expect(withTabZero).toHaveLength(1)
    expect(overlay.getCell(0, 0).element.getAttribute('tabindex')).toBe('0')
  })

  it('setRovingFocus moves tabindex="0" to the target cell', () => {
    overlay.render(label)
    overlay.setRovingFocus(1, 1)
    expect(overlay.getCell(0, 0).element.getAttribute('tabindex')).toBe('-1')
    expect(overlay.getCell(1, 1).element.getAttribute('tabindex')).toBe('0')
  })

  // ─── aria-current ──────────────────────────────────────────────────────────

  it('all cells have aria-current="false" after render', () => {
    overlay.render(label)
    const allCells = container.querySelectorAll('[role="gridcell"]')
    allCells.forEach((el) => {
      expect(el.getAttribute('aria-current')).toBe('false')
    })
  })

  it('setCurrentCell sets aria-current="true" only on the target cell', () => {
    overlay.render(label)
    overlay.setCurrentCell(2, 0)
    expect(overlay.getCell(2, 0).element.getAttribute('aria-current')).toBe('true')
    expect(overlay.getCell(0, 0).element.getAttribute('aria-current')).toBe('false')
    expect(overlay.getCell(1, 1).element.getAttribute('aria-current')).toBe('false')
  })

  it('setCurrentCell moves aria-current when called again', () => {
    overlay.render(label)
    overlay.setCurrentCell(0, 0)
    overlay.setCurrentCell(1, 2)
    expect(overlay.getCell(0, 0).element.getAttribute('aria-current')).toBe('false')
    expect(overlay.getCell(1, 2).element.getAttribute('aria-current')).toBe('true')
  })

  // ─── Label update ──────────────────────────────────────────────────────────

  it('updateCellLabel changes the aria-label', () => {
    overlay.render(label)
    overlay.updateCellLabel(0, 1, 'Regione Alto-Centro. Zoom 2x')
    expect(overlay.getCell(0, 1).element.getAttribute('aria-label')).toBe(
      'Regione Alto-Centro. Zoom 2x',
    )
  })

  // ─── Destroy ───────────────────────────────────────────────────────────────

  it('destroy removes the overlay from the DOM', () => {
    overlay.render(label)
    expect(container.querySelector('[role="grid"]')).not.toBeNull()
    overlay.destroy()
    expect(container.querySelector('[role="grid"]')).toBeNull()
  })

  it('render after destroy creates a fresh overlay', () => {
    overlay.render(label)
    overlay.destroy()
    overlay.render(label)
    expect(container.querySelectorAll('[role="grid"]')).toHaveLength(1)
    expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(9)
  })
})
