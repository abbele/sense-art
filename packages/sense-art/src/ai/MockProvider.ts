import type { ArtworkMap, ArtworkMapProvider, GridConfig } from '../types/index.js'

/**
 * Mock AI provider that loads artwork map data from a local JSON fixture.
 *
 * Use this provider during development and testing. The fixture file at
 * `src/ai/fixtures/artwork-map.json` can be hand-crafted to simulate
 * any AI response shape, enabling TDD without an API key.
 *
 * @accessibility
 * The CellMetadata returned by this provider is used to populate `aria-label`
 * on gridcell buttons. Labels must be in Italian, ≤80 characters, and must
 * avoid visual jargon inaccessible to blind users.
 */
export class MockProvider implements ArtworkMapProvider {
  async fetchMap(imageUrl: string, grid: GridConfig): Promise<ArtworkMap> {
    // In browser env, we return a hardcoded fixture.
    // In Node/test env this can be replaced with an actual JSON import.
    void imageUrl
    return this.generateDefaultMap(grid)
  }

  private generateDefaultMap(grid: GridConfig): ArtworkMap {
    const cells = Array.from({ length: grid.rows }, (_, row) =>
      Array.from({ length: grid.columns }, (_, col) => ({
        row,
        col,
        interestScore: Math.random(),
        label: `Regione ${row + 1}-${col + 1} — Analisi non disponibile`,
        sensoryTags: ['neutro'],
      })),
    )
    return { cells }
  }
}
