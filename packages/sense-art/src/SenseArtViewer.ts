import type { GridConfig, OSDViewer, SenseArtOptions } from './types/index.js'
import { A11yOverlay } from './core/A11yOverlay.js'
import { AriaLiveEngine } from './core/AriaLiveEngine.js'
import { CoordinateMapper } from './core/CoordinateMapper.js'
import { FocusTrap } from './core/FocusTrap.js'
import { Sonifier } from './audio/Sonifier.js'
import { PixelSampler } from './audio/PixelSampler.js'

const DEFAULT_GRID: GridConfig = { rows: 3, columns: 3 }

interface ParsedShortcut {
  key: string
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.split('+')
  const key = (parts[parts.length - 1] ?? 'a').toLowerCase()
  return {
    key,
    altKey: parts.some((p) => p === 'Alt'),
    ctrlKey: parts.some((p) => p === 'Ctrl' || p === 'Control'),
    shiftKey: parts.some((p) => p === 'Shift'),
    metaKey: parts.some((p) => p === 'Meta' || p === 'Cmd'),
  }
}

/**
 * Main entry point for SenseArt.
 *
 * Orchestrates the accessibility layer: overlay rendering, coordinate mapping,
 * focus trap, and ARIA live announcements. Designed as a non-invasive wrapper
 * that never modifies the underlying OpenSeadragon viewer.
 *
 * @example
 * ```typescript
 * const viewer = OpenSeadragon({ id: 'osd', tileSources: '...' })
 * const senseArt = new SenseArtViewer(viewer, {
 *   grid: { rows: 3, columns: 3 },
 *   activationShortcut: 'Alt+A',
 * })
 * senseArt.mount()
 * ```
 */
export class SenseArtViewer {
  private readonly viewer: OSDViewer
  private grid: GridConfig
  private readonly parsedShortcut: ParsedShortcut
  private readonly sonifierOptions: SenseArtOptions['sonification']
  private overlay: A11yOverlay | null = null
  private mapper: CoordinateMapper | null = null
  private focusTrap: FocusTrap | null = null
  private liveEngine: AriaLiveEngine | null = null
  private sonifier: Sonifier | null = null
  private pixelSampler: PixelSampler | null = null
  private resizeObserver: ResizeObserver | null = null
  private mounted = false
  private enabled = false
  private boundShortcutHandler: (e: KeyboardEvent) => void

  constructor(viewer: OSDViewer, options: SenseArtOptions = {}) {
    this.viewer = viewer
    this.grid = { ...(options.grid ?? DEFAULT_GRID) }
    this.sonifierOptions = options.sonification
    this.parsedShortcut = parseShortcut(options.activationShortcut ?? 'Alt+A')
    this.boundShortcutHandler = this.handleGlobalShortcut.bind(this)
  }

  /**
   * Injects the accessibility layer into the OSD container.
   *
   * @accessibility
   * - Creates the ARIA grid overlay (`role="grid"`) over the OSD canvas.
   * - Registers the activation shortcut listener (default: `Alt+A`).
   * - Starts a `ResizeObserver` on the OSD container to keep cell labels
   *   (zoom level) in sync when the viewport resizes.
   * - Does NOT automatically enable the layer — call `enable()` or use the shortcut.
   * - Safe to call multiple times (idempotent).
   */
  mount(): void {
    if (this.mounted) return

    const container = this.viewer.element as HTMLElement
    if (!container) throw new Error('SenseArt: OSD viewer has no container element')

    this.mapper = new CoordinateMapper(this.viewer, this.grid)
    this.liveEngine = new AriaLiveEngine(document.body)
    this.overlay = new A11yOverlay(container, this.grid)

    this.overlay.render((row, col) => this.cellLabel(row, col))

    const cells = this.overlay.getAllCells()
    this.focusTrap = new FocusTrap(container, cells, this.grid)
    this.focusTrap.onCellFocus((row, col) => this.onCellFocused(row, col))

    if (this.sonifierOptions?.enabled) {
      this.sonifier = new Sonifier(this.sonifierOptions)
    }

    this.resizeObserver = new ResizeObserver(() => this.refreshCellLabels())
    this.resizeObserver.observe(container)

    document.addEventListener('keydown', this.boundShortcutHandler)
    this.mounted = true
  }

  /**
   * Activates the accessibility layer — enables keyboard interception and focus trap.
   *
   * @accessibility
   * - Announces "Layer accessibilità attivato. Usa le frecce per navigare l'opera."
   *   via the `aria-live` region (polite urgency).
   * - If sonification is enabled, starts the Web Audio context. This method must be
   *   called from a user gesture handler (e.g., keyboard event) to satisfy the
   *   Web Audio autoplay policy.
   */
  enable(): void {
    if (!this.mounted) this.mount()
    if (this.enabled) return
    // start() must be called within a user gesture handler (Web Audio requirement).
    // enable() is called from the keyboard shortcut handler, satisfying this constraint.
    void this.sonifier?.start()
    this.focusTrap!.activate()
    this.liveEngine!.announce(
      "Layer accessibilità attivato. Usa le frecce per navigare l'opera.",
    )
    this.enabled = true
  }

  /**
   * Deactivates the accessibility layer without removing it from the DOM.
   *
   * @accessibility
   * Announces "Layer accessibilità disattivato." and releases the keyboard focus trap.
   * OSD mouse/touch interactions are fully restored.
   */
  disable(): void {
    if (!this.enabled) return
    this.focusTrap!.deactivate()
    this.liveEngine!.announce('Layer accessibilità disattivato.')
    this.enabled = false
  }

  /**
   * Removes the accessibility layer from the DOM and cleans up all event listeners.
   *
   * @accessibility
   * After unmount, no ARIA elements remain in the page. Safe to call before
   * destroying the OSD viewer instance.
   */
  unmount(): void {
    if (!this.mounted) return
    this.disable()
    this.overlay?.destroy()
    this.liveEngine?.destroy()
    this.resizeObserver?.disconnect()
    document.removeEventListener('keydown', this.boundShortcutHandler)
    this.overlay = null
    this.mapper = null
    this.focusTrap = null
    this.liveEngine = null
    this.sonifier = null
    this.pixelSampler = null
    this.resizeObserver = null
    this.mounted = false
  }

  /** Toggle enable/disable state — called by the global shortcut handler. */
  toggle(): void {
    this.enabled ? this.disable() : this.enable()
  }

  /**
   * Rebuilds the grid with a new configuration without remounting.
   *
   * @param config - New grid dimensions (rows × columns)
   *
   * @accessibility
   * - Destroys and recreates the ARIA grid overlay with the new dimensions.
   * - All `aria-rowcount` / `aria-colcount` attributes are updated.
   * - Focus returns to cell (0, 0) after the rebuild.
   * - Preserves the enabled/disabled state of the focus trap.
   *
   * @example
   * senseArt.setGrid({ rows: 5, columns: 5 }) // switch to 5×5 grid at runtime
   */
  setGrid(config: GridConfig): void {
    this.grid = { ...config }
    if (!this.mounted) return

    const wasEnabled = this.enabled
    this.focusTrap?.deactivate()
    this.overlay?.destroy()
    this.enabled = false

    const container = this.viewer.element as HTMLElement
    this.mapper = new CoordinateMapper(this.viewer, this.grid)
    this.overlay = new A11yOverlay(container, this.grid)
    this.overlay.render((row, col) => this.cellLabel(row, col))

    const cells = this.overlay.getAllCells()
    this.focusTrap = new FocusTrap(container, cells, this.grid)
    this.focusTrap.onCellFocus((row, col) => this.onCellFocused(row, col))
    this.pixelSampler = null // will re-init lazily on next cell focus

    if (wasEnabled) {
      this.focusTrap.activate()
      this.enabled = true
    }
  }

  private cellLabel(row: number, col: number): string {
    const regionLabel = this.mapper!.currentRegionLabel(row, col)
    const zoomLabel = this.mapper!.currentZoomLabel()
    return `Regione ${regionLabel}. Zoom ${zoomLabel}`
  }

  private refreshCellLabels(): void {
    if (!this.mapper || !this.overlay) return
    for (let r = 0; r < this.grid.rows; r++) {
      for (let c = 0; c < this.grid.columns; c++) {
        this.overlay.updateCellLabel(r, c, this.cellLabel(r, c))
      }
    }
  }

  private onCellFocused(row: number, col: number): void {
    if (!this.mapper || !this.liveEngine || !this.overlay) return

    // Sentinel from FocusTrap Escape: reset zoom
    if (row === -1 && col === -1) {
      this.viewer.viewport.goHome(false)
      this.liveEngine.announce("Zoom reimpostato. Vista completa dell'opera.")
      return
    }

    this.mapper.focusToBounds(row, col)
    this.overlay.setCurrentCell(row, col)
    this.overlay.setRovingFocus(row, col)

    const label = this.mapper.currentRegionLabel(row, col)
    const zoom = this.mapper.currentZoomLabel()
    this.overlay.updateCellLabel(row, col, `Regione ${label}. Zoom ${zoom}`)
    this.liveEngine.announceCell(row, col, label)

    void this.sonifyCell(row, col)
  }

  private async sonifyCell(row: number, col: number): Promise<void> {
    if (!this.sonifier) return
    if (!this.pixelSampler) {
      const canvas = (this.viewer.element as HTMLElement).querySelector<HTMLCanvasElement>('canvas')
      if (!canvas) return
      this.pixelSampler = new PixelSampler(canvas)
    }
    const bounds = this.mapper!.cellToBounds(row, col)
    const pixel = this.pixelSampler.sample(bounds.x, bounds.y, bounds.width, bounds.height)
    await this.sonifier.mapToAudio(pixel)
  }

  private handleGlobalShortcut(e: KeyboardEvent): void {
    const s = this.parsedShortcut
    if (
      e.key.toLowerCase() === s.key &&
      e.altKey === s.altKey &&
      e.ctrlKey === s.ctrlKey &&
      e.shiftKey === s.shiftKey &&
      e.metaKey === s.metaKey
    ) {
      e.preventDefault()
      this.toggle()
    }
  }
}
