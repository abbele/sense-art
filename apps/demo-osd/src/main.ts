import OpenSeadragon from 'openseadragon'
import { SenseArtViewer } from 'sense-art'

// ─── La Ronda di Notte — Rembrandt (public domain) ───────────────────────────
// Rijksmuseum new IIIF API (2025) via Micrio — no API key required.
// Using IIIF Image API info.json (14645×12158 px, 1024px tiles) — OSD parses this natively.
// Micrio image ID: PJEZO  (resolved from https://data.rijksmuseum.nl/docs/iiif)
const IIIF_MANIFEST = 'https://iiif.micr.io/PJEZO/info.json'

const viewer = OpenSeadragon({
  id: 'osd',
  tileSources: IIIF_MANIFEST,
  // OSD looks for toolbar SVGs at images/ — in Vite there is no such path; use CDN.
  prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
  // Request tiles with CORS headers so the canvas is not tainted.
  // Required for PixelSampler.sample() to call getImageData() without a SecurityError.
  // iiif.micr.io responds with Access-Control-Allow-Origin: * for public images.
  crossOriginPolicy: 'Anonymous',
  // Force 2D canvas renderer: WebGL fails on gigapixel textures and, crucially,
  // PixelSampler.sample() requires getImageData() which is only available on a
  // 2D canvas context (not on a WebGL context).
  drawer: 'canvas',
  showNavigator: true,
  navigatorPosition: 'BOTTOM_RIGHT',
  animationTime: 0.5,
  blendTime: 0.1,
  constrainDuringPan: true,
  maxZoomPixelRatio: 2,
  minZoomImageRatio: 0.8,
  visibilityRatio: 0.5,
  zoomPerScroll: 1.2,
  preserveViewport: true,
})

// ─── SenseArt ─────────────────────────────────────────────────────────────────

const senseArt = new SenseArtViewer(viewer, {
  grid: { rows: 3, columns: 3 },
  sonification: { enabled: true },
  ai: {
    provider: (import.meta.env.VITE_AI_PROVIDER ?? 'mock') as 'mock' | 'gemini' | 'groq' | 'openai' | 'huggingface' | 'ollama',
    apiKey: import.meta.env.VITE_AI_API_KEY ?? '',
  }
})

// Mount on OSD ready (canvas must exist before overlay is injected)
viewer.addOnceHandler('open', () => {
  senseArt.mount()
})

// Test button — activate/deactivate without using the keyboard shortcut
const toggleBtn = document.getElementById('toggle-btn') as HTMLButtonElement
viewer.addOnceHandler('open', () => {
  toggleBtn.addEventListener('click', () => {
    senseArt.toggle()
    toggleBtn.textContent = toggleBtn.textContent === 'Attiva layer' ? 'Disattiva layer' : 'Attiva layer'
  })
})

// Expose to browser console for manual testing
;(window as typeof window & { senseArt: SenseArtViewer }).senseArt = senseArt
