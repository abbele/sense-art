import { describe, it, expect, vi } from 'vitest'
import { PixelSampler } from './PixelSampler.js'

/**
 * Build a mock canvas whose 2D context returns a single-pixel ImageData
 * with the given RGBA values.
 */
function makeCanvas(
  pixels: { r: number; g: number; b: number; a: number }[],
): HTMLCanvasElement {
  const data = new Uint8ClampedArray(pixels.flatMap((p) => [p.r, p.g, p.b, p.a]))
  const ctx = {
    getImageData: vi.fn().mockReturnValue({ data, width: pixels.length, height: 1 }),
  }
  return {
    width: 100,
    height: 100,
    getContext: vi.fn().mockReturnValue(ctx),
  } as unknown as HTMLCanvasElement
}

describe('PixelSampler', () => {
  // ─── Luminosity ─────────────────────────────────────────────────────────────

  describe('luminosity', () => {
    it('pure white pixel has luminosity ≈ 255', () => {
      const canvas = makeCanvas([{ r: 255, g: 255, b: 255, a: 255 }])
      const pixel = new PixelSampler(canvas).sample(0, 0, 1, 1)
      expect(pixel.luminosity).toBeCloseTo(255)
    })

    it('pure black pixel has luminosity 0', () => {
      const canvas = makeCanvas([{ r: 0, g: 0, b: 0, a: 255 }])
      const pixel = new PixelSampler(canvas).sample(0, 0, 1, 1)
      expect(pixel.luminosity).toBeCloseTo(0)
    })

    it('pure red pixel has luminosity ≈ 0.2126 × 255 (ITU-R BT.709)', () => {
      const canvas = makeCanvas([{ r: 255, g: 0, b: 0, a: 255 }])
      const pixel = new PixelSampler(canvas).sample(0, 0, 1, 1)
      expect(pixel.luminosity).toBeCloseTo(0.2126 * 255, 1)
    })

    it('pure green pixel has luminosity ≈ 0.7152 × 255', () => {
      const canvas = makeCanvas([{ r: 0, g: 255, b: 0, a: 255 }])
      const pixel = new PixelSampler(canvas).sample(0, 0, 1, 1)
      expect(pixel.luminosity).toBeCloseTo(0.7152 * 255, 1)
    })

    it('pure blue pixel has luminosity ≈ 0.0722 × 255', () => {
      const canvas = makeCanvas([{ r: 0, g: 0, b: 255, a: 255 }])
      const pixel = new PixelSampler(canvas).sample(0, 0, 1, 1)
      expect(pixel.luminosity).toBeCloseTo(0.0722 * 255, 1)
    })

    it('averages luminosity over multiple pixels', () => {
      const canvas = makeCanvas([
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
      ])
      const pixel = new PixelSampler(canvas).sample(0, 0, 1, 1)
      expect(pixel.luminosity).toBeCloseTo(127.5, 0)
    })
  })

  // ─── Saturation ─────────────────────────────────────────────────────────────

  describe('saturation', () => {
    it('pure white pixel has saturation 0 (no color)', () => {
      const canvas = makeCanvas([{ r: 255, g: 255, b: 255, a: 255 }])
      const pixel = new PixelSampler(canvas).sample(0, 0, 1, 1)
      expect(pixel.saturation).toBeCloseTo(0)
    })

    it('pure black pixel has saturation 0', () => {
      const canvas = makeCanvas([{ r: 0, g: 0, b: 0, a: 255 }])
      const pixel = new PixelSampler(canvas).sample(0, 0, 1, 1)
      expect(pixel.saturation).toBeCloseTo(0)
    })

    it('pure red pixel has saturation 100%', () => {
      const canvas = makeCanvas([{ r: 255, g: 0, b: 0, a: 255 }])
      const pixel = new PixelSampler(canvas).sample(0, 0, 1, 1)
      expect(pixel.saturation).toBeCloseTo(100)
    })

    it('pure green pixel has saturation 100%', () => {
      const canvas = makeCanvas([{ r: 0, g: 255, b: 0, a: 255 }])
      const pixel = new PixelSampler(canvas).sample(0, 0, 1, 1)
      expect(pixel.saturation).toBeCloseTo(100)
    })

    it('mid-grey pixel has saturation 0', () => {
      const canvas = makeCanvas([{ r: 128, g: 128, b: 128, a: 255 }])
      const pixel = new PixelSampler(canvas).sample(0, 0, 1, 1)
      expect(pixel.saturation).toBeCloseTo(0, 0)
    })
  })

  // ─── RGBA passthrough ────────────────────────────────────────────────────────

  describe('raw RGBA', () => {
    it('returns correct averaged r, g, b, a values', () => {
      const canvas = makeCanvas([{ r: 100, g: 150, b: 200, a: 255 }])
      const pixel = new PixelSampler(canvas).sample(0, 0, 1, 1)
      expect(pixel.r).toBeCloseTo(100)
      expect(pixel.g).toBeCloseTo(150)
      expect(pixel.b).toBeCloseTo(200)
      expect(pixel.a).toBeCloseTo(255)
    })
  })

  // ─── Null context fallback ───────────────────────────────────────────────────

  describe('fallback when canvas context is unavailable', () => {
    it('returns empty pixel (all zeros) if getContext returns null', () => {
      const canvas = {
        width: 100,
        height: 100,
        getContext: vi.fn().mockReturnValue(null),
      } as unknown as HTMLCanvasElement
      const pixel = new PixelSampler(canvas).sample(0, 0, 1, 1)
      expect(pixel.r).toBe(0)
      expect(pixel.g).toBe(0)
      expect(pixel.b).toBe(0)
      expect(pixel.luminosity).toBe(0)
      expect(pixel.saturation).toBe(0)
    })
  })
})
