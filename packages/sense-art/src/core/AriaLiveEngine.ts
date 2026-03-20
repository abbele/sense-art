/**
 * Manages a singleton `aria-live` region injected into `<body>`.
 *
 * All screen reader announcements in SenseArt are routed through this class
 * to guarantee a single, predictable announcement channel.
 */
export class AriaLiveEngine {
  private region: HTMLDivElement
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly DEBOUNCE_MS = 150

  constructor(container: HTMLElement) {
    this.region = document.createElement('div')
    this.region.setAttribute('aria-live', 'polite')
    this.region.setAttribute('aria-atomic', 'true')
    this.region.setAttribute('aria-relevant', 'text')
    this.region.className = 'sa-live-region'
    // Visually hidden — accessible but invisible
    Object.assign(this.region.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0,0,0,0)',
      whiteSpace: 'nowrap',
      border: '0',
    })
    container.appendChild(this.region)
  }

  /**
   * Announces a message to the screen reader.
   *
   * @param message - Text to announce
   * @param urgency - `"polite"` waits for the user to be idle; `"assertive"` interrupts
   *
   * @accessibility
   * - Updates `aria-live` region content after a 150ms debounce.
   * - Urgency `"assertive"` should be reserved for errors only.
   * - The region is `aria-atomic="true"`: the full message is read, not just the changed portion.
   */
  announce(message: string, urgency: 'polite' | 'assertive' = 'polite'): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
    }
    this.region.setAttribute('aria-live', urgency)
    this.debounceTimer = setTimeout(() => {
      this.region.textContent = message
      this.debounceTimer = null
    }, AriaLiveEngine.DEBOUNCE_MS)
  }

  /**
   * Announces a zoom level change combined with the current region.
   *
   * @param zoomLevel - Current OSD zoom factor (e.g. 2.0)
   * @param regionLabel - Human-readable region name (e.g. "Alto-Sinistra")
   *
   * @accessibility
   * Announces: "Ingrandimento {zoom}x. Area: {regionLabel}"
   */
  announceZoom(zoomLevel: number, regionLabel: string): void {
    const rounded = Math.round(zoomLevel * 10) / 10
    this.announce(`Ingrandimento ${rounded}x. Area: ${regionLabel}`)
  }

  /**
   * Announces the newly focused grid cell.
   *
   * @param row - Zero-based row index
   * @param col - Zero-based column index
   * @param label - The cell's `aria-label` value
   *
   * @accessibility
   * Announces: "Riga {row+1}, Colonna {col+1} — {label}"
   */
  announceCell(row: number, col: number, label: string): void {
    this.announce(`Riga ${row + 1}, Colonna ${col + 1} — ${label}`)
  }

  /** Remove the live region from the DOM. */
  destroy(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
    }
    this.region.remove()
  }
}
