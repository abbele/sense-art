import OpenSeadragon from 'openseadragon'
import type { CellPosition, GridConfig, OSDViewer } from '../types/index.js'

const REGION_LABELS: string[][] = [
  ['Alto-Sinistra', 'Alto-Centro', 'Alto-Destra'],
  ['Centro-Sinistra', 'Centro', 'Centro-Destra'],
  ['Basso-Sinistra', 'Basso-Centro', 'Basso-Destra'],
]

/**
 * Translates between grid cell positions and OpenSeadragon viewport bounds.
 *
 * The grid subdivides the viewport that was visible at the time of snapshotViewport().
 * This class is the single source of truth for spatial mapping.
 */
export class CoordinateMapper {
  private readonly viewer: OSDViewer
  private readonly grid: GridConfig
  private snapshotBounds: OpenSeadragon.Rect | null = null

  constructor(viewer: OSDViewer, grid: GridConfig) {
    this.viewer = viewer
    this.grid = grid
  }

  /**
   * Captures the current viewport bounds as the reference for cell navigation.
   * Call this when the accessibility layer is enabled so cells map to what
   * the user is currently looking at, not the full image.
   */
  snapshotViewport(): void {
    this.snapshotBounds = this.viewer.viewport.getBounds(true)
  }

  /**
   * Converts a grid cell position to an OSD `Rect` in image coordinates.
   *
   * @param row - Zero-based row index
   * @param col - Zero-based column index
   * @returns OSD Rect representing the cell's bounds in image space
   *
   * @accessibility
   * The returned bounds are passed to `viewer.viewport.fitBounds()` on cell focus,
   * which pans and zooms the viewer so the cell fills the visible area.
   */
  cellToBounds(row: number, col: number): OpenSeadragon.Rect {
    const cellWidth = 1 / this.grid.columns
    const cellHeight = 1 / this.grid.rows
    const x = col * cellWidth
    const y = row * cellHeight
    // OSD Rect: (x, y, width, height) in image coordinates
    return new OpenSeadragon.Rect(x, y, cellWidth, cellHeight)
  }

  /**
   * Pans and zooms the OSD viewer to frame the given cell.
   *
   * @param row - Zero-based row index
   * @param col - Zero-based column index
   *
   * @accessibility
   * Triggers OSD `viewport-change` event which downstream listeners
   * (AriaLiveEngine) use to announce the new zoom level and region.
   */
  focusToBounds(row: number, col: number): void {
    // Use the viewport snapshot taken at enable() time so cells subdivide
    // whatever the user was looking at, not the full image.
    const base = this.snapshotBounds ?? this.viewer.viewport.getBounds(true)
    const cellW = base.width / this.grid.columns
    const cellH = base.height / this.grid.rows
    const cellBounds = new OpenSeadragon.Rect(
      base.x + col * cellW,
      base.y + row * cellH,
      cellW,
      cellH,
    )
    this.viewer.viewport.fitBounds(cellBounds, false)
  }

  /**
   * Returns a human-readable Italian label for a cell's spatial region.
   *
   * @param row - Zero-based row index
   * @param col - Zero-based column index
   *
   * @accessibility
   * Used to populate `aria-label` on gridcell buttons and in live announcements.
   * For grids larger than 3×3, falls back to a numeric label ("Riga 2, Colonna 4").
   */
  currentRegionLabel(row: number, col: number): string {
    if (this.grid.rows <= 3 && this.grid.columns <= 3) {
      return REGION_LABELS[row]?.[col] ?? `Riga ${row + 1}, Colonna ${col + 1}`
    }
    return `Riga ${row + 1}, Colonna ${col + 1}`
  }

  /**
   * Returns the zoom level as a formatted string (e.g., "2x").
   *
   * @accessibility
   * Included in aria-live announcements and aria-label of cells.
   */
  currentZoomLabel(): string {
    const zoom = this.viewer.viewport.getZoom(true)
    const rounded = Math.round(zoom * 10) / 10
    return `${rounded}x`
  }

  /**
   * Finds which cell best corresponds to the current viewport center.
   *
   * @returns CellPosition of the cell closest to the viewport center
   *
   * @accessibility
   * Used to set `aria-current="true"` on the cell that matches what
   * the user is currently looking at (even if they navigated via mouse/touch).
   */
  viewportToCell(): CellPosition {
    const center = this.viewer.viewport.getCenter(true)
    const imageCenter = this.viewer.viewport.viewportToImageCoordinates(center)
    const col = Math.min(
      Math.floor(imageCenter.x * this.grid.columns),
      this.grid.columns - 1,
    )
    const row = Math.min(
      Math.floor(imageCenter.y * this.grid.rows),
      this.grid.rows - 1,
    )
    return { row: Math.max(0, row), col: Math.max(0, col) }
  }
}
