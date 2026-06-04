# Dashboard Drag-to-Reorder Upgrade — Implementation Plan

**Goal:** Replace the fixed 3-column CSS Grid on the Dashboard tab with a drag-to-reorder widget grid whose positions persist in localStorage and that renders correctly on iPad Mini (744×1133, portrait).

**Primary success criterion:** On iPad Mini in portrait, the dashboard renders 2 balanced columns, every widget can be picked up via long-press and dropped to a new row, and refreshing the page restores the exact layout.

---

## 1. Layout System

### 1.1 Current state (what we're replacing)

`index.html:105-111`:

```css
main#dashboard {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: minmax(180px, auto);
  gap: var(--gap);
}
```

Spans are hard-coded as CSS classes on the `<section>` markup (`span-2`, `span-full`, see `index.html:136-137` and the dashboard markup at `index.html:658-674`). Order is the source order in HTML. There are 11 dashboard widgets: weather, forecast, system, skills, cron, analytics, monitor, projects, discord, github, sessions.

### 1.2 New model

Layout becomes **data**, not markup. A single source of truth lives in `js/lib/layout.js`:

```js
// Layout state — ordered list, span is per-widget data, not CSS class
[
  { id: 'widget-weather',  span: 1 },
  { id: 'widget-forecast', span: 1 },
  { id: 'widget-system',   span: 1 },
  { id: 'widget-cron',     span: 'full' },
  { id: 'widget-analytics',span: 2 },
  // ...
]
```

CSS Grid still does the visual placement, but we drive it with:

```css
main#dashboard {
  display: grid;
  grid-template-columns: repeat(var(--cols, 3), 1fr);
  grid-auto-rows: minmax(180px, auto);
  grid-auto-flow: row dense;   /* lets size-1 widgets backfill gaps */
  gap: var(--gap);
}
.card[data-span="2"]    { grid-column: span 2; }
.card[data-span="full"] { grid-column: 1 / -1; }
```

`--cols` is set inline on `main#dashboard` by `layout.js` based on container width (ResizeObserver):

| Container width      | `--cols` | Max span allowed |
|----------------------|----------|------------------|
| ≥ 1100 px            | 3        | full (= 3)       |
| 700 – 1099 px        | 2        | 2 (full clamps to 2) |
| < 700 px             | 1        | 1 (all clamp)    |

iPad Mini portrait (744 px viewport, ~712 px after 32 px side padding) lands in the 2-col bucket. **Auto-balance on resize**: when `--cols` drops, widgets keep their declared `span` but the renderer writes a `data-span` attribute clamped to the current column count, so a `span: 'full'` widget renders as `2` on iPad and `1` on phone without losing its declaration.

### 1.3 Drag-and-drop

Reuse the Kanban Pointer Events pattern (`js/widgets/kanban.js:212-355`). Grid version:

- **Drag handle:** the widget's `<h2>` header. `cursor: grab`. Long-press (500 ms, < 10 px move) on header starts drag; same gesture detection as Kanban (`kanban.js:294-328`).
- **Ghost:** clone of the card, follows pointer, `position: fixed`, slight rotation/scale (matches `.kb-ghost` at `index.html:507-522`).
- **Drop indicator:** a 4 px accent bar between cards. Computed by hit-testing the midpoint between each pair of cards in DOM order. Indicator placement is **linear in the source order list**, not 2D — dropping into the visual position of row 2 col 1 means "insert at index 3 of the ordered widget list," and CSS Grid then re-flows.
- **Drop:** mutate the ordered array, persist, re-apply DOM order via `appendChild` (which moves nodes without destroying them — **critical** so widget intervals and fetched state survive).

### 1.4 Why never destroy/recreate widget DOM

Every widget currently mounts once on page load (`js/app.js:51-87`). Some hold live state: weather polls every 30 min (`weather.js:64`), system widget polls every `livePollMs`, etc. If a reorder re-runs `innerHTML`, those mount functions would need to be re-called and intervals re-bound — easy to break, easy to leak. The plan therefore **moves existing `<section>` nodes in place** rather than re-rendering markup.

---

## 2. Framework Decision

### Recommendation: **Stay vanilla ES modules.** Strongly.

### Reasoning

| Factor                        | Vanilla (extend Kanban pattern)                  | React + dnd-kit                                  |
|-------------------------------|--------------------------------------------------|--------------------------------------------------|
| Lines of net new code         | ~300 (one new file: `layout.js`)                 | ~2000+ (rewrite all 11 widgets as components)    |
| Build tooling                 | None — current setup is `<script type="module">` | Vite/esbuild + JSX transform required            |
| Bundle size on iPad Mini      | +3-4 KB                                          | +50 KB (React) + ~30 KB (dnd-kit) gzipped        |
| Existing assets reused        | All widget code untouched                        | Every widget rewritten                           |
| Drag pattern already proven   | Yes — `kanban.js` ships and works                | No — would be new                                |
| Shared state surface area     | 3 localStorage keys (tab, theme, layout)         | Same 3 keys, wrapped in Context for no real gain |
| Risk to working widgets       | Zero (we don't touch them)                       | High — full rewrite                              |
| Time to working iPad Mini grid| ~1 working day                                   | ~1 working week minimum                          |

The "shared state" cited as a reason for React (tabs, theme, active widget config) is already solved cleanly in vanilla: each lives in a single localStorage key with a tiny module owning it (`theme.js`, the `setupTabs` closure in `app.js`). Context would replace 3 `localStorage.getItem` calls with a provider tree — that's not a win, that's ceremony.

dnd-kit is excellent, but the value it adds (keyboard a11y, touch sensors, accessibility announcements) can be matched with ~80 lines of vanilla we'll already write for the grid — we have a working reference in `kanban.js`.

**The one tradeoff being accepted:** vanilla means we own the drag-and-drop edge cases (auto-scroll while dragging near viewport edge, keyboard reorder for a11y). These are listed as explicit Phase 4 tasks below; if Phase 4 is descoped, the dashboard still works for touch and mouse.

---

## 3. Layout Persistence

### Storage

- **Key:** `cc.layout.v1` (matches existing convention: `cc.theme.v1`, `cc.activeTab.v1`, `cc.kanban.v1`).
- **Shape:**

```js
{
  version: 1,
  order: ['widget-weather', 'widget-forecast', /* ... */],
  spans: { 'widget-cron': 'full', 'widget-analytics': 2, 'widget-projects': 2, 'widget-github': 2 }
}
```

- Widgets not present in `spans` default to span 1.
- Widgets not present in `order` (e.g. added in a future release) get appended to the end on load.
- Widgets present in `order` but missing from the DOM (removed widget) get silently dropped — defensive against schema drift.

### Read/write flow

- `loadLayout()` runs **before** widgets mount. It reorders the `<section>` nodes inside `main#dashboard` to match `order`, sets `data-span` attributes, sets `--cols` based on the current container width. Only then does `app.js` call the `mount*` functions.
- `saveLayout()` runs after every successful drop, debounced 200 ms. Writes the current order (read from DOM) plus the in-memory `spans` map.
- Span changes (right-click → "wide / full / narrow", or a small `⤢` button in the header — Phase 3) update `spans` and call `saveLayout()`.

### Reset escape hatch

A single line in `layout.js` exports `resetLayout()` (delete the key, reload). Wire to a small "reset layout" button in the header next to the theme toggle. Saves us when localStorage gets into a bad state during development.

---

## 4. Implementation Phases

Effort estimates assume one engineer familiar with the codebase. Each phase ends with a commit and is independently shippable.

### Phase 1 — Data-driven layout (no drag yet) · **~3 hours**

**Goal:** Same visual result as today, but layout is driven by `layout.js` from data, not by HTML classes.

**Files:**
- Create: `js/lib/layout.js`
- Modify: `index.html` — remove `span-2`/`span-full` classes from dashboard `<section>` tags (lines 664-673); change `main#dashboard` CSS to use `var(--cols)` and `data-span` selectors.
- Modify: `js/app.js` — call `applyLayout()` before any `mount*()`.

**Tasks:**

1. Create `DEFAULT_LAYOUT` constant in `layout.js` that exactly reproduces today's order and spans:

```js
export const DEFAULT_LAYOUT = {
  version: 1,
  order: [
    'widget-weather', 'widget-forecast', 'widget-system', 'widget-skills',
    'widget-cron',
    'widget-analytics', 'widget-monitor',
    'widget-projects', 'widget-discord',
    'widget-github', 'widget-sessions',
  ],
  spans: {
    'widget-cron': 'full',
    'widget-analytics': 2,
    'widget-projects': 2,
    'widget-github': 2,
  },
};
```

2. Implement `loadLayout()` — read `cc.layout.v1`, fall back to `DEFAULT_LAYOUT`, merge defensively (unknown widgets appended, missing widgets dropped).

3. Implement `applyLayout(layout)`:
   - For each id in `layout.order`, find `document.getElementById(id)` and `dashboardEl.appendChild(node)` (this is a move, not a copy).
   - For each widget, set `node.dataset.span = clampSpan(layout.spans[id] ?? 1, currentCols)`.
   - Set `dashboardEl.style.setProperty('--cols', String(currentCols))`.

4. Implement `currentCols()` — reads `dashboardEl.clientWidth`, returns 3 / 2 / 1 per the table in §1.2.

5. Implement `watchResize()` — `ResizeObserver` on `main#dashboard` that re-runs `applyLayout` when the column count would change. Debounce 150 ms.

6. Update CSS in `index.html`:

```css
main#dashboard {
  display: grid;
  grid-template-columns: repeat(var(--cols, 3), 1fr);
  grid-auto-rows: minmax(180px, auto);
  grid-auto-flow: row dense;
  gap: var(--gap);
  padding: 8px 32px 24px;
}
.card[data-span="2"]    { grid-column: span 2; }
.card[data-span="full"] { grid-column: 1 / -1; }
```

Delete the now-unused `.span-2` and `.span-full` rules. Delete the `main#dashboard { grid-template-columns: repeat(2/1, 1fr) }` overrides in the `@media` blocks (lines 613, 618) — `--cols` handles it now.

7. Update `js/app.js` `init()`:

```js
import { loadLayout, applyLayout, watchResize } from './lib/layout.js';
// ...
const layout = loadLayout();
applyLayout(layout);
watchResize();
// ...then mountClock, mountWeather, etc., as before
```

8. **Test on iPad Mini before moving to Phase 2.** Goal: 2 balanced columns, every widget visible, no horizontal scroll. This is the primary success criterion — verifying it now means later phases can't regress it without us noticing.

**Commit:** `refactor(layout): drive dashboard grid from layout.js data instead of CSS classes`

---

### Phase 2 — Drag-to-reorder + persistence · **~5 hours**

**Goal:** Long-press any widget header to pick it up; drop it between any two widgets in any row; refresh restores position.

**Files:**
- Modify: `js/lib/layout.js`
- Modify: `index.html` — add `cursor: grab` to `.card h2`, add ghost/drop-indicator styles (copy from kanban patterns at lines 505-541).

**Tasks:**

1. Add a `bindDrag(dashboardEl)` function modeled directly on `bindCardInteractions` in `kanban.js:284-355`. Differences:
   - Listener target is `.card h2` (the header), not the whole card. Body of the card stays interactive (todos, buttons inside discord widget, etc.).
   - Drop targets are gaps **between** `<section>` nodes inside `main#dashboard`, plus a trailing gap after the last one.
   - On drop, mutate the in-memory layout's `order` array, call `applyLayout()` to move DOM nodes, and call `saveLayout()`.

2. Add styles in `index.html`:

```css
.card h2 { cursor: grab; user-select: none; -webkit-user-select: none; }
.card.cc-dragging { opacity: 0.3; }
.cc-ghost {
  position: fixed; pointer-events: none; z-index: 200;
  border-radius: var(--radius);
  background: rgba(0,255,208,0.06);
  border: 2px solid var(--accent);
  box-shadow: 0 12px 48px rgba(0,255,208,0.30);
  backdrop-filter: blur(20px) saturate(140%);
  transform: rotate(1deg) scale(1.02);
}
.cc-drop-indicator {
  height: 4px; border-radius: 2px;
  background: var(--accent); box-shadow: 0 0 12px var(--accent);
  grid-column: 1 / -1;     /* drop slot always spans full row in source order */
}
```

3. Implement `getDropIndex(x, y)`:
   - Iterate `dashboardEl.children` in DOM order.
   - For each card, compute its `getBoundingClientRect()`. The midpoint of the card on screen is the threshold: pointer above midpoint → drop *before* this card; below → after.
   - Reading **DOM order** (not visual order) is what makes "moving between rows" trivially correct: CSS Grid auto-flow handles the rest.

4. Implement `saveLayout()`: debounce 200 ms, read order from `[...dashboardEl.children].map(n => n.id)`, write `{ version: 1, order, spans }` to `cc.layout.v1`.

5. Add a small reset button in the header next to the theme toggle:

```html
<button class="theme-btn" id="layout-reset" title="reset layout">⟳</button>
```

Wire its click to `localStorage.removeItem('cc.layout.v1'); location.reload();`.

6. **Test on iPad Mini:** long-press a header, see ghost appear, drag across a row boundary, drop, see the card land in the new slot, refresh, see it stay.

**Commit:** `feat(layout): drag-to-reorder dashboard widgets with localStorage persistence`

---

### Phase 3 — Span control & polish · **~3 hours**

**Goal:** User can resize a widget between narrow / wide / full; widget intervals never duplicate; long-press conflicts with widget-internal long-press (none today) are eliminated.

**Tasks:**

1. Add a small `⤢` size button in each card header (rendered by `applyLayout` — append once per node, not by each widget). Click cycles span 1 → 2 → full → 1 (clamped to `currentCols`). Updates `layout.spans[id]`, calls `applyLayout` + `saveLayout`.

2. Audit widget intervals: confirm no widget calls `mount*` more than once. (Spot check: `weather.js:66`, `monitor.js`, `system.js` `refresh*`.) The data-driven layout moves nodes, never duplicates them — should be a no-op verification, but worth a 15-minute pass.

3. Edge cases:
   - Dragging a widget that was `span: 'full'` into a 2-col layout: the moved node keeps its `data-span` clamped — no overflow.
   - Dragging while a tab switch happens mid-gesture: tab switch hides `#dashboard` (`tab-panel` not active → `display: none`). Bind `pointercancel` to abort the drag cleanly (Kanban already models this at `kanban.js:341-348`).
   - Empty dashboard (defensive only — shouldn't happen): `applyLayout` no-ops.

4. Visual polish: when nothing is being dragged, the `⤢` button is hidden (`opacity: 0`) and only fades in on `:hover`/`:focus-within`, matching the kanban delete button pattern at `index.html:411-423`.

**Commit:** `feat(layout): per-widget span control + drag edge-case hardening`

---

### Phase 4 — A11y & auto-scroll (optional, descopable) · **~2 hours**

**Goal:** Keyboard reorder + auto-scroll when dragging near viewport edge. Not required for "grid works on iPad Mini" — listed so it's not forgotten.

**Tasks:**

1. Keyboard reorder: focused `.card h2` + `Alt+ArrowUp/Down/Left/Right` swaps with the neighbor in that direction (compute via DOM order + `currentCols`). Announce via an `aria-live="polite"` region.

2. Auto-scroll: during drag, if pointer is within 80 px of viewport top/bottom, `window.scrollBy(0, ±8)` per `requestAnimationFrame`. Stop when pointer leaves the zone or drag ends.

3. Reduce-motion respect: `@media (prefers-reduced-motion: reduce)` — drop the ghost rotation/scale.

**Commit:** `feat(layout): keyboard reorder, edge auto-scroll, reduced-motion`

---

## Total Estimate

| Phase | Hours | Cumulative |
|-------|-------|-----------|
| 1 — Data-driven layout       | 3 | 3  |
| 2 — Drag + persistence       | 5 | 8  |
| 3 — Span control + polish    | 3 | 11 |
| 4 — A11y + auto-scroll       | 2 | 13 |

**iPad Mini grid working** is achieved at the end of Phase 2 (~8 hours / 1 working day). Phase 3 makes it feel finished; Phase 4 is nice-to-have.

---

## Files Touched Summary

- **Create:** `js/lib/layout.js` (single new module — ~300 LOC)
- **Modify:** `index.html` (CSS replacement in dashboard grid section + 4 small style additions; remove `span-2`/`span-full` from 4 `<section>` tags; add reset button)
- **Modify:** `js/app.js` (3 added lines in `init()`)
- **Untouched:** every widget under `js/widgets/`. Zero risk to working widgets.
