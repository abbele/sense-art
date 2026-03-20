import OpenSeadragon from 'openseadragon'
import { SenseArtViewer } from 'sense-art'

// ─── Rijksmuseum IIIF — "La Ronda di Notte", Rembrandt (public domain) ───────
const IIIF_MANIFEST =
  'https://www.rijksmuseum.nl/api/iiif/SK-C-5/manifest.json'

const viewer = OpenSeadragon({
  id: 'osd',
  tileSources: IIIF_MANIFEST,
  showNavigator: true,
  navigatorPosition: 'BOTTOM_RIGHT',
  animationTime: 0.5,
  blendTime: 0.1,
  constrainDuringPan: true,
  maxZoomPixelRatio: 2,
  minZoomImageRatio: 0.8,
  visibilityRatio: 0.5,
  zoomPerScroll: 1.2,
})

// ─── SenseArt ─────────────────────────────────────────────────────────────────

const senseArt = new SenseArtViewer(viewer, {
  grid: { rows: 3, columns: 3 },
  sonification: { enabled: false }, // TODO Phase 2: set to true to test audio
})

// Mount on OSD ready (canvas must exist before overlay is injected)
viewer.addOnceHandler('open', () => {
  senseArt.mount()
})

// Expose to browser console for manual testing
;(window as typeof window & { senseArt: SenseArtViewer }).senseArt = senseArt
