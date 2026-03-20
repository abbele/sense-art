import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OSDViewer } from '../types/index.js'
import { CoordinateMapper } from './CoordinateMapper.js'

vi.mock('openseadragon', () => {
  class Rect {
    x: number
    y: number
    width: number
    height: number
    constructor(x: number, y: number, width: number, height: number) {
      this.x = x
      this.y = y
      this.width = width
      this.height = height
    }
  }
  return { default: { Rect } }
})

function makeViewer(): OSDViewer {
  return {
    viewport: {
      imageToViewportRectangle: vi.fn((r) => r),
      fitBounds: vi.fn(),
      getZoom: vi.fn(() => 2),
      getCenter: vi.fn(() => ({ x: 0.5, y: 0.5 })),
      viewportToImageCoordinates: vi.fn((p) => p),
      goHome: vi.fn(),
    },
  } as unknown as OSDViewer
}

describe('CoordinateMapper', () => {
  let viewer: OSDViewer

  beforeEach(() => {
    viewer = makeViewer()
  })

  // ─── cellToBounds ────────────────────────────────────────────────────────────

  describe('cellToBounds', () => {
    it('3×3: top-left cell covers first third of the image', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      const rect = mapper.cellToBounds(0, 0)
      expect(rect.x).toBeCloseTo(0)
      expect(rect.y).toBeCloseTo(0)
      expect(rect.width).toBeCloseTo(1 / 3)
      expect(rect.height).toBeCloseTo(1 / 3)
    })

    it('3×3: center cell (1,1)', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      const rect = mapper.cellToBounds(1, 1)
      expect(rect.x).toBeCloseTo(1 / 3)
      expect(rect.y).toBeCloseTo(1 / 3)
      expect(rect.width).toBeCloseTo(1 / 3)
      expect(rect.height).toBeCloseTo(1 / 3)
    })

    it('3×3: bottom-right cell (2,2)', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      const rect = mapper.cellToBounds(2, 2)
      expect(rect.x).toBeCloseTo(2 / 3)
      expect(rect.y).toBeCloseTo(2 / 3)
      expect(rect.width).toBeCloseTo(1 / 3)
      expect(rect.height).toBeCloseTo(1 / 3)
    })

    it('5×5: top-left cell is 0.2×0.2', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 5, columns: 5 })
      const rect = mapper.cellToBounds(0, 0)
      expect(rect.x).toBeCloseTo(0)
      expect(rect.y).toBeCloseTo(0)
      expect(rect.width).toBeCloseTo(0.2)
      expect(rect.height).toBeCloseTo(0.2)
    })

    it('5×5: bottom-right cell (4,4) starts at 0.8', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 5, columns: 5 })
      const rect = mapper.cellToBounds(4, 4)
      expect(rect.x).toBeCloseTo(0.8)
      expect(rect.y).toBeCloseTo(0.8)
      expect(rect.width).toBeCloseTo(0.2)
      expect(rect.height).toBeCloseTo(0.2)
    })

    it('5×5: cell (2,3) has correct position', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 5, columns: 5 })
      const rect = mapper.cellToBounds(2, 3)
      expect(rect.x).toBeCloseTo(0.6)
      expect(rect.y).toBeCloseTo(0.4)
      expect(rect.width).toBeCloseTo(0.2)
      expect(rect.height).toBeCloseTo(0.2)
    })

    it('all cells in 3×3 have same width and height', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const rect = mapper.cellToBounds(r, c)
          expect(rect.width).toBeCloseTo(1 / 3)
          expect(rect.height).toBeCloseTo(1 / 3)
        }
      }
    })
  })

  // ─── focusToBounds ───────────────────────────────────────────────────────────

  describe('focusToBounds', () => {
    it('converts to viewport coordinates and calls fitBounds', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      mapper.focusToBounds(1, 1)
      expect(viewer.viewport.imageToViewportRectangle).toHaveBeenCalled()
      expect(viewer.viewport.fitBounds).toHaveBeenCalled()
    })

    it('calls fitBounds with animated=false', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      mapper.focusToBounds(0, 0)
      expect(viewer.viewport.fitBounds).toHaveBeenCalledWith(expect.anything(), false)
    })
  })

  // ─── currentRegionLabel ──────────────────────────────────────────────────────

  describe('currentRegionLabel', () => {
    it('3×3: returns Italian label for Alto-Sinistra', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      expect(mapper.currentRegionLabel(0, 0)).toBe('Alto-Sinistra')
    })

    it('3×3: returns Italian label for Centro', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      expect(mapper.currentRegionLabel(1, 1)).toBe('Centro')
    })

    it('3×3: returns Italian label for Basso-Destra', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      expect(mapper.currentRegionLabel(2, 2)).toBe('Basso-Destra')
    })

    it('4×4: falls back to numeric label', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 4, columns: 4 })
      expect(mapper.currentRegionLabel(0, 0)).toBe('Riga 1, Colonna 1')
    })

    it('4×4: bottom-right numeric label', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 4, columns: 4 })
      expect(mapper.currentRegionLabel(3, 3)).toBe('Riga 4, Colonna 4')
    })

    it('5×5: uses numeric labels', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 5, columns: 5 })
      expect(mapper.currentRegionLabel(2, 4)).toBe('Riga 3, Colonna 5')
    })
  })

  // ─── currentZoomLabel ────────────────────────────────────────────────────────

  describe('currentZoomLabel', () => {
    it('formats zoom as integer when whole number', () => {
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      expect(mapper.currentZoomLabel()).toBe('2x')
    })

    it('rounds to one decimal place', () => {
      vi.mocked(viewer.viewport.getZoom).mockReturnValue(1.567)
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      expect(mapper.currentZoomLabel()).toBe('1.6x')
    })

    it('zoom of 1 yields "1x"', () => {
      vi.mocked(viewer.viewport.getZoom).mockReturnValue(1)
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      expect(mapper.currentZoomLabel()).toBe('1x')
    })
  })

  // ─── viewportToCell ──────────────────────────────────────────────────────────

  describe('viewportToCell', () => {
    it('maps viewport center to middle cell in 3×3', () => {
      vi.mocked(viewer.viewport.viewportToImageCoordinates).mockReturnValue({
        x: 0.5,
        y: 0.5,
      } as never)
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      const pos = mapper.viewportToCell()
      expect(pos.row).toBe(1)
      expect(pos.col).toBe(1)
    })

    it('maps top-left corner to cell (0, 0)', () => {
      vi.mocked(viewer.viewport.viewportToImageCoordinates).mockReturnValue({
        x: 0.1,
        y: 0.1,
      } as never)
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      const pos = mapper.viewportToCell()
      expect(pos.row).toBe(0)
      expect(pos.col).toBe(0)
    })

    it('clamps out-of-bounds coordinates to the last cell', () => {
      vi.mocked(viewer.viewport.viewportToImageCoordinates).mockReturnValue({
        x: 1.5,
        y: 1.5,
      } as never)
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      const pos = mapper.viewportToCell()
      expect(pos.row).toBe(2)
      expect(pos.col).toBe(2)
    })

    it('clamps negative coordinates to cell (0, 0)', () => {
      vi.mocked(viewer.viewport.viewportToImageCoordinates).mockReturnValue({
        x: -0.5,
        y: -0.5,
      } as never)
      const mapper = new CoordinateMapper(viewer, { rows: 3, columns: 3 })
      const pos = mapper.viewportToCell()
      expect(pos.row).toBe(0)
      expect(pos.col).toBe(0)
    })
  })
})
