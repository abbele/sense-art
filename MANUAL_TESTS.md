# SenseArt — Manual Browser Test Guide

Covers all implemented features in **Phase 1** (Navigation) and **Phase 2** (Sonification).
Each test specifies exact steps and the exact expected outcome.

---

## Prerequisites

```bash
pnpm install
pnpm build
pnpm dev:osd
```

Open **Chrome** at `http://localhost:5173`.
Open **DevTools** (`Cmd+Option+I` on macOS) — keep the **Console** and **Elements** tabs accessible.

> **macOS note:** `Alt` = `Option` (⌥). Throughout this guide, `Alt+A` means **⌥A**.

---

## T01 — OSD Viewer Renders

**Goal:** confirm the gigapixel image loads and basic OSD controls are present.

1. Open `http://localhost:5173`.
2. Wait 2–3 seconds for tiles to load.

**Expected:**
- The page shows a dark header with title "SenseArt — Demo OpenSeadragon".
- A green hint bar below the header shows keyboard instructions.
- The viewer area renders *La Ronda di Notte* (Rembrandt, 1642).
- OSD toolbar is visible (zoom in/out buttons, home button, full-page button) with icons.
- The navigator mini-map appears in the bottom-right corner showing the full composition.
- Footer reads: *La Ronda di Notte, Rembrandt van Rijn, 1642*.
- Console: **zero errors**.

---

## T02 — SenseArt Layer Activation (Alt+A)

**Goal:** toggle the accessibility overlay on and off.

1. Click anywhere inside the viewer to give it focus.
2. Press **Alt+A**.

**Expected (activation):**
- The grid overlay appears: 9 transparent cells (3×3) covering the entire canvas.
- Each cell has a visible blue focus ring when focused (first cell top-left starts with focus).
- If a screen reader is running: announces *"Layer accessibilità attivato. Usa le frecce per navigare l'opera."*
- Console: `senseArt` object shows `enabled = true` when inspected via `window.senseArt`.

3. Press **Alt+A** again.

**Expected (deactivation):**
- The grid overlay becomes non-interactive (cells lose focus, no blue rings).
- If a screen reader is running: announces *"Layer accessibilità disattivato."*

---

## T03 — ARIA DOM Structure

**Goal:** confirm the WAI-ARIA 1.2 Grid Pattern is correctly injected.

1. Activate SenseArt with **Alt+A**.
2. Open DevTools → **Elements** tab.
3. Inspect the OSD container element (`#osd`).

**Expected DOM structure:**
```
div[role="grid"][aria-rowcount="3"][aria-colcount="3"]
  └── div[role="row"][style="display:contents"]   (×3 — one per row)
        └── button[role="gridcell"][aria-rowindex][aria-colindex]  (×3 per row)
```

- The `role="grid"` element is a direct child of the OSD container.
- Exactly 3 `role="row"` wrappers exist, each with `style="display:contents"`.
- Exactly 9 `role="gridcell"` buttons exist total (3 per row).
- Cell (0,0): `tabindex="0"`, all others: `tabindex="-1"`.
- Cell (0,0): `aria-current="true"`, all others: no `aria-current`.
- Each cell has an `aria-label` with text like `"Regione alto-sinistra. Zoom …"`.

---

## T04 — Arrow Key Navigation

**Goal:** move the focused cell with arrow keys; OSD pans/zooms to each region.

1. Activate SenseArt with **Alt+A**. Focus is on cell (0,0) — top-left.
2. Press **→** (ArrowRight).

**Expected:**
- Focus moves to cell (0,1) — top-center.
- OSD viewport pans and zooms to the top-center region of the painting.
- `aria-current="true"` moves to cell (0,1).
- `tabindex="0"` moves to cell (0,1), all others become `tabindex="-1"`.
- ARIA live region announces: *"Riga 1, Colonna 2 — alto-centro"* (1-based).

3. Press **→** again → focus moves to cell (0,2) — top-right.
4. Press **→** again → **column wrap-around**: focus moves to cell (0,0) — top-left.
5. Press **↓** → focus moves to cell (1,0) — middle-left.
6. Press **↓** twice more → **row wrap-around**: focus returns to cell (0,0).
7. Press **←** → focus moves to cell (0,2) — wrap to last column.
8. Press **↑** → focus moves to cell (2,2) — wrap to last row.

---

## T05 — Tab / Shift+Tab Linear Cycle

**Goal:** cycle through all 9 cells linearly with Tab.

1. Activate SenseArt with **Alt+A**. Focus on cell (0,0).
2. Press **Tab** 8 times.

**Expected:**
- Focus visits cells in order: (0,0) → (0,1) → (0,2) → (1,0) → (1,1) → (1,2) → (2,0) → (2,1) → (2,2).
- Each Tab moves OSD viewport to the corresponding region.
- After cell (2,2), pressing **Tab** wraps back to cell (0,0).

3. With focus on (0,0), press **Shift+Tab**.

**Expected:**
- Focus wraps to cell (2,2) — the last cell.

---

## T06 — Escape — Reset Zoom

**Goal:** Escape resets the viewport to full image and returns focus to cell (0,0).

1. Navigate to any non-corner cell (e.g. press → → ↓ to reach cell (1,1) — center).
2. OSD has zoomed into the center area.
3. Press **Escape**.

**Expected:**
- OSD viewport calls `goHome()` — the full painting is visible, no zoom.
- Focus moves to cell (0,0).
- ARIA live region announces: *"Zoom reimpostato. Vista completa dell'opera."*

---

## T07 — Enter / Space — Explicit Zoom Intent

**Goal:** pressing Enter or Space on the current cell re-fires `fitBounds()` on that cell.

1. Navigate to cell (2,2) — bottom-right.
2. OSD has already panned/zoomed to that corner.
3. Zoom out manually with the OSD `-` button or scroll out.
4. Press **Enter**.

**Expected:**
- OSD re-zooms into the bottom-right region even though focus was already there.
- `aria-current` stays on (2,2).
- ARIA live region announces the cell again.

5. Repeat step 4 with **Space** — same behavior.

---

## T08 — ARIA Live Announcements (screen reader or DOM inspection)

**Goal:** verify that the live region is updated with correct text on every navigation event.

### Without a screen reader (DOM inspection):

1. Activate SenseArt.
2. In DevTools → Elements, find the `aria-live` region:
   - It is a visually hidden `<div>` appended to `<body>` with attributes:
     `aria-live="polite"`, `aria-atomic="true"`, `aria-relevant="text"`.
   - Dimensions: `1px × 1px`, `position:absolute`, `clip: rect(0,0,0,0)`.
3. Navigate with arrow keys.

**Expected:** the `aria-live` div updates its text content with each key press:
- On cell focus: *"Riga {r}, Colonna {c} — {region}"*
- On Escape: *"Zoom reimpostato. Vista completa dell'opera."*
- On activation: *"Layer accessibilità attivato. Usa le frecce per navigare l'opera."*
- On deactivation: *"Layer accessibilità disattivato."*

### With macOS VoiceOver:

1. Press **Cmd+F5** to start VoiceOver.
2. Open `http://localhost:5173`.
3. Press **Alt+A**.
4. VoiceOver speaks: *"Layer accessibilità attivato. Usa le frecce per navigare l'opera."*
5. Press **→** — VoiceOver speaks: *"Riga 1, Colonna 2 — alto-centro"*.
6. Press **Escape** — VoiceOver speaks: *"Zoom reimpostato. Vista completa dell'opera."*

---

## T09 — setGrid() Runtime Grid Resize

**Goal:** switch from 3×3 to 5×5 at runtime without remounting.

1. Activate SenseArt with **Alt+A**.
2. Open DevTools → Console.
3. Run:
   ```javascript
   window.senseArt.setGrid({ rows: 5, columns: 5 })
   ```

**Expected:**
- The overlay rebuilds: 25 cells (5×5) replace the original 9 cells.
- In Elements tab: `aria-rowcount="5"` and `aria-colcount="5"` on the grid root.
- Focus returns to cell (0,0).
- Arrow keys now cycle within a 5×5 space (5 columns before wrapping).
- SenseArt remains in the enabled/disabled state it was in before the call.

4. Run:
   ```javascript
   window.senseArt.setGrid({ rows: 3, columns: 3 })
   ```
**Expected:** grid returns to 3×3.

---

## T10 — Programmatic API (Console)

**Goal:** verify the public API works from the browser console.

1. Open DevTools → Console.
2. Run each command and confirm the expected result:

```javascript
// Check the instance is exposed
window.senseArt                    // → SenseArtViewer instance (not undefined)

// Deactivate (if active)
window.senseArt.disable()          // → overlay becomes non-interactive; "disattivato" announced

// Re-activate
window.senseArt.enable()           // → overlay activates; "attivato" announced

// Toggle
window.senseArt.toggle()           // → flips state; appropriate message announced

// Full teardown
window.senseArt.unmount()          // → no overlay in DOM, no aria-live region in body
document.querySelector('[role="grid"]')  // → null

// Re-mount
window.senseArt.mount()            // → overlay reappears; Alt+A works again
```

---

## T11 — Sonification (Phase 2)

**Goal:** verify that audio plays when navigating cells (requires `sonification.enabled: true`).

> The demo is configured with `sonification: { enabled: true }`.
> Web Audio requires a user gesture — audio starts on the **first Alt+A** press.

1. Ensure your system volume is audible.
2. Press **Alt+A** to activate.

**Expected on activation:**
- No audio yet (audio context is started but no cell has been focused).

3. Press **→**.

**Expected on each cell focus:**
- A short tone plays (Tone.js synth — default duration ~800ms).
- The pitch varies by cell: cells over bright/light areas of the painting produce higher tones; dark areas produce lower tones.
- The filter cutoff varies: saturated color areas sound brighter/open; desaturated areas sound more muffled.

4. Navigate rapidly through several cells with arrow keys.

**Expected:**
- Each new cell triggers a new tone; rapid navigation debounces audio (tones don't stack excessively).
- No console errors from Web Audio / Tone.js.

5. Press **Alt+A** to deactivate.

**Expected:**
- Audio stops immediately.
- No lingering tones.

---

## T12 — ResizeObserver — Cell Labels on Resize

**Goal:** verify that cell labels update when the browser window is resized.

1. Activate SenseArt with **Alt+A**.
2. In DevTools → Elements, read the `aria-label` of cell (0,0) — note the zoom value.
3. Resize the browser window (drag it wider or narrower).

**Expected:**
- The zoom value in the `aria-label` of each cell updates to reflect the new viewport zoom ratio.
- No errors in console.

---

## T13 — No Regressions in OSD Interaction

**Goal:** confirm SenseArt does not interfere with OSD's native interactions.

1. Deactivate SenseArt with **Alt+A** (if active).
2. Use the mouse to pan the image — click and drag.
3. Scroll to zoom in/out.
4. Use the OSD zoom-in (+) and zoom-out (−) buttons.
5. Click the OSD home (⊙) button.
6. Click the full-page button.

**Expected:**
- All OSD interactions work normally.
- The ARIA overlay cells are visible but `pointer-events: none` — mouse passes through to OSD.
- The overlay cells do NOT intercept any mouse events.

---

## Checklist Summary

| Test | Feature | Status |
|------|---------|--------|
| T01 | OSD renders with image and controls | |
| T02 | Alt+A toggles SenseArt on/off | |
| T03 | WAI-ARIA 1.2 Grid DOM structure | |
| T04 | Arrow key navigation + wrap-around | |
| T05 | Tab / Shift+Tab linear cycle + wrap | |
| T06 | Escape resets zoom | |
| T07 | Enter / Space explicit zoom | |
| T08 | ARIA live region announcements | |
| T09 | setGrid() runtime resize | |
| T10 | Programmatic API (console) | |
| T11 | Sonification — tone on cell focus | |
| T12 | ResizeObserver — label sync on resize | |
| T13 | No OSD regressions when deactivated | |
