# SenseArt — Architecture

## Design Principles

1. **Non-invasive**: SenseArt never modifies the OSD viewer instance or its DOM. It only adds an overlay layer.
2. **Plugin pattern**: `SenseArtViewer` is the single public entry point. Internal classes are re-exported only for advanced use.
3. **Separation of concerns**: Navigation, audio, and AI are independent modules with well-defined interfaces.
4. **Graceful degradation**: If Tone.js or the AI endpoint is unavailable, the semantic grid works in full.
5. **ARIA-first**: Every interactive element is designed starting from its ARIA role and screen reader contract, not from its visual appearance.

---

## Monorepo Layout

```
sense-art-monorepo/               ← pnpm workspace root (private)
├── packages/
│   └── sense-art/                ← published npm package
│       ├── src/                  ← TypeScript source
│       ├── dist/                 ← build output (gitignored)
│       ├── vite.config.ts        ← Library Mode: ESM + UMD, vite-plugin-dts
│       ├── tsconfig.json         ← dev (noEmit, allowImportingTsExtensions)
│       ├── tsconfig.build.json   ← build (declaration emit)
│       ├── .releaserc.json       ← semantic-release configuration
│       └── package.json          ← name: sense-art, exports, peerDependencies
├── apps/
│   ├── demo-osd/                 ← Vite app: raw OSD + SenseArt (port 5173)
│   │   ├── src/main.ts
│   │   └── index.html
│   └── demo-storiiies/           ← Vite app: Storiiies-style tour + SenseArt (port 5174)
│       ├── src/main.ts
│       └── index.html
├── .github/
│   └── workflows/
│       ├── ci.yml                ← typecheck + commitlint on push/PR
│       └── release.yml           ← semantic-release on push to main
├── commitlint.config.ts          ← Conventional Commits config + scope enum
├── pnpm-workspace.yaml
├── package.json                  ← workspace root: scripts, husky, commitlint
├── README.md
├── ARCHITECTURE.md
├── ROADMAP.md
└── DOC_GUIDE.md
```

---

## Library Class Map

```
SenseArtViewer              ← public API, orchestrator, lifecycle manager
├── A11yOverlay             ← DOM management, ARIA grid + gridcell elements
│   └── GridCell[][]        ← individual focusable <button role="gridcell"> elements
├── CoordinateMapper        ← grid positions ↔ OSD viewport bounds
├── AriaLiveEngine          ← singleton aria-live region, debounced announcements
└── FocusTrap               ← keyboard event interception (Arrow, Tab, Escape)

Audio layer (Phase 2, dynamic import):
Sonifier                    ← Tone.js audio engine
└── PixelSampler            ← canvas pixel extraction + luminosity/saturation computation

AI layer (Phase 3, pluggable):
ArtworkMapClient            ← fetch + cache coordinator
├── MockProvider            ← JSON fixture (TDD / offline — default)
├── OpenAIProvider          ← planned
├── HuggingFaceProvider     ← planned
└── OllamaProvider          ← planned (local, privacy-preserving)
```

---

## Class Contracts

> Signatures reflect the **current implementation**. Methods marked `[planned]` are defined in the roadmap but not yet written.

### `SenseArtViewer`

```typescript
class SenseArtViewer {
  constructor(viewer: OpenSeadragon.Viewer, options?: SenseArtOptions)

  mount(): void     // inject overlay, register Alt+A keydown listener on document
  unmount(): void   // destroy overlay, remove all event listeners
  enable(): void    // activate focus trap, announce activation via aria-live
  disable(): void   // deactivate focus trap, announce deactivation
  toggle(): void    // called internally by Alt+A handler
  // setGrid(config: GridConfig): void  ← [planned] runtime grid resize
}
```

**Responsibilities**: lifecycle management, wiring sub-modules, handling the `Escape` reset-zoom sentinel from `FocusTrap`, exposing the public API surface.

---

### `A11yOverlay`

```typescript
class A11yOverlay {
  constructor(container: HTMLElement, grid: GridConfig)

  render(getCellLabel: (row: number, col: number) => string): void
  destroy(): void
  getCell(row: number, col: number): GridCell
  getAllCells(): GridCell[][]
  updateCellLabel(row: number, col: number, label: string): void
  setCurrentCell(row: number, col: number): void   // manages aria-current
  setRovingFocus(row: number, col: number): void   // manages tabindex
}
```

**DOM contract (current)**:
```html
<div role="grid" aria-label="Navigazione opera d'arte"
     aria-rowcount="3" aria-colcount="3"
     style="position:absolute; pointer-events:none; display:grid; ...">
  <button role="gridcell" aria-rowindex="1" aria-colindex="1"
          aria-label="Regione Alto-Sinistra. Zoom 1x"
          aria-current="false" tabindex="0"
          style="pointer-events:auto">
  </button>
  <!-- ... 8 more buttons -->
</div>
```

> **Known gap (Task 1.2)**: WAI-ARIA 1.2 Grid Pattern requires `<div role="row">` wrappers between the grid and the gridcell elements. The current implementation uses CSS `display:grid` directly without row containers, which VoiceOver and NVDA may not parse correctly. Fix tracked in ROADMAP.md Task 1.2.

---

### `CoordinateMapper`

```typescript
class CoordinateMapper {
  constructor(viewer: OpenSeadragon.Viewer, grid: GridConfig)

  cellToBounds(row: number, col: number): OpenSeadragon.Rect
  focusToBounds(row: number, col: number): void       // calls viewport.fitBounds()
  currentRegionLabel(row: number, col: number): string // e.g. "Centro-Sinistra"
  currentZoomLabel(): string                           // e.g. "1x"
  viewportToCell(): CellPosition                       // live viewport center → cell
}
```

**Core logic**: Image is divided into an `N×M` grid in *normalized image coordinates* (0.0–1.0). `focusToBounds()` converts to viewport coordinates before calling OSD. `viewportToCell()` syncs `aria-current` when the user navigates via mouse or touch.

---

### `AriaLiveEngine`

```typescript
class AriaLiveEngine {
  constructor(container: HTMLElement)

  announce(message: string, urgency?: 'polite' | 'assertive'): void
  announceZoom(zoomLevel: number, regionLabel: string): void
  announceCell(row: number, col: number, label: string): void
  destroy(): void
}
```

**DOM contract**: Injects one visually hidden `<div aria-live="polite" aria-atomic="true" aria-relevant="text">` into `<body>`. All announcements debounced at **150ms**. `aria-atomic="true"` ensures the full string is read on each update.

**Urgency rules** (per DOC_GUIDE.md):
- `polite` — navigation position, zoom level, cell label.
- `assertive` — errors only (e.g., "Caricamento immagine fallito").

---

### `FocusTrap`

```typescript
class FocusTrap {
  constructor(container: HTMLElement, cells: GridCell[][], grid: GridConfig)

  activate(): void
  deactivate(): void
  focusCell(row: number, col: number): void
  onCellFocus(callback: (row: number, col: number) => void): void
}
```

**Keyboard contract**:

| Key | Behaviour |
|---|---|
| `ArrowRight` | Next column; wraps to next row at edge |
| `ArrowLeft` | Previous column; wraps to previous row at edge |
| `ArrowDown` | Next row; wraps to row 0 at bottom |
| `ArrowUp` | Previous row; wraps to last row at top |
| `Tab` | Next cell linearly (all cells, wraps) |
| `Shift+Tab` | Previous cell linearly (wraps) |
| `Escape` | Fires callback with sentinel `(-1, -1)` → `SenseArtViewer` calls `viewport.goHome()` |
| `Enter` / `Space` | `[planned]` — zoom into focused cell |

`Alt+A` is handled at the `SenseArtViewer` level via a `document` keydown listener — not inside `FocusTrap`.

---

### `Sonifier` (Phase 2)

```typescript
class Sonifier {
  constructor(options: SonifierOptions)

  start(): Promise<void>   // resume Web Audio context (requires prior user gesture)
  stop(): void
  mapToAudio(pixel: PixelData): Promise<void>
}
```

**Audio mapping**: Luminosity (0–255) → MIDI note 36–84 (C2–C6). Saturation (0–100%) → low-pass filter cutoff (200Hz–8000Hz). Tone.js is **dynamically imported** to keep the Phase 1 bundle clean.

---

### `ArtworkMapClient` (Phase 3)

```typescript
interface ArtworkMapProvider {
  fetchMap(imageUrl: string, grid: GridConfig): Promise<ArtworkMap>
}

class ArtworkMapClient {
  constructor(provider: ArtworkMapProvider)
  getMap(imageUrl: string, grid: GridConfig): Promise<ArtworkMap>  // cached
  clearCache(): void
}
```

Provider passed at construction. Default: `MockProvider`. Production providers import separately (tree-shakeable).

---

## Data Flow: Cell Focus (current implementation)

```
User presses ArrowRight
  → FocusTrap intercepts keydown on container
  → FocusTrap.move(0, +1) → calculates next (row, col)
  → FocusTrap.focusCell(row, col)
      → cell.element.focus()           ← native browser focus
      → fires onCellFocus callbacks
          → SenseArtViewer.onCellFocused(row, col)
              → CoordinateMapper.focusToBounds(row, col)
                  → viewport.imageToViewportRectangle(rect)
                  → viewport.fitBounds(viewportRect, animated)
              → A11yOverlay.setCurrentCell(row, col)  ← aria-current
              → A11yOverlay.setRovingFocus(row, col)  ← tabindex
              → CoordinateMapper.currentRegionLabel(row, col)
              → A11yOverlay.updateCellLabel(row, col, newLabel)
              → AriaLiveEngine.announceCell(row, col, label)
                  → debounce 150ms → live region textContent = message
                  → screen reader announces
```

---

## CI/CD & Release Pipeline

```
Push to any branch
  → GitHub Actions: ci.yml
      → pnpm install --frozen-lockfile
      → pnpm build                     ← library must build before apps can resolve workspace:*
      → pnpm typecheck                 ← all packages
      → pnpm commitlint (PR only)      ← validates conventional commit messages

Push to main
  → GitHub Actions: release.yml
      → pnpm install + build
      → cd packages/sense-art
      → semantic-release
          → analyzes commits since last tag
          → determines version bump (patch / minor / major)
          → updates packages/sense-art/package.json version
          → generates / updates CHANGELOG.md
          → commits CHANGELOG.md + package.json [skip ci]
          → creates GitHub Release with notes
          → publishes sense-art to npm
```

**Required GitHub Secrets**:
- `NPM_TOKEN` — npm publish token (set in repo Settings → Secrets)
- `GITHUB_TOKEN` — provided automatically by Actions

**Conventional Commits → version mapping**:

| Commit prefix | Version bump | Example |
|---|---|---|
| `fix:` | patch | 0.1.0 → 0.1.1 |
| `feat:` | minor | 0.1.0 → 0.2.0 |
| `feat!:` / `BREAKING CHANGE:` | major | 0.1.0 → 1.0.0 |
| `docs:` `chore:` `refactor:` | no release | — |

**Scopes** (enforced by commitlint):
`sense-art` · `demo-osd` · `demo-storiiies` · `ci` · `docs` · `deps` · `release`

---

## Apps: demo-osd vs demo-storiiies

### `apps/demo-osd` (port 5173)

Minimal integration: raw OSD viewer with SenseArt mounted on `open`. Tests the accessibility layer in isolation. Used for VoiceOver/NVDA manual testing.

### `apps/demo-storiiies` (port 5174)

Simulates a Storiiies-style **linear curator tour** (5 pre-defined annotation steps), then demonstrates SenseArt restoring **agency**: pressing `Alt+A` at any point exits the linear tour and activates free grid navigation. This is the direct demonstration of the project's thesis — the coexistence of guided experience and autonomous exploration.
