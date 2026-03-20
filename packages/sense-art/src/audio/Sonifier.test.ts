import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sonifier } from './Sonifier.js'
import type { PixelData } from '../types/index.js'
import * as Tone from 'tone'

// Mock Tone.js — use regular functions so they work as constructors (new Synth/Filter)
vi.mock('tone', () => ({
  start: vi.fn().mockResolvedValue(undefined),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Synth: vi.fn().mockImplementation(function (this: any) {
    this.connect = vi.fn().mockReturnThis()
    this.triggerAttackRelease = vi.fn()
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Filter: vi.fn().mockImplementation(function (this: any) {
    this.toDestination = vi.fn().mockReturnThis()
  }),
  now: vi.fn().mockReturnValue(0),
}))

function blackPixel(): PixelData {
  return { r: 0, g: 0, b: 0, a: 255, luminosity: 0, saturation: 0 }
}

function whitePixel(): PixelData {
  return { r: 255, g: 255, b: 255, a: 255, luminosity: 255, saturation: 0 }
}

function saturatedPixel(saturation: number): PixelData {
  return { r: 255, g: 0, b: 0, a: 255, luminosity: 54, saturation }
}

describe('Sonifier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── start() ──────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('calls Tone.start() when enabled', async () => {
      const s = new Sonifier({ enabled: true })
      await s.start()
      expect(Tone.start).toHaveBeenCalledOnce()
    })

    it('does NOT call Tone.start() when enabled is false', async () => {
      const s = new Sonifier({ enabled: false })
      await s.start()
      expect(Tone.start).not.toHaveBeenCalled()
    })

    it('is idempotent — only calls Tone.start() once if called twice', async () => {
      const s = new Sonifier({ enabled: true })
      await s.start()
      await s.start()
      expect(Tone.start).toHaveBeenCalledOnce()
    })
  })

  // ─── mapToAudio() — guard conditions ──────────────────────────────────────

  describe('mapToAudio() — guard conditions', () => {
    it('is a no-op when enabled is false', async () => {
      const s = new Sonifier({ enabled: false })
      await s.mapToAudio(blackPixel())
      expect(Tone.Synth).not.toHaveBeenCalled()
    })

    it('is a no-op before start() is called', async () => {
      const s = new Sonifier({ enabled: true })
      // Do NOT call start() → started = false
      await s.mapToAudio(blackPixel())
      expect(Tone.Synth).not.toHaveBeenCalled()
    })
  })

  // ─── Luminosity → MIDI note mapping ───────────────────────────────────────

  describe('luminosity → MIDI note', () => {
    async function getSynthInstance(luminosity: number) {
      vi.clearAllMocks()
      const s = new Sonifier({ enabled: true })
      ;(s as unknown as { started: boolean }).started = true
      await s.mapToAudio({ ...blackPixel(), luminosity })
      return vi.mocked(Tone.Synth).mock.instances[0] as unknown as {
        triggerAttackRelease: ReturnType<typeof vi.fn>
      }
    }

    it('luminosity 0 maps to MIDI note 36 (C2)', async () => {
      const inst = await getSynthInstance(0)
      expect(inst.triggerAttackRelease.mock.calls[0]?.[0]).toBe(36)
    })

    it('luminosity 255 maps to MIDI note 84 (C6)', async () => {
      const inst = await getSynthInstance(255)
      expect(inst.triggerAttackRelease.mock.calls[0]?.[0]).toBe(84)
    })

    it('luminosity 128 maps to approximately MIDI note 60 (C4)', async () => {
      const inst = await getSynthInstance(128)
      const note = inst.triggerAttackRelease.mock.calls[0]?.[0] as number
      expect(note).toBeCloseTo(60, 0)
    })
  })

  // ─── Saturation → filter cutoff mapping ───────────────────────────────────

  describe('saturation → filter cutoff', () => {
    async function getCutoff(saturation: number): Promise<number> {
      vi.clearAllMocks()
      const s = new Sonifier({ enabled: true })
      ;(s as unknown as { started: boolean }).started = true
      await s.mapToAudio(saturatedPixel(saturation))
      // Filter is called as new Filter(cutoff, 'lowpass') — first arg is cutoff
      return (vi.mocked(Tone.Filter).mock.calls[0]?.[0] as number) ?? -1
    }

    it('saturation 0 maps to filter cutoff 200Hz', async () => {
      expect(await getCutoff(0)).toBeCloseTo(200)
    })

    it('saturation 100 maps to filter cutoff 8000Hz', async () => {
      expect(await getCutoff(100)).toBeCloseTo(8000)
    })

    it('saturation 50 maps to approximately 4100Hz', async () => {
      const cutoff = await getCutoff(50)
      expect(cutoff).toBeCloseTo(200 + (50 / 100) * 7800, 0)
    })
  })

  // ─── Filter type ──────────────────────────────────────────────────────────

  describe('filter configuration', () => {
    it('always uses a lowpass filter', async () => {
      const s = new Sonifier({ enabled: true })
      ;(s as unknown as { started: boolean }).started = true
      await s.mapToAudio(whitePixel())
      const calls = vi.mocked(Tone.Filter).mock.calls as unknown as [number, string][]
      expect(calls[0]?.[1]).toBe('lowpass')
    })
  })

  // ─── stop() ───────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('stop() after start() prevents further audio output', async () => {
      const s = new Sonifier({ enabled: true })
      await s.start()
      s.stop()
      vi.clearAllMocks()
      await s.mapToAudio(whitePixel())
      expect(Tone.Synth).not.toHaveBeenCalled()
    })
  })
})
