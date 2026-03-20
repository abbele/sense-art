import type { PixelData, SonifierOptions } from '../types/index.js'

/**
 * Maps pixel color data to audio output using Tone.js.
 *
 * Phase 2 component. The public API is defined here for type safety;
 * the Tone.js import is dynamic to avoid bundling it when sonification is disabled.
 *
 * Audio mapping:
 * - Luminosity (0–255) → Pitch (C2–C6)
 * - Saturation (0–100%) → Low-pass filter cutoff (200Hz–8000Hz)
 */
export class Sonifier {
  private started = false
  private readonly options: Required<SonifierOptions>

  constructor(options: SonifierOptions) {
    this.options = {
      enabled: options.enabled,
      toneDurationMs: options.toneDurationMs ?? 800,
    }
  }

  /**
   * Starts the Tone.js audio context (must be called after a user gesture).
   *
   * @accessibility
   * Web Audio API requires user interaction before audio can play.
   * `start()` should be called from within a keyboard event handler (e.g., cell focus).
   * Until called, `mapToAudio()` is a no-op.
   */
  async start(): Promise<void> {
    if (!this.options.enabled || this.started) return
    // Dynamic import to keep Phase 1 bundle free of Tone.js
    const { start } = await import('tone')
    await start()
    this.started = true
  }

  /** Stop the audio context and release resources. */
  stop(): void {
    this.started = false
  }

  /**
   * Generates a tone based on the given pixel data.
   *
   * @param pixel - Averaged color sample from PixelSampler
   *
   * @accessibility
   * This is the sole audio output mechanism. It does NOT replace ARIA announcements —
   * it is an additive layer for users who benefit from both verbal and tonal feedback.
   */
  async mapToAudio(pixel: PixelData): Promise<void> {
    if (!this.options.enabled || !this.started) return

    const { Synth, Filter, now } = await import('tone')

    // Map luminosity 0–255 → MIDI note 36 (C2) – 84 (C6)
    const midiNote = 36 + Math.round((pixel.luminosity / 255) * 48)
    // Map saturation 0–100 → filter cutoff 200Hz – 8000Hz
    const cutoff = 200 + (pixel.saturation / 100) * 7800

    const filter = new Filter(cutoff, 'lowpass').toDestination()
    const synth = new Synth({ oscillator: { type: 'sine' } }).connect(filter)
    synth.triggerAttackRelease(midiNote, `${this.options.toneDurationMs}n`, now())
  }
}
