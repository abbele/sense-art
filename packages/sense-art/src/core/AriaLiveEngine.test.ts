import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AriaLiveEngine } from './AriaLiveEngine.js'

describe('AriaLiveEngine', () => {
  let container: HTMLDivElement
  let engine: AriaLiveEngine

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    engine = new AriaLiveEngine(container)
  })

  afterEach(() => {
    engine.destroy()
    container.remove()
    vi.useRealTimers()
  })

  // ─── DOM structure ─────────────────────────────────────────────────────────

  it('injects one aria-live region into the container', () => {
    const region = container.querySelector('[aria-live]')
    expect(region).not.toBeNull()
  })

  it('region has aria-live="polite" by default', () => {
    const region = container.querySelector('[aria-live]')
    expect(region?.getAttribute('aria-live')).toBe('polite')
  })

  it('region has aria-atomic="true"', () => {
    const region = container.querySelector('[aria-live]')
    expect(region?.getAttribute('aria-atomic')).toBe('true')
  })

  it('region is visually hidden (position:absolute, width:1px)', () => {
    const region = container.querySelector<HTMLElement>('[aria-live]')
    expect(region?.style.position).toBe('absolute')
    expect(region?.style.width).toBe('1px')
  })

  // ─── Announce (debounce) ───────────────────────────────────────────────────

  it('does not update content immediately (debounced)', () => {
    engine.announce('Hello')
    const region = container.querySelector('[aria-live]')
    expect(region?.textContent).toBe('')
  })

  it('updates content after 150ms debounce', () => {
    engine.announce('Hello')
    vi.advanceTimersByTime(150)
    const region = container.querySelector('[aria-live]')
    expect(region?.textContent).toBe('Hello')
  })

  it('debounce collapses rapid calls — only last message is set', () => {
    engine.announce('First')
    engine.announce('Second')
    engine.announce('Third')
    vi.advanceTimersByTime(150)
    const region = container.querySelector('[aria-live]')
    expect(region?.textContent).toBe('Third')
  })

  it('sets aria-live="assertive" when urgency is assertive', () => {
    engine.announce('Error!', 'assertive')
    vi.advanceTimersByTime(150)
    const region = container.querySelector('[aria-live]')
    expect(region?.getAttribute('aria-live')).toBe('assertive')
  })

  // ─── announceZoom ──────────────────────────────────────────────────────────

  it('announceZoom formats the zoom message correctly', () => {
    engine.announceZoom(2, 'Alto-Sinistra')
    vi.advanceTimersByTime(150)
    const region = container.querySelector('[aria-live]')
    expect(region?.textContent).toBe('Ingrandimento 2x. Area: Alto-Sinistra')
  })

  it('announceZoom rounds to one decimal', () => {
    engine.announceZoom(1.567, 'Centro')
    vi.advanceTimersByTime(150)
    const region = container.querySelector('[aria-live]')
    expect(region?.textContent).toBe('Ingrandimento 1.6x. Area: Centro')
  })

  // ─── announceCell ─────────────────────────────────────────────────────────

  it('announceCell formats the cell message with 1-based indices', () => {
    engine.announceCell(0, 0, 'Alto-Sinistra')
    vi.advanceTimersByTime(150)
    const region = container.querySelector('[aria-live]')
    expect(region?.textContent).toBe('Riga 1, Colonna 1 — Alto-Sinistra')
  })

  it('announceCell uses 1-based row and col', () => {
    engine.announceCell(2, 1, 'Basso-Centro')
    vi.advanceTimersByTime(150)
    const region = container.querySelector('[aria-live]')
    expect(region?.textContent).toBe('Riga 3, Colonna 2 — Basso-Centro')
  })

  // ─── Destroy ───────────────────────────────────────────────────────────────

  it('destroy removes the live region from the DOM', () => {
    engine.destroy()
    expect(container.querySelector('[aria-live]')).toBeNull()
  })

  it('destroy cancels a pending debounced announcement', () => {
    engine.announce('Should not appear')
    engine.destroy()
    vi.advanceTimersByTime(150)
    // Region was removed — no text was set
    expect(container.querySelector('[aria-live]')).toBeNull()
  })
})
