import type { GridConfig, OSDViewer, SenseArtOptions } from './types/index.js'
import { A11yOverlay } from './core/A11yOverlay.js'
import { AriaLiveEngine } from './core/AriaLiveEngine.js'
import { CoordinateMapper } from './core/CoordinateMapper.js'
import { FocusTrap } from './core/FocusTrap.js'

const DEFAULT_GRID: GridConfig = { rows: 3, columns: 3 }

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
 * const senseArt = new SenseArtViewer(viewer, { grid: { rows: 3, columns: 3 } })
 * senseArt.mount()
 * ```
 */
export class SenseArtViewer {
  private readonly viewer: OSDViewer
  private readonly grid: GridConfig
  private overlay: A11yOverlay | null = null
  private mapper: CoordinateMapper | null = null
  private focusTrap: FocusTrap | null = null
  private liveEngine: AriaLiveEngine | null = null
  private mounted = false
  private enabled = false
  private boundShortcutHandler: (e: KeyboardEvent) => void

  constructor(viewer: OSDViewer, options: SenseArtOptions = {}) {
    this.viewer = viewer
    this.grid = options.grid ?? DEFAULT_GRID
    this.boundShortcutHandler = this.handleGlobalShortcut.bind(this)
  }

  /**
   * Injects the accessibility layer into the OSD container.
   *
   * @accessibility
   * - Creates the ARIA grid overlay (`role="grid"`) over the OSD canvas.
   * - Registers the activation shortcut listener (`Alt+A` by default).
   * - Does NOT automatically enable the layer — call `enable()` or use `Alt+A`.
   * - Safe to call multiple times (idempotent).
   */
  mount(): void {
    if (this.mounted) return

    const container = this.viewer.element as HTMLElement
    if (!container) throw new Error('SenseArt: OSD viewer has no container element')

    this.mapper = new CoordinateMapper(this.viewer, this.grid)
    this.liveEngine = new AriaLiveEngine(document.body)
    this.overlay = new A11yOverlay(container, this.grid)

    this.overlay.render((row, col) => {
      const regionLabel = this.mapper!.currentRegionLabel(row, col)
      const zoomLabel = this.mapper!.currentZoomLabel()
      return `Regione ${regionLabel}. Zoom ${zoomLabel}`
    })

    const cells = this.overlay.getAllCells()
    this.focusTrap = new FocusTrap(container, cells, this.grid)
    this.focusTrap.onCellFocus((row, col) => this.onCellFocused(row, col))

    document.addEventListener('keydown', this.boundShortcutHandler)
    this.mounted = true
  }

  /**
   * Activates the accessibility layer — enables keyboard interception and focus trap.
   *
   * @accessibility
   * Announces "Layer accessibilità attivato. Usa le frecce per navigare l'opera."
   * via the `aria-live` region (polite urgency).
   */
  enable(): void {
    if (!this.mounted) this.mount()
    if (this.enabled) return
    this.focusTrap!.activate()
    this.liveEngine!.announce(
      'Layer accessibilità attivato. Usa le frecce per navigare l\'opera.',
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
    document.removeEventListener('keydown', this.boundShortcutHandler)
    this.overlay = null
    this.mapper = null
    this.focusTrap = null
    this.liveEngine = null
    this.mounted = false
  }

  /** Toggle enable/disable state — called by the global shortcut handler. */
  toggle(): void {
    this.enabled ? this.disable() : this.enable()
  }

  private onCellFocused(row: number, col: number): void {
    if (!this.mapper || !this.liveEngine || !this.overlay) return

    // Sentinel from FocusTrap Escape: reset zoom
    if (row === -1 && col === -1) {
      this.viewer.viewport.goHome(false)
      this.liveEngine.announce('Zoom reimpostato. Vista completa dell\'opera.')
      return
    }

    this.mapper.focusToBounds(row, col)
    this.overlay.setCurrentCell(row, col)
    this.overlay.setRovingFocus(row, col)

    const label = this.mapper.currentRegionLabel(row, col)
    const zoom = this.mapper.currentZoomLabel()
    this.overlay.updateCellLabel(row, col, `Regione ${label}. Zoom ${zoom}`)
    this.liveEngine.announceCell(row, col, label)
  }

  private handleGlobalShortcut(e: KeyboardEvent): void {
    // Match "Alt+A" (case-insensitive)
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      this.toggle()
    }
  }
}
