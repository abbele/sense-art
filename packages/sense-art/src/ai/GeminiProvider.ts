import type { ArtworkMap, ArtworkMapProvider, GridConfig } from '../types/index.js'

const DEFAULT_MODEL = 'gemini-2.0-flash'
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * AI provider that uses Google Gemini (multimodal) to generate semantic
 * cell-level descriptions for artwork images.
 *
 * Default model: `gemini-2.0-flash`. Free tier: 15 RPM / 1M tokens per day.
 * Get an API key at https://aistudio.google.com/app/apikey
 *
 * @accessibility
 * The `label` returned per cell is applied to `aria-label` on gridcell buttons.
 * Labels are generated in Italian, ≤80 characters, without visual-only jargon,
 * so screen readers can announce meaningful content instead of generic coordinates.
 *
 * @example
 * ```typescript
 * const provider = new GeminiProvider({ apiKey: 'AIza...' })
 * const client = new ArtworkMapClient(provider)
 * const map = await client.getMap('https://example.com/artwork.jpg', { rows: 3, columns: 3 })
 * ```
 */
export class GeminiProvider implements ArtworkMapProvider {
  private readonly apiKey: string
  private readonly model: string
  private readonly baseUrl: string

  constructor(options: { apiKey: string; model?: string; baseUrl?: string }) {
    this.apiKey = options.apiKey
    this.model = options.model ?? DEFAULT_MODEL
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  }

  /**
   * Fetches AI-generated metadata for each grid cell of the artwork.
   *
   * @param imageUrl - Public URL of the artwork image. For IIIF sources,
   *   pass the full image URL or a thumbnail URL (recommended: 800px wide).
   * @param grid - Grid configuration (rows × columns)
   * @returns ArtworkMap with CellMetadata for every cell
   *
   * @accessibility
   * - Labels are in Italian, ≤80 characters, sensory rather than purely visual.
   * - `interestScore` can be used to guide the user toward the most relevant cells.
   * - On failure, throws an error — `ArtworkMapClient` callers should handle
   *   gracefully by falling back to generic labels.
   */
  async fetchMap(imageUrl: string, grid: GridConfig): Promise<ArtworkMap> {
    const imageBase64 = await this.fetchImageAsBase64(imageUrl)
    const prompt = this.buildPrompt(grid)
    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,   // low temperature for consistent structured output
      },
    }

    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`GeminiProvider: HTTP ${response.status} — ${await response.text()}`)
    }

    const json = await response.json() as GeminiResponse
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('GeminiProvider: empty response from API')

    return this.parseResponse(text, grid)
  }

  private buildPrompt(grid: GridConfig): string {
    return `Sei un assistente per la fruizione accessibile di opere d'arte rivolto a utenti non vedenti.

Analizza questa immagine e dividila mentalmente in una griglia di ${grid.rows} righe × ${grid.columns} colonne (riga 0 = alto, riga ${grid.rows - 1} = basso; colonna 0 = sinistra, colonna ${grid.columns - 1} = destra).

Per ogni cella fornisci:
- "label": descrizione sensoriale in italiano, massimo 80 caratteri. Evita gergo visivo puro. Preferisci descrizioni che evocano materiali, persone, azioni, atmosfera.
- "sensoryTags": 3–5 tag in italiano che descrivono qualità sensoriali (es. "caldo", "freddo", "testurizzato", "movimento", "metallo").
- "interestScore": da 0.0 a 1.0, importanza compositiva della cella (1.0 = soggetto principale, 0.0 = sfondo vuoto).

Rispondi ESCLUSIVAMENTE con JSON valido, nessun testo aggiuntivo:
{"cells":[[{"row":0,"col":0,"label":"...","sensoryTags":["..."],"interestScore":0.5}]]}`
  }

  private async fetchImageAsBase64(imageUrl: string): Promise<string> {
    // data: URLs from canvas.toDataURL() — extract base64 directly, no fetch needed.
    if (imageUrl.startsWith('data:')) {
      const base64 = imageUrl.split(',')[1]
      if (!base64) throw new Error('GeminiProvider: invalid data URL')
      return base64
    }
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`GeminiProvider: failed to fetch image (HTTP ${response.status})`)
    }
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]!)
    }
    return btoa(binary)
  }

  private parseResponse(text: string, grid: GridConfig): ArtworkMap {
    let parsed: { cells?: unknown[][] }
    try {
      parsed = JSON.parse(text) as { cells?: unknown[][] }
    } catch {
      throw new Error(`GeminiProvider: invalid JSON in response — ${text.slice(0, 200)}`)
    }

    if (!Array.isArray(parsed.cells)) {
      throw new Error('GeminiProvider: response missing "cells" array')
    }

    // Validate dimensions match the requested grid
    if (parsed.cells.length !== grid.rows) {
      throw new Error(
        `GeminiProvider: expected ${grid.rows} rows, got ${parsed.cells.length}`,
      )
    }

    const cells = (parsed.cells as unknown[][]).map((rowArr, r) => {
      if (!Array.isArray(rowArr) || rowArr.length !== grid.columns) {
        throw new Error(
          `GeminiProvider: row ${r} expected ${grid.columns} columns, got ${Array.isArray(rowArr) ? rowArr.length : 'non-array'}`,
        )
      }
      return rowArr.map((cell, c) => {
        const m = cell as Record<string, unknown>
        return {
          row: r,
          col: c,
          label: typeof m['label'] === 'string' ? m['label'].slice(0, 80) : `Regione ${r + 1}-${c + 1}`,
          sensoryTags: Array.isArray(m['sensoryTags']) ? (m['sensoryTags'] as string[]) : [],
          interestScore: typeof m['interestScore'] === 'number' ? m['interestScore'] : 0.5,
        }
      })
    })

    return { cells }
  }
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
}
