// Public API — everything a consumer needs to import from 'sense-art'
export { SenseArtViewer } from './SenseArtViewer.js'

// Core modules (exported for advanced use / custom orchestration)
export { A11yOverlay } from './core/A11yOverlay.js'
export { AriaLiveEngine } from './core/AriaLiveEngine.js'
export { CoordinateMapper } from './core/CoordinateMapper.js'
export { FocusTrap } from './core/FocusTrap.js'

// AI layer (Phase 3)
export { ArtworkMapClient } from './ai/ArtworkMapClient.js'
export { MockProvider } from './ai/MockProvider.js'
export { GeminiProvider } from './ai/GeminiProvider.js'

// All TypeScript types
export type {
  ArtworkMap,
  ArtworkMapOptions,
  ArtworkMapProvider,
  CellMetadata,
  CellPosition,
  GridCell,
  GridConfig,
  OSDViewer,
  PixelData,
  SenseArtOptions,
  SonifierOptions,
} from './types/index.js'
