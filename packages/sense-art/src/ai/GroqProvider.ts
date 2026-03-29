import type { ArtworkMap, ArtworkMapProvider, GridConfig } from '../types/index.js'

const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1'

/**
 * AI provider that uses Groq's ultra-fast inference API to generate semantic
 * cell-level descriptions for artwork images.
 *
 * Groq exposes an OpenAI-compatible API — uses `/chat/completions` with
 * image content blocks. Default model: `meta-llama/llama-4-scout-17b-16e-instruct`
 * (Llama 4 Scout, vision-capable). `llama-3.1-8b-instant` is text-only.
 *
 * Get an API key at https://console.groq.com
 *
 * @accessibility
 * The `label` returned per cell is applied to `aria-label` on gridcell buttons.
 * Labels are generated in Italian, ≤80 characters, without visual-only jargon.
 *
 * @example
 * ```typescript
 * const provider = new GroqProvider({ apiKey: 'gsk_...' })
 * const client = new ArtworkMapClient(provider)
 * const map = await client.getMap('', { rows: 3, columns: 3 })
 * ```
 */
export class GroqProvider implements ArtworkMapProvider {
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
   * @param imageUrl - `data:` URL from canvas or public image URL
   * @param grid - Grid configuration (rows × columns)
   * @returns ArtworkMap with CellMetadata for every cell
   *
   * @accessibility
   * - Labels in Italian, ≤80 characters, sensory rather than purely visual.
   * - On failure, throws — callers should handle gracefully.
   */
  async fetchMap(imageUrl: string, grid: GridConfig): Promise<ArtworkMap> {
    const prompt = this.buildPrompt(grid)
    const body = {
      model: this.model,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`GroqProvider: HTTP ${response.status} — ${await response.text()}`)
    }

    const json = await response.json() as GroqResponse
    const text = json.choices?.[0]?.message?.content
    if (!text) throw new Error('GroqProvider: empty response from API')

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

  private parseResponse(text: string, grid: GridConfig): ArtworkMap {
    let parsed: { cells?: unknown[][] }
    try {
      parsed = JSON.parse(text) as { cells?: unknown[][] }
    } catch {
      throw new Error(`GroqProvider: invalid JSON in response — ${text.slice(0, 200)}`)
    }

    if (!Array.isArray(parsed.cells)) {
      throw new Error('GroqProvider: response missing "cells" array')
    }

    if (parsed.cells.length !== grid.rows) {
      throw new Error(`GroqProvider: expected ${grid.rows} rows, got ${parsed.cells.length}`)
    }

    const cells = (parsed.cells as unknown[][]).map((rowArr, r) => {
      if (!Array.isArray(rowArr) || rowArr.length !== grid.columns) {
        throw new Error(
          `GroqProvider: row ${r} expected ${grid.columns} columns, got ${Array.isArray(rowArr) ? rowArr.length : 'non-array'}`,
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

interface GroqResponse {
  choices?: Array<{
    message?: { content?: string }
  }>
}
