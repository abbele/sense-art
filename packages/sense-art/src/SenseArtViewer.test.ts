import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { OSDViewer } from './types/index.js'
import { SenseArtViewer } from './SenseArtViewer.js'

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

function makeViewer(container: HTMLElement): OSDViewer {
  return {
    element: container,
    addHandler: vi.fn(),
    viewport: {
      imageToViewportRectangle: vi.fn((r) => r),
      fitBounds: vi.fn(),
      getZoom: vi.fn(() => 1),
      getCenter: vi.fn(() => ({ x: 0.5, y: 0.5 })),
      viewportToImageCoordinates: vi.fn((p) => p),
      goHome: vi.fn(),
      getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1, height: 1 })),
    },
  } as unknown as OSDViewer
}

describe('SenseArtViewer', () => {
  let container: HTMLDivElement
  let viewer: OSDViewer
  let senseArt: SenseArtViewer

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    viewer = makeViewer(container)
    senseArt = new SenseArtViewer(viewer)
  })

  afterEach(() => {
    senseArt.unmount()
    container.remove()
  })

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  describe('mount / unmount', () => {
    it('mount() injects role="grid" into the container', () => {
      senseArt.mount()
      expect(container.querySelector('[role="grid"]')).not.toBeNull()
    })

    it('mount() creates the correct number of gridcells for 3×3', () => {
      senseArt.mount()
      expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(9)
    })

    it('mount() is idempotent — calling twice does not duplicate the grid', () => {
      senseArt.mount()
      senseArt.mount()
      expect(container.querySelectorAll('[role="grid"]')).toHaveLength(1)
    })

    it('unmount() removes the overlay from the DOM', () => {
      senseArt.mount()
      senseArt.unmount()
      expect(container.querySelector('[role="grid"]')).toBeNull()
    })

    it('unmount() removes the aria-live region from body', () => {
      senseArt.mount()
      senseArt.unmount()
      expect(document.body.querySelector('[aria-live]')).toBeNull()
    })

    it('unmount() before mount() is a no-op', () => {
      expect(() => senseArt.unmount()).not.toThrow()
    })
  })

  // ─── Enable / disable ───────────────────────────────────────────────────────

  describe('enable / disable / toggle', () => {
    it('enable() calls mount() automatically if not yet mounted', () => {
      senseArt.enable()
      expect(container.querySelector('[role="grid"]')).not.toBeNull()
    })

    it('enable() then Enter zooms into the focused cell (end-to-end)', () => {
      senseArt.mount()
      senseArt.enable()
      container
        .querySelector<HTMLElement>('[role="gridcell"]')!
        .focus()
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
      expect(viewer.viewport.fitBounds).toHaveBeenCalled()
    })

    it('disable() stops intercepting arrow keys', () => {
      senseArt.mount()
      senseArt.enable()
      senseArt.disable()
      container
        .querySelector<HTMLElement>('[role="gridcell"]')!
        .focus()
      const fitBounds = vi.mocked(viewer.viewport.fitBounds)
      fitBounds.mockClear()
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
      expect(fitBounds).not.toHaveBeenCalled()
    })

    it('toggle() enables when disabled', () => {
      senseArt.mount()
      senseArt.toggle() // → enable
      container
        .querySelector<HTMLElement>('[role="gridcell"]')!
        .focus()
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
      expect(viewer.viewport.fitBounds).toHaveBeenCalled()
    })

    it('toggle() disables when enabled', () => {
      senseArt.mount()
      senseArt.enable()
      senseArt.toggle() // → disable
      const fitBounds = vi.mocked(viewer.viewport.fitBounds)
      fitBounds.mockClear()
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
      expect(fitBounds).not.toHaveBeenCalled()
    })

    it('enable() is idempotent', () => {
      senseArt.mount()
      senseArt.enable()
      senseArt.enable()
      // Should not throw and FocusTrap should not be activated twice
      expect(() => senseArt.disable()).not.toThrow()
    })

    it('disable() is idempotent when already disabled', () => {
      senseArt.mount()
      expect(() => senseArt.disable()).not.toThrow()
    })
  })

  // ─── Keyboard shortcut ──────────────────────────────────────────────────────

  describe('activation shortcut', () => {
    it('default Alt+A on document toggles the layer', () => {
      senseArt.mount()
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true }),
      )
      // Should now be enabled → Enter zooms into focused cell
      container
        .querySelector<HTMLElement>('[role="gridcell"]')!
        .focus()
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
      expect(viewer.viewport.fitBounds).toHaveBeenCalled()
    })

    it('custom activation shortcut (Ctrl+Shift+S) is respected', () => {
      const custom = new SenseArtViewer(viewer, {
        activationShortcut: 'Ctrl+Shift+S',
      })
      custom.mount()

      // Alt+A should NOT toggle
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true }),
      )
      const fitBounds = vi.mocked(viewer.viewport.fitBounds)
      fitBounds.mockClear()
      container
        .querySelector<HTMLElement>('[role="gridcell"]')!
        .focus()
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
      expect(fitBounds).not.toHaveBeenCalled()

      // Ctrl+Shift+S SHOULD toggle
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 's',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      )
      fitBounds.mockClear()
      container
        .querySelector<HTMLElement>('[role="gridcell"]')!
        .focus()
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
      expect(fitBounds).toHaveBeenCalled()

      custom.unmount()
    })

    it('unmount() removes the shortcut listener', () => {
      senseArt.mount()
      senseArt.unmount()
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true }),
      )
      // No grid in DOM → no error, no navigation
      expect(container.querySelector('[role="grid"]')).toBeNull()
    })
  })

  // ─── Escape sentinel ────────────────────────────────────────────────────────

  describe('Escape key', () => {
    it('Escape calls goHome and keeps layer active', () => {
      senseArt.mount()
      senseArt.enable()
      container
        .querySelector<HTMLElement>('[role="gridcell"]')!
        .focus()
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
      expect(viewer.viewport.goHome).toHaveBeenCalledWith(false)
    })
  })

  // ─── setGrid ────────────────────────────────────────────────────────────────

  describe('setGrid()', () => {
    it('rebuilds the grid with the new dimensions', () => {
      senseArt.mount()
      senseArt.setGrid({ rows: 5, columns: 5 })
      expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(25)
    })

    it('setGrid() before mount() does not throw', () => {
      expect(() => senseArt.setGrid({ rows: 2, columns: 2 })).not.toThrow()
    })

    it('setGrid() after mount() uses new dimensions on mount', () => {
      senseArt.setGrid({ rows: 2, columns: 2 })
      senseArt.mount()
      expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(4)
    })

    it('preserves enabled state after setGrid()', () => {
      senseArt.mount()
      senseArt.enable()
      senseArt.setGrid({ rows: 4, columns: 4 })
      // Layer should still be enabled → Enter zooms into focused cell
      container
        .querySelector<HTMLElement>('[role="gridcell"]')!
        .focus()
      vi.mocked(viewer.viewport.fitBounds).mockClear()
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
      expect(viewer.viewport.fitBounds).toHaveBeenCalled()
    })
  })

  // ─── aria-current sync ──────────────────────────────────────────────────────

  describe('aria-current', () => {
    it('focused cell gets aria-current="true"', () => {
      senseArt.mount()
      senseArt.enable()
      container
        .querySelector<HTMLElement>('[role="gridcell"]')!
        .focus()
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
      const cells = container.querySelectorAll('[aria-current="true"]')
      expect(cells).toHaveLength(1)
    })
  })
})
