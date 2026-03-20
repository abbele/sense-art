import type { ArtworkMap, ArtworkMapProvider, GridConfig } from '../types/index.js'

/**
 * Fetches and caches the AI-generated artwork map for a given image.
 *
 * The provider is injected at construction time, making it trivially swappable
 * between MockProvider (development), OpenAIProvider, HuggingFaceProvider, etc.
 */
export class ArtworkMapClient {
  private cache: Map<string, ArtworkMap> = new Map()
  private readonly provider: ArtworkMapProvider

  constructor(provider: ArtworkMapProvider) {
    this.provider = provider
  }

  /**
   * Returns the artwork map for the given image URL, fetching from the provider
   * on first call and returning from cache on subsequent calls.
   *
   * @param imageUrl - Public URL of the artwork image
   * @param grid - Grid configuration to generate cell-level metadata
   * @returns Resolved ArtworkMap with CellMetadata for every cell
   *
   * @accessibility
   * Once resolved, `CellMetadata.label` should be applied to the corresponding
   * gridcell `aria-label` via `A11yOverlay.updateCellLabel()`.
   * `CellMetadata.sensoryTags` are available for additional `aria-description` enrichment.
   */
  async getMap(imageUrl: string, grid: GridConfig): Promise<ArtworkMap> {
    const cacheKey = `${imageUrl}__${grid.rows}x${grid.columns}`
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }
    const map = await this.provider.fetchMap(imageUrl, grid)
    this.cache.set(cacheKey, map)
    return map
  }

  /** Clears the internal cache (e.g., when the artwork or grid changes). */
  clearCache(): void {
    this.cache.clear()
  }
}
