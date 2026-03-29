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

Audio layer (Phase 2, wired):
Sonifier                    ← Tone.js audio engine (dynamic import, lazily started)
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

  mount(): void                   // inject overlay, register shortcut listener, start ResizeObserver
  unmount(): void                 // destroy overlay, remove all event listeners
  enable(): void                  // activate focus trap, start Sonifier (if enabled), announce
  disable(): void                 // deactivate focus trap, announce deactivation
  toggle(): void                  // called internally by shortcut handler
  setGrid(config: GridConfig): void // runtime grid resize without remount
}
```

**Responsibilities**: lifecycle management, wiring sub-modules, handling the `Escape` reset-zoom sentinel from `FocusTrap`, exposing the public API surface.

**`activationShortcut`** (`SenseArtOptions.activationShortcut`): any `"Modifier+Key"` string (e.g., `"Alt+A"`, `"Ctrl+Shift+S"`). Parsed once in the constructor into a `ParsedShortcut` struct. The handler matches against both `e.key` and `e.code` — the `e.code` fallback is required on macOS with non-US keyboards (e.g., Italian `Option+A` produces `å` as `e.key`).

**`activating` flag**: set to `true` around the `focusCell(0, 0, true)` call in `enable()`. Guards `onCellFocused` so the viewport is not panned/zoomed when the layer first activates.

**`canvas-key-down` hook**: registered in `mount()` via OSD's `addHandler` API. Sets `event.preventDefaultAction = true` while the layer is active, blocking OSD's internal arrow-key handlers (pan/zoom) without stopping DOM propagation — so `FocusTrap` still receives the event.

**`ResizeObserver`**: started in `mount()`, disconnected in `unmount()`. On every container resize, all cell labels (which include the current zoom level) are refreshed via `A11yOverlay.updateCellLabel()`.

**Sonifier wiring**: when `sonification.enabled` is true, a `Sonifier` instance is created in `mount()`. `Sonifier.start()` is called inside `enable()` — which is always invoked from a keyboard event handler, satisfying the Web Audio user-gesture requirement. After each cell focus, `sonifyCell()` lazily initialises a `PixelSampler` on the first OSD `<canvas>` child and calls `Sonifier.mapToAudio()` with the sampled pixel data.

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
  setCurrentCell(row: number, col: number): void      // manages aria-current
  setRovingFocus(row: number, col: number): void      // manages tabindex
  setInteractive(enabled: boolean): void              // pointer-events on all cells
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
          style="pointer-events:none">  <!-- none by default; auto after setInteractive(true) -->
  </button>
  <!-- ... 8 more buttons -->
</div>
```

`setInteractive(true)` is called by `SenseArtViewer.enable()` so OSD receives all mouse/touch events normally when the layer is inactive.

> **Compliant**: each row is wrapped in `<div role="row" style="display:contents">`. `display:contents` removes the div from the CSS box model so the grid layout is unaffected, while preserving the required ARIA nesting for VoiceOver and NVDA.

---

### `CoordinateMapper`

```typescript
class CoordinateMapper {
  constructor(viewer: OpenSeadragon.Viewer, grid: GridConfig)

  snapshotViewport(): void                             // captures current viewport bounds
  cellToBounds(row: number, col: number): OpenSeadragon.Rect  // normalized [0,1] coords (used by PixelSampler)
  focusToBounds(row: number, col: number): void        // calls viewport.fitBounds() within snapshot bounds
  currentRegionLabel(row: number, col: number): string // e.g. "Centro-Sinistra"
  currentZoomLabel(): string                           // e.g. "1x"
  viewportToCell(): CellPosition                       // live viewport center → cell
}
```

**Core logic**: `snapshotViewport()` is called at `enable()` time to capture the current OSD viewport bounds (in viewport coordinates). `focusToBounds()` subdivides those snapshot bounds into the configured grid, so cells always map to what the user was looking at when they activated the layer — not the full image. `cellToBounds()` still returns normalized [0,1] image coords for use by `PixelSampler`. `viewportToCell()` syncs `aria-current` when the user navigates via mouse or touch.

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

  activate(): void    // registers keydown listener with useCapture=true
  deactivate(): void
  focusCell(row: number, col: number, silent?: boolean): void
  onCellFocus(callback: (row: number, col: number, activate?: boolean) => void): void
}
```

**`activate()` uses `useCapture: true`** so `FocusTrap` intercepts `keydown` events before OSD's canvas handler, which may call `stopPropagation`.

**`focusCell(row, col, silent?)`**: when `silent=true`, DOM focus moves without firing `onCellFocus` callbacks. Used by `enable()` (no zoom on activation) and by `Escape` (viewport already reset by `goHome()`).

**`onCellFocus` callback signature**: `(row, col, activate?)`. Navigation (Arrow/Tab) fires with `activate=undefined`; `Enter`/`Space` fires with `activate=true`. `SenseArtViewer` uses this to distinguish "move highlight" from "zoom into cell".

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
| `Enter` / `Space` | Fires callback with `activate=true` → `SenseArtViewer` calls `focusToBounds()` (explicit zoom) |

`Alt+A` is handled at the `SenseArtViewer` level via a `document` keydown listener — not inside `FocusTrap`.

---

### `Sonifier`

```typescript
class Sonifier {
  constructor(options: SonifierOptions)

  start(): Promise<void>   // resume Web Audio context (requires prior user gesture)
  stop(): void
  mapToAudio(pixel: PixelData): Promise<void>
}
```

**Audio mapping**: Luminosity (0–255) → MIDI note 36–84 (C2–C6). Saturation (0–100%) → low-pass filter cutoff (200Hz–8000Hz). Tone.js is **dynamically imported** to keep the bundle lean when sonification is disabled.

**Lifecycle**: `SenseArtViewer.enable()` calls `start()` (from within a keyboard event handler, satisfying the Web Audio autoplay policy). Each cell focus triggers `mapToAudio()` with data from `PixelSampler`. `stop()` resets the started flag; a subsequent `enable()` call will restart the context.

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

## Data Flow: Cell Navigation vs. Cell Activation

### Arrow / Tab — move highlight, no viewport change

```
User presses ArrowRight
  → FocusTrap intercepts keydown (capture phase, before OSD)
  → FocusTrap.move(0, +1) → calculates next (row, col)
  → FocusTrap.focusCell(row, col)
      → cell.element.focus({ preventScroll: true })  ← native browser focus
      → fires onCellFocus callbacks (activate=undefined)
          → SenseArtViewer.onCellFocused(row, col, activate=false)
              → [no focusToBounds — viewport stays still]
              → A11yOverlay.setCurrentCell(row, col)  ← aria-current
              → A11yOverlay.setRovingFocus(row, col)  ← tabindex
              → CoordinateMapper.currentRegionLabel(row, col)
              → A11yOverlay.updateCellLabel(row, col, newLabel)
              → AriaLiveEngine.announceCell(row, col, label)
                  → debounce 150ms → live region textContent = message
                  → screen reader announces
```

### Enter / Space — zoom into focused cell

```
User presses Enter (or Space)
  → FocusTrap fires onCellFocus callbacks (activate=true)
      → SenseArtViewer.onCellFocused(row, col, activate=true)
          → CoordinateMapper.focusToBounds(row, col)
              → uses snapshotBounds (captured at enable() time)
              → subdivides snapshot into grid cells (viewport coords)
              → viewport.fitBounds(cellBounds, animated)
          → A11yOverlay.setCurrentCell / setRovingFocus / updateCellLabel
          → AriaLiveEngine.announceCell
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
