import type { PixelData } from '../types/index.js'

/**
 * Extracts pixel color data from the OSD canvas at a given normalized region.
 *
 * Sampling is done by averaging pixels in the cell's bounding box on the canvas.
 * This is a Phase 2 component — returns a stub in Phase 1.
 */
export class PixelSampler {
  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  /**
   * Samples the average color of a normalized rectangular region.
   *
   * @param x - Normalized x start (0.0–1.0)
   * @param y - Normalized y start (0.0–1.0)
   * @param w - Normalized width (0.0–1.0)
   * @param h - Normalized height (0.0–1.0)
   * @returns Averaged pixel data with pre-computed luminosity and saturation
   *
   * @accessibility
   * The returned PixelData is used by Sonifier to generate audio feedback.
   * Not directly related to ARIA — feeds Phase 2 audio layer only.
   */
  sample(x: number, y: number, w: number, h: number): PixelData {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return this.emptyPixel()

    const px = Math.round(x * this.canvas.width)
    const py = Math.round(y * this.canvas.height)
    const pw = Math.max(1, Math.round(w * this.canvas.width))
    const ph = Math.max(1, Math.round(h * this.canvas.height))

    const imageData = ctx.getImageData(px, py, pw, ph)
    return this.average(imageData.data)
  }

  private average(data: Uint8ClampedArray): PixelData {
    let r = 0, g = 0, b = 0, a = 0
    const pixels = data.length / 4
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]!
      g += data[i + 1]!
      b += data[i + 2]!
      a += data[i + 3]!
    }
    const avg = { r: r / pixels, g: g / pixels, b: b / pixels, a: a / pixels }
    return {
      ...avg,
      luminosity: 0.2126 * avg.r + 0.7152 * avg.g + 0.0722 * avg.b,
      saturation: this.computeSaturation(avg.r, avg.g, avg.b),
    }
  }

  private computeSaturation(r: number, g: number, b: number): number {
    const max = Math.max(r, g, b) / 255
    const min = Math.min(r, g, b) / 255
    if (max === 0) return 0
    return ((max - min) / max) * 100
  }

  private emptyPixel(): PixelData {
    return { r: 0, g: 0, b: 0, a: 255, luminosity: 0, saturation: 0 }
  }
}
