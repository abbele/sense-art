import type { ArtworkMap, ArtworkMapProvider, GridConfig } from '../types/index.js'
import fixtureMap from './fixtures/artwork-map.json' with { type: 'json' }

/**
 * Mock AI provider that loads artwork map data from a bundled JSON fixture.
 *
 * Use this provider during development, testing, and offline environments.
 * Returns the hand-crafted fixture for 3×3 grids (La Ronda di Notte);
 * falls back to generic labels for other grid sizes.
 * No API key required.
 *
 * @accessibility
 * The CellMetadata returned by this provider is used to populate `aria-label`
 * on gridcell buttons. Labels must be in Italian, ≤80 characters, and must
 * avoid visual jargon inaccessible to blind users.
 */
export class MockProvider implements ArtworkMapProvider {
  async fetchMap(imageUrl: string, grid: GridConfig): Promise<ArtworkMap> {
    void imageUrl
    // Use the hand-crafted fixture if the grid matches (3×3)
    const fixture = fixtureMap as ArtworkMap
    if (
      grid.rows === fixture.cells.length &&
      grid.columns === (fixture.cells[0]?.length ?? 0)
    ) {
      return fixture
    }
    return this.generateDefaultMap(grid)
  }

  private generateDefaultMap(grid: GridConfig): ArtworkMap {
    const cells = Array.from({ length: grid.rows }, (_, row) =>
      Array.from({ length: grid.columns }, (_, col) => ({
        row,
        col,
        interestScore: 0.5,
        label: `Regione ${row + 1}-${col + 1} — Analisi non disponibile`,
        sensoryTags: ['neutro'],
      })),
    )
    return { cells }
  }
}
