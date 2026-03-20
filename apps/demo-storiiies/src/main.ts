import OpenSeadragon from 'openseadragon'
import { SenseArtViewer } from 'sense-art'

// ─── Rijksmuseum IIIF — "La Ronda di Notte", Rembrandt (public domain) ───────
const IIIF_MANIFEST =
  'https://www.rijksmuseum.nl/api/iiif/SK-C-5/manifest.json'

// ─── Simulated Storiiies tour steps ──────────────────────────────────────────
// Each step has an annotation and a target viewport region (normalized 0.0–1.0).
// This simulates what Storiiies does: a curator-defined linear sequence.
interface TourStep {
  annotation: string
  // Normalized image coordinates: x, y, width, height
  region: { x: number; y: number; w: number; h: number }
}

const TOUR_STEPS: TourStep[] = [
  {
    annotation:
      'La Ronda di Notte, 1642. Una delle opere più grandi di Rembrandt: 363×437 cm. Raffigura una compagnia di tiratori in marcia.',
    region: { x: 0, y: 0, w: 1, h: 1 },
  },
  {
    annotation:
      'Al centro, il capitano Frans Banninck Cocq (abito nero) impartisce ordini al luogotenente Willem van Ruytenburch (abito giallo).',
    region: { x: 0.3, y: 0.1, w: 0.4, h: 0.7 },
  },
  {
    annotation:
      'La fanciulla in giallo — enigmatica e illuminata — porta un pollo bianco alla cintola, simbolo araldico della compagnia.',
    region: { x: 0.38, y: 0.35, w: 0.25, h: 0.45 },
  },
  {
    annotation:
      'Il tamburo a sinistra marca il ritmo della marcia. Nota il contrasto tra luce e ombra che caratterizza il chiaroscuro di Rembrandt.',
    region: { x: 0.05, y: 0.4, w: 0.3, h: 0.5 },
  },
  {
    annotation:
      'In alto a destra, volti emergono dall\'ombra — alcuni soci della compagnia pagarono per essere ritratti. Fine del tour.',
    region: { x: 0.65, y: 0.05, w: 0.35, h: 0.5 },
  },
]

// ─── OSD Viewer ──────────────────────────────────────────────────────────────

const viewer = OpenSeadragon({
  id: 'osd',
  tileSources: IIIF_MANIFEST,
  showNavigator: true,
  navigatorPosition: 'BOTTOM_RIGHT',
  animationTime: 0.8,
  blendTime: 0.1,
  constrainDuringPan: true,
  maxZoomPixelRatio: 2,
  minZoomImageRatio: 0.8,
  visibilityRatio: 0.5,
})

// ─── SenseArt ─────────────────────────────────────────────────────────────────

const senseArt = new SenseArtViewer(viewer, {
  grid: { rows: 3, columns: 3 },
  sonification: { enabled: false },
})

viewer.addOnceHandler('open', () => {
  senseArt.mount()
})

// ─── Storiiies Tour Logic ─────────────────────────────────────────────────────

let currentStep = -1

const annotationEl = document.getElementById('annotation-text')!
const counterEl = document.getElementById('step-counter')!
const btnNext = document.getElementById('btn-next') as HTMLButtonElement
const btnPrev = document.getElementById('btn-prev') as HTMLButtonElement

function goToStep(index: number): void {
  const step = TOUR_STEPS[index]
  if (!step) return

  currentStep = index

  // Update annotation (aria-live="polite" — screen reader will announce)
  annotationEl.textContent = step.annotation

  // Update counter
  counterEl.textContent = `${index + 1} / ${TOUR_STEPS.length}`

  // Pan OSD to the step's region
  const rect = new OpenSeadragon.Rect(step.region.x, step.region.y, step.region.w, step.region.h)
  const vpRect = viewer.viewport.imageToViewportRectangle(rect)
  viewer.viewport.fitBounds(vpRect, false)

  // If SenseArt is active, disable it during the tour (user is in linear mode)
  senseArt.disable()

  btnPrev.disabled = index === 0
  btnNext.disabled = index === TOUR_STEPS.length - 1
}

btnNext.addEventListener('click', () => {
  goToStep(Math.min(currentStep + 1, TOUR_STEPS.length - 1))
})

btnPrev.addEventListener('click', () => {
  goToStep(Math.max(currentStep - 1, 0))
})

// Start at step 0 once the viewer is ready
viewer.addOnceHandler('open', () => {
  goToStep(0)
})

// ─── Dev console ─────────────────────────────────────────────────────────────
;(window as typeof window & { senseArt: SenseArtViewer }).senseArt = senseArt
