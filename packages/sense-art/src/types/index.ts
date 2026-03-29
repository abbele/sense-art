import type OpenSeadragon from 'openseadragon'

// ─── Grid ────────────────────────────────────────────────────────────────────

export interface GridConfig {
  rows: number
  columns: number
}

export interface CellPosition {
  row: number
  col: number
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface SenseArtOptions {
  /** Grid dimensions. Default: 3×3 */
  grid?: GridConfig
  /** Keyboard shortcut to toggle the layer. Default: "Alt+A" */
  activationShortcut?: string
  sonification?: SonifierOptions
  ai?: ArtworkMapOptions
}

export interface SonifierOptions {
  enabled: boolean
  /** Duration in ms of the tone burst on cell focus. Default: 800 */
  toneDurationMs?: number
}

export interface ArtworkMapOptions {
  /** URL of the artwork image to send to the AI provider */
  imageUrl?: string
  /**
   * AI provider to use. Default: `'gemini'`.
   * Use `'mock'` for development/testing (no API key required).
   */
  provider?: 'mock' | 'gemini' | 'openai' | 'huggingface' | 'ollama'
  /** API key for the selected provider. Not required for `'mock'` or `'ollama'`. */
  apiKey?: string
  /**
   * Model identifier. Defaults per provider:
   * - gemini: `'gemini-2.0-flash'`
   * - openai: `'gpt-4o'`
   * - huggingface: `'llava-hf/llava-1.5-7b-hf'`
   * - ollama: `'llava:13b'`
   */
  model?: string
  /**
   * Custom API base URL. Useful for self-hosted endpoints (Ollama, Vertex AI, etc.).
   * Defaults per provider:
   * - ollama: `'http://localhost:11434'`
   */
  baseUrl?: string
}

// ─── AI / Mental Map ─────────────────────────────────────────────────────────

export interface CellMetadata {
  row: number
  col: number
  /** 0.0 (least interesting) – 1.0 (most interesting) */
  interestScore: number
  /** Human-readable label in the configured locale */
  label: string
  /** Sensory descriptors, e.g. ["caldo", "testurizzato", "alto-contrasto"] */
  sensoryTags: string[]
}

export interface ArtworkMap {
  cells: CellMetadata[][]
}

export interface ArtworkMapProvider {
  fetchMap(imageUrl: string, grid: GridConfig): Promise<ArtworkMap>
}

// ─── Pixel / Audio ───────────────────────────────────────────────────────────

export interface PixelData {
  r: number
  g: number
  b: number
  a: number
  /** Pre-computed luminosity 0–255 */
  luminosity: number
  /** Pre-computed HSL saturation 0–100 */
  saturation: number
}

// ─── Internal ────────────────────────────────────────────────────────────────

export interface GridCell {
  element: HTMLButtonElement
  position: CellPosition
  label: string
  metadata?: CellMetadata
}

export type OSDViewer = OpenSeadragon.Viewer
