# SenseArt — Documentation & Testing Guide

## JSDoc Convention

Every public method must carry these tags in addition to standard `@param` / `@returns`:

```typescript
/**
 * Moves focus to a specific grid cell and pans the viewer to its bounds.
 *
 * @param row - Zero-based row index (0 = top)
 * @param col - Zero-based column index (0 = left)
 *
 * @accessibility
 * - Calls `viewer.viewport.fitBounds()` to zoom OSD into the cell region.
 * - Triggers `AriaLiveEngine.announceCell()` — screen reader will announce
 *   the new position within ~150ms.
 * - Sets `aria-current="true"` on the focused cell.
 * - Does NOT move browser focus (focus stays on the `<button>` gridcell).
 *
 * @example
 * senseArt.focusCell(1, 2) // focus "Centro-Destra"
 */
focusCell(row: number, col: number): void
```

### Required Tags

| Tag | Required on | Purpose |
|---|---|---|
| `@accessibility` | Every public method that touches DOM or ARIA | Documents the screen reader contract |
| `@param` | All parameters | Standard |
| `@returns` | Non-void methods | Standard |
| `@example` | All public API methods | Shows minimal usage |
| `@throws` | Methods that throw | Documents error conditions |

### The `@accessibility` Block Format

The `@accessibility` block must answer:
1. **What ARIA attribute changes** (e.g., `aria-current`, `aria-label`, `aria-live`)
2. **What is announced** to the screen reader (exact string or pattern)
3. **When** the announcement fires (immediately, debounced, on next event)
4. **What focus does** (moves / stays / returns)

---

## ARIA Patterns Reference

### Grid Navigation Pattern (ARIA 1.2)

SenseArt implements the [Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/):

```html
<div role="grid" aria-label="Navigazione opera d'arte"
     aria-rowcount="3" aria-colcount="3">
  <div role="row">
    <button role="gridcell" aria-rowindex="1" aria-colindex="1"
            aria-label="Regione Alto-Sinistra. Zoom 1x"
            aria-current="false" tabindex="-1">
    </button>
    <!-- ... -->
  </div>
</div>
```

**Rules**:
- The grid container itself is NOT focusable (`tabindex` is NOT on the grid `div`).
- Only the active cell has `tabindex="0"` (roving tabindex pattern).
- All other cells have `tabindex="-1"`.
- `aria-current="true"` marks the cell corresponding to the currently visible viewport region.

### `aria-live` Region

```html
<!-- Injected into <body>, visually hidden -->
<div aria-live="polite" aria-atomic="true" aria-relevant="text"
     class="sa-live-region">
</div>
```

**Rules**:
- Use `polite` for navigation announcements (position, zoom level).
- Use `assertive` ONLY for critical errors (e.g., "Caricamento immagine fallito").
- Always set `aria-atomic="true"` so the entire message is read, not just the diff.
- Never clear the live region immediately — leave the last message for 2 seconds to ensure it is read.

---

## Screen Reader Testing Protocols

### VoiceOver (macOS)

**Setup**: `System Settings → Accessibility → VoiceOver → Enable` (or `Cmd+F5`)

**Test script — Task 1.2 (Grid)**:
1. Open the demo page in Safari (VoiceOver works best with Safari on macOS).
2. Press `Tab` until VoiceOver announces "Navigazione opera d'arte, griglia".
3. Verify: VoiceOver announces the grid role and label.
4. Press `ArrowRight`. Verify: "Regione Alto-Centro" (or equivalent).
5. Press `ArrowDown`. Verify: "Regione Centro-Sinistra".
6. Press `Escape`. Verify: "Zoom reimpostato" announced, focus returns to Alto-Sinistra.

**Expected VoiceOver output format**:
```
"Regione Alto-Sinistra. Zoom 1x. Riga 1 di 3, Colonna 1 di 3. Gridcell."
```

**Common VoiceOver pitfalls**:
- VoiceOver reads `role="gridcell"` only if inside `role="row"` inside `role="grid"` — nesting is mandatory.
- `aria-label` on a `<button>` overrides button text completely — use it for spatial description.
- `aria-live` inside a `display:none` element is never announced — use `clip-path` or `position:absolute; width:1px` for visual hiding.

---

### NVDA (Windows)

**Setup**: Download from [nvaccess.org](https://www.nvaccess.org/), use with Firefox or Chrome.

**Test script — Task 1.2 (Grid)**:
1. Open demo page in Firefox.
2. Press `Tab` to reach the grid.
3. Verify: NVDA announces "Navigazione opera d'arte griglia".
4. Use `Ctrl+Alt+Arrow` (NVDA table navigation) — verify NVDA reads cell labels.
5. Press `ArrowRight` in application mode (`NVDA+Space` to toggle) — verify spatial navigation.

**Common NVDA pitfalls**:
- NVDA does not always follow the Grid Pattern with Arrow keys unless the user is in "Application Mode". Document this in the demo page with a visible hint.
- `aria-live` debounce must be ≥100ms or NVDA will drop rapid announcements.

---

### JAWS (Windows)

**Setup**: Trial available at [freedomscientific.com](https://www.freedomscientific.com/), use with Chrome.

**Test script — Task 1.4 (aria-live)**:
1. Navigate to a grid cell.
2. Simulate zoom change (scroll or pinch).
3. Verify: JAWS announces "Ingrandimento 2x. Area: Alto-Sinistra" without user action.

---

## Automated Accessibility Testing

### axe-core Integration (future)

```typescript
// example test (Vitest + jsdom + axe-core)
import { axe } from 'jest-axe'
import { A11yOverlay } from '../src/core/A11yOverlay'

test('overlay has no ARIA violations', async () => {
  const overlay = new A11yOverlay(document.body, { rows: 3, columns: 3 })
  overlay.render()
  const results = await axe(document.body)
  expect(results).toHaveNoViolations()
})
```

### Checklist per Pull Request

Before merging any PR that touches ARIA or DOM:

- [ ] `pnpm typecheck` passes
- [ ] New/changed public methods have `@accessibility` JSDoc block
- [ ] Tested manually with VoiceOver on Safari (macOS)
- [ ] `aria-label` strings tested with Italian locale (the primary target language)
- [ ] No `aria-hidden="true"` on focusable elements
- [ ] No `tabindex > 0` (use roving tabindex instead)
- [ ] `aria-live` region not cleared immediately after announcement

---

## AI Provider Documentation (Phase 3)

Each AI provider implementation must document:

```typescript
/**
 * @accessibility
 * AI-generated labels are injected into `aria-label` of grid cells.
 * Labels must be:
 * - In Italian (primary language) or the locale specified in SenseArtOptions.
 * - ≤ 80 characters (screen readers truncate longer labels in some modes).
 * - Descriptive without visual jargon (avoid "bright area", prefer "zona luminosa — probabile cielo").
 * - Reviewed for cultural sensitivity before use in public exhibitions.
 */
```
