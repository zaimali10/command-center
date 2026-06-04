# Dashboard Refactor Specification

Six refactors to a React + Vite + dnd-kit dashboard (14 widgets across 5 tabs: Dashboard, To-Do, Kanban, Grocery, Queue).

---

## 1. usePollingFetch Hook

### 1.1 File path and exports

- **File:** `src/hooks/usePollingFetch.js`
- **Default export:** `usePollingFetch`
- **Named export:** `usePollingFetch` (also)

### 1.2 Function signatures / interfaces

```ts
type PollingOptions<T, R = T> = {
  transform?: (raw: T) => R;        // applied to parsed JSON before storing
  retry?: number;                    // default: 2
  onError?: (err: Error) => void;    // user-supplied error sink
  enabled?: boolean;                 // default: true; gates polling
  deps?: any[];                      // extra reset deps, default: []
};

type PollingResult<R> = {
  data: R | null;
  error: Error | null;
  isLoading: boolean;       // true ONLY before first successful/failed response
  isRefreshing: boolean;    // true for any fetch after the first
  lastUpdated: number | null; // Date.now() of last successful response
  refetch: () => Promise<void>;
};

function usePollingFetch<T, R = T>(
  url: string,
  interval: number,
  options?: PollingOptions<T, R>
): PollingResult<R>;
```

### 1.3 Key implementation details

- Internal state: `data`, `error`, `isLoading` (init `true`), `isRefreshing` (init `false`), `lastUpdated`.
- Refs: `inFlightRef` (AbortController | null), `mountedRef` (bool), `timerRef` (setTimeout id), `firstLoadDoneRef` (bool).
- `doFetch()` workflow:
  1. If `inFlightRef.current` exists → **deduplicate**, return early (do not start a new fetch).
  2. If `document.hidden` → skip silently, do not touch state, reschedule.
  3. Set `isRefreshing = true` if `firstLoadDoneRef.current`, else leave `isLoading = true`.
  4. Create `AbortController`, store in `inFlightRef`.
  5. `fetch(url, { signal })` with retry loop up to `retry` attempts (exponential backoff: 500ms × 2^n, capped at 5s). Retries do NOT count as separate "fetches" for the dedup flag.
  6. Parse JSON. Apply `transform` if present.
  7. On success: `setData(result)`, clear `error`, set `lastUpdated = Date.now()`.
  8. On terminal failure (retries exhausted): set `error`, **do not clear `data`** (keep stale value), call `onError(err)` if provided.
  9. Always: clear `inFlightRef`, set `isLoading = false`, `isRefreshing = false`, mark `firstLoadDoneRef.current = true`.
- Scheduling: after each `doFetch` completes (success or failure), schedule next via `setTimeout(doFetch, interval)`. Do not use `setInterval` — drift + overlap risk.
- Visibility: listen on `document.visibilitychange`. When tab becomes visible after a skipped tick, trigger an immediate `doFetch`.
- Cleanup (`useEffect` return):
  - Set `mountedRef.current = false`.
  - `clearTimeout(timerRef.current)`.
  - `inFlightRef.current?.abort()`.
  - Remove visibilitychange listener.
- All `setState` calls guarded by `mountedRef.current` check.
- `refetch` is a stable callback (useCallback). Cancels in-flight if any, then runs `doFetch` immediately, resets the polling timer.
- Reset on `[url, interval, enabled, ...deps]` change: abort in-flight, clear timer, reset `firstLoadDoneRef`, restart.

### 1.4 Edge cases

- `enabled === false`: no fetch on mount, no timer scheduled. If toggled to `true`, run a fresh fetch and start polling.
- `url` change mid-flight: abort in-flight; do not apply its result.
- `interval <= 0`: fetch once, do not reschedule.
- Server returns non-2xx: treat as error (retry path).
- JSON parse failure: treat as error (retry path).
- `transform` throws: treat as error (no retry — transform is deterministic).
- Component unmounts during retry backoff: clear backoff timer, abort.
- Two `refetch()` calls in same tick: second one is a no-op (dedup).
- Tab hidden for long periods: no fetches accumulate; on visible, exactly one fetch fires.

### 1.5 Migration steps

1. Create `src/hooks/usePollingFetch.js`.
2. Unit-test with mocked `fetch` + `vi.useFakeTimers()`: success, retry, abort on unmount, visibility skip, dedup.
3. Migrate `src/components/widgets/Weather.jsx` — 30s poll. Replace `useEffect + fetch + setInterval` block; pass existing parse fn as `transform`.
4. Migrate `src/components/widgets/Monitor.jsx` — 30s poll.
5. Migrate `src/components/widgets/WorkQueue.jsx` — currently 3 polls; replace each with its own `usePollingFetch` call, or consolidate into one hook returning a derived object via `transform` (preferred if endpoints share rate).
6. Migrate `src/components/widgets/GatewayStatus.jsx`.
7. Each migration: replace local `loading` with `isLoading || (isRefreshing && !data)` if the UI needs the "first time" skeleton; otherwise just `isLoading`.
8. Verify each widget: stale data persists across error; tab-hide stops network calls; unmount stops all activity.

---

## 2. Kanban Migration to dnd-kit

### 2.1 File path and exports

- **File:** `src/components/widgets/Kanban.jsx` (rewrite of drag layer)
- **Default export:** `Kanban` (unchanged)
- **New internal components:** `KanbanColumn`, `KanbanCard`, `KanbanCardOverlay`

### 2.2 Function signatures / interfaces

```ts
type Card = {
  id: string;
  created: number;
  order: number;
  column: string;      // column id
  title: string;
  description?: string;
  tags?: string[];
  due?: string | null;
};

type ColumnDef = { id: string; title: string };

function Kanban(): JSX.Element;

function KanbanColumn(props: {
  column: ColumnDef;
  cards: Card[];                  // already sorted by order
  onEditCard: (id: string) => void;
}): JSX.Element;

function KanbanCard(props: {
  card: Card;
  onEdit: (id: string) => void;
}): JSX.Element;

function KanbanCardOverlay(props: { card: Card }): JSX.Element;
```

### 2.3 Key implementation details

- Dependencies to add: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- **Remove entirely** from current `Kanban.jsx`:
  - `onPointerDown`, `onPointerMove`, `onPointerUp` handlers.
  - `getDropTarget()` geometry helper.
  - All `getBoundingClientRect()` and `querySelector()` calls used for drag.
  - `activeDrag` state object.
  - Custom keyboard handlers for `e`, `E`, `Delete`, `Enter` (dnd-kit's KeyboardSensor + sortable presets cover keyboard reordering; explicit edit/delete keys are out of scope of the drag refactor — if retained, move them to a non-drag keydown handler at the card level only when focused).
- **Add:**
  - `DndContext` at the Kanban root with `sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`.
  - `collisionDetection={closestCorners}`.
  - One `SortableContext` per column, `items={cardsInColumn.map(c => c.id)}`, `strategy={verticalListSortingStrategy}`.
  - `useDroppable({ id: column.id })` inside `KanbanColumn` so empty columns still accept drops.
  - `useSortable({ id: card.id, data: { column: card.column } })` inside `KanbanCard`.
  - `DragOverlay` at the root rendering `<KanbanCardOverlay card={activeCard} />` while `activeId != null`.
- State:
  - `cards: Card[]` (single flat list, source of truth).
  - `activeId: string | null` (the dragging card id).
- Handlers:
  - `onDragStart({ active })` → `setActiveId(active.id)`.
  - `onDragOver({ active, over })` → if hovering over a different column's droppable (not another card), optimistically move the card's `column` field for live visual feedback. Coalesce — skip if `over` is `null` or already in target column.
  - `onDragEnd({ active, over })`:
    - Clear `activeId`.
    - If `over == null` → no-op.
    - Resolve `sourceColumn` from active card's current column, `targetColumn` from `over.data.current?.sortable?.containerId ?? over.id`.
    - **Same column:** find old/new indices within that column's filtered list → `arrayMove(columnCards, oldIndex, newIndex)` → reassign `order` sequentially within that column → write back into flat list.
    - **Different column:** splice card out of source list, set `card.column = targetColumn`, insert at target index (or end if dropped on column itself), reassign `order` on both affected columns.
  - `onDragCancel()` → clear `activeId`, revert any optimistic column change made in `onDragOver` (snapshot `cards` at drag start, restore).
- `cardsByColumn = useMemo(() => groupBy(cards, 'column'), [cards])`; within each group sort by `order`.
- Persistence via storage service (see §3): `useEffect(() => storage.set('kanban_cards', cards), [cards])`. Replace any current direct `localStorage` writes.
- Keep `CardEditor` modal form, `columns` config object, and existing card shape — no schema change.
- Accessibility: dnd-kit provides default announcements; supply a `screenReaderInstructions` prop if a custom message is needed.

### 2.4 Edge cases

- Dropping a card on itself → no-op (same id, same index).
- Dropping into an empty column → `over.id === column.id`; insert at index 0.
- Drag canceled by Esc → onDragCancel fires; revert.
- Rapid drag across columns → onDragOver may fire many times; only act on column change, never per-pixel.
- Card edited mid-drag (shouldn't happen but defensively): editor modal blocks pointer; if it opens during drag, dndkit will cancel on focus shift.
- Touch on iOS: 180ms delay prevents conflict with scroll; tolerance 8px allows micro-jitter.
- Reordering when `order` values collide: after every drag end, normalize `order` to `0..n-1` within each column.
- Large lists: `useSortable` is O(n) per render; acceptable at expected card counts (< 200).
- localStorage write throttle: not needed at this scale; storage service handles JSON errors.

### 2.5 Migration steps

1. `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`.
2. Branch the existing `Kanban.jsx`; preserve `CardEditor`, `columns`, and the card shape verbatim.
3. Build `KanbanCard` with `useSortable`; render style via `transform` + `transition` from the hook.
4. Build `KanbanColumn` with `useDroppable` and `SortableContext`.
5. Wrap board in `DndContext` with sensors + collision detection.
6. Implement `onDragStart` / `onDragOver` / `onDragEnd` / `onDragCancel`.
7. Add `DragOverlay` with `KanbanCardOverlay` (visually identical to card with `opacity: 0.85` and elevated shadow).
8. Remove all `onPointer*`, `activeDrag`, and geometry helpers.
9. Swap `localStorage.setItem/getItem` for `storage.get/set` (§3).
10. Manual QA: same-column reorder, cross-column move, drop on empty column, keyboard reorder (Tab to focus, Space to pick up, arrows, Space to drop), touch drag on a tablet.
11. Delete dead keyboard shortcut code (`e`, `E`, `Delete`, `Enter`) unless explicitly re-scoped as card actions.

---

## 3. Storage Service

### 3.1 File path and exports

- **File:** `src/services/storage.js`
- **Named export:** `storage`
- **Named export:** `STORAGE_PREFIX = 'cc_'`
- **Named export:** `CURRENT_SCHEMA_VERSION` (integer)
- **Named export:** `runMigrations` (called once at app boot)

### 3.2 Function signatures / interfaces

```ts
interface Storage {
  get<T>(key: string, defaultValue: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;                       // removes only cc_ prefixed keys
  keys(): string[];                    // un-prefixed keys present
}

type Migration = {
  version: number;                     // target version this migration produces
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>;
};

const MIGRATIONS: Migration[];         // sorted ascending by version
function runMigrations(): void;        // called once on module import / app boot
```

### 3.3 Key implementation details

- `prefixed(key)` → `${STORAGE_PREFIX}${key}`. All public methods use this; consumers pass un-prefixed keys.
- `get(key, defaultValue)`:
  1. `raw = localStorage.getItem(prefixed(key))`.
  2. If `raw == null` → return `defaultValue`.
  3. `try { return JSON.parse(raw); } catch { console.warn('[storage] corrupt key', key); return defaultValue; }`.
- `set(key, value)`:
  1. `try { localStorage.setItem(prefixed(key), JSON.stringify(value)); } catch (e) { console.warn('[storage] write failed', key, e); }`.
  2. Handles quota errors and JSON cycles gracefully (no throw).
- `remove(key)`: `localStorage.removeItem(prefixed(key))`.
- `clear()`: iterate `Object.keys(localStorage)`, remove every key starting with `STORAGE_PREFIX`. Do not touch other apps' keys.
- `keys()`: same iteration, return un-prefixed names.
- **Schema versioning:**
  - Key `cc_schema_version` stores integer.
  - On module load, call `runMigrations()`:
    1. Read current version (default `0`).
    2. For each migration in `MIGRATIONS` with `version > current`, apply it.
    3. Migrations operate on a snapshot map of all `cc_`-prefixed keys (un-prefixed) → values, returning a new map; the service diff-writes results back.
    4. After all migrations succeed, write new `cc_schema_version`.
    5. Wrap each migration in try/catch; on failure, log and stop — do **not** advance the version (data preserved for manual recovery).
- `runMigrations` is idempotent and safe to call on every boot.

### 3.4 Edge cases

- `localStorage` unavailable (private mode / SSR / disabled): wrap access in try/catch and fall back to an in-memory `Map` shim assigned to `globalThis.__ccMemStorage`. Same API.
- Existing un-prefixed keys from before this refactor: a v1 migration moves known legacy keys into `cc_`-prefixed form, then deletes the originals. Unknown un-prefixed keys are left alone.
- Concurrent writes from multiple tabs: last write wins (acceptable); optional `storage` event subscription is out of scope.
- Very large values (> 5MB): `set` will catch QuotaExceededError, warn, and not throw.
- Corrupt JSON: `get` warns and returns default; consumer never sees a crash.
- Schema version regression (downgrade): if stored version > `CURRENT_SCHEMA_VERSION`, warn but do not migrate; treat as forward-compatible read.

### 3.5 Migration steps

1. Create `src/services/storage.js` with the API above.
2. Add v1 migration: rename existing un-prefixed keys (`layout`, `kanban_cards`, `todos`, `grocery_items`, `theme`, etc.) to `cc_layout`, `cc_kanban_cards`, etc.
3. Call `runMigrations()` from `src/main.jsx` before `ReactDOM.createRoot`.
4. Migrate consumers:
   - `src/context/LayoutContext.jsx` → replace `localStorage.getItem('layout')` with `storage.get('layout', defaultLayout)`; replace writes with `storage.set`.
   - `src/components/widgets/Kanban.jsx` → `storage.get('kanban_cards', [])` / `storage.set('kanban_cards', cards)`.
   - `src/components/widgets/Todo.jsx` → `storage.get('todos', [])` / `storage.set('todos', todos)`.
   - `src/components/widgets/Grocery.jsx` → same pattern (`grocery_items`).
   - `src/context/ThemeContext.jsx` → `storage.get('theme', 'dark')` / `storage.set('theme', theme)`.
5. Grep for remaining `localStorage.` references — should be zero in `src/` outside `services/storage.js`. Add an ESLint `no-restricted-globals` rule for `localStorage` excluding that file (optional but recommended).
6. Verify migration: clear browser storage, load app with legacy keys preinjected, confirm rename, confirm `cc_schema_version` written.

---

## 4. Widget Registry

### 4.1 File path and exports

- **File:** `src/registry.js`
- **Named export:** `WIDGETS` (array)
- **Named export:** `getComponents()` (function returning record)
- **Named export:** `getTitles()` (function returning record)
- **Named export:** `getWidget(id)` (convenience lookup)

### 4.2 Function signatures / interfaces

```ts
type WidgetSize = { w: number; h: number };     // grid units, matching current layout
type WidgetPosition = { x: number; y: number; tab: string };

interface WidgetEntry {
  id: string;                                    // stable, matches existing layout keys
  component: React.ComponentType<any>;
  title: string;
  defaultPosition: WidgetPosition;
  defaultSize: WidgetSize;
}

export const WIDGETS: WidgetEntry[];
export function getComponents(): Record<string, React.ComponentType<any>>;
export function getTitles(): Record<string, string>;
export function getWidget(id: string): WidgetEntry | undefined;
```

### 4.3 Key implementation details

- Import all 14 widget components at the top of `registry.js`. No dynamic imports — Vite handles tree-shaking; widgets are part of the initial bundle today.
- `WIDGETS` is a plain `const` array; declaration order is the canonical render order for new layouts.
- `getComponents()` / `getTitles()` are derived once with module-scope memoization: compute on first call, cache the result.
- Widget ids must match the **existing** keys already in `cc_layout` localStorage to preserve user layouts (backward compatible with existing localStorage layout data format).
- `defaultPosition.tab` values must match the 5 existing tab ids (Dashboard, To-Do, Kanban, Grocery, Queue) verbatim.
- `defaultSize` units must match the existing grid system unchanged.

### 4.4 Edge cases

- Layout in localStorage references an unknown widget id: `Dashboard.jsx` filters it out + logs a warning; user's other widgets render normally.
- Registry adds a widget not present in saved layout: insert it at its `defaultPosition` on next render and persist.
- Duplicate ids in `WIDGETS`: throw at module load (developer error).
- Widget component missing default export: throw at module load.
- Title collision: allowed; titles are display strings only, ids are the key.

### 4.5 Migration steps

1. Create `src/registry.js`. Move every entry from `WIDGET_COMPONENTS` and `TITLE_MAP` in `Dashboard.jsx` into a single `WIDGETS` array, filling `defaultPosition` and `defaultSize` from current defaults.
2. In `Dashboard.jsx`, replace `WIDGET_COMPONENTS` and `TITLE_MAP` usages with `getComponents()` / `getTitles()`.
3. Remove the now-dead `WIDGET_COMPONENTS` and `TITLE_MAP` constants from `Dashboard.jsx`.
4. Add a layout-reconciliation pass on mount: drop entries with unknown ids, append missing-but-registered widgets with their `defaultPosition`.
5. Verify: an existing user with a saved layout sees their widgets unchanged; a fresh user gets all 14 widgets at their default positions.

---

## 5. Error Boundaries

### 5.1 File path and exports

- **File:** `src/components/ErrorBoundary.jsx`
- **Default export:** `ErrorBoundary` (class component)

### 5.2 Function signatures / interfaces

```ts
interface ErrorBoundaryProps {
  name: string;                         // widget display name for the fallback UI
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState>;
  componentDidCatch(error: Error, info: React.ErrorInfo): void;
  handleRetry = (): void;
  render(): React.ReactNode;
}
```

### 5.3 Key implementation details

- Initial state: `{ hasError: false, error: null }`.
- `static getDerivedStateFromError(error)` returns `{ hasError: true, error }`.
- `componentDidCatch(error, info)` calls `console.error('[ErrorBoundary]', this.props.name, error, info?.componentStack)`.
- `handleRetry` arrow-bound class field: `this.setState({ hasError: false, error: null })`. Resets the boundary; child remounts and re-runs.
- `render()`:
  - If `!hasError` → `this.props.children`.
  - Else → a fallback card:
    ```jsx
    <div className="widget-error" role="alert">
      <h3 className="widget-error__title">{this.props.name} failed to load</h3>
      <p className="widget-error__message">{error?.message ?? 'Unknown error'}</p>
      <button className="widget-error__retry" onClick={this.handleRetry}>Retry</button>
    </div>
    ```
- Class component is **required** — function components cannot define `getDerivedStateFromError` / `componentDidCatch`.

### 5.4 Edge cases

- Error thrown during `handleRetry`'s re-render: boundary catches again, stays in error state with new error.
- Error in async code (fetch, setTimeout) inside a widget: **not caught** by error boundary. Such code must surface errors via state to be caught on the next render — document this at the top of the file.
- Error in event handler: not caught; React error boundaries only catch render-phase, lifecycle, and constructor errors.
- Error thrown by `ErrorBoundary` itself during fallback render: would unmount the dashboard. Keep the fallback JSX trivially safe (no derived data, no widget code).
- Multiple widget failures simultaneously: each boundary is independent; one fallback per failed widget; the rest of the dashboard renders normally.
- `error.message` missing/null: fall back to `'Unknown error'`.

### 5.5 Migration steps

1. Create `src/components/ErrorBoundary.jsx`.
2. Add `.widget-error` styles to `styles.css` under the WIDGETS section (subdued card, red accent border, sized to fit grid cell).
3. In `Dashboard.jsx`, wrap each rendered widget:
   ```jsx
   <ErrorBoundary name={titles[id]}>
     <Widget {...props} />
   </ErrorBoundary>
   ```
4. Smoke-test by temporarily throwing in one widget's render: confirm only that widget shows the fallback, others remain interactive, Retry restores the widget once the throw is removed.
5. Confirm `console.error` output includes the widget name and component stack.

---

## 6. Smaller Fixes

### 6.1 Clock (App.jsx)

**File:** `src/App.jsx`

- Move `DAYS = ['Sun', ...]` and `MONTHS = ['Jan', ...]` arrays to module scope (above the component) — currently re-allocated every render.
- Split into two `useEffect` timers:
  - **Seconds tick:** `setInterval(() => setNow(new Date()), 1000)` for the time display.
  - **Date tick:** `setInterval(() => setToday(...), 60_000)` for day/date display.
- Cleanup: clear both intervals in each effect's return.

### 6.2 resetLayout (LayoutContext.jsx)

**File:** `src/context/LayoutContext.jsx`

- New behavior of `resetLayout`:
  1. `storage.clear()` — wipes all `cc_`-prefixed keys (uses the storage service from §3).
  2. Reset every piece of React state owned by the layout context (`layout`, `activeTab`, any pinned widget state) to its initial constant.
  3. **Do NOT** call `window.location.reload()`.
- The dashboard re-renders with default layout because state changed, not because the page reloaded.
- If other contexts (theme, kanban, todo, grocery) hold in-memory state after a wipe, expose a `reset()` from each and call them in sequence from `resetLayout`. Simplest alternative: bump a `resetCounter` and apply `key={resetCounter}` to the dashboard root so consumers remount and reread storage defaults.

### 6.3 CSS organization (styles.css)

**File:** `src/styles.css`

- Reorder file top-to-bottom with explicit section banners:
  ```css
  /* =====================================================
     :ROOT VARIABLES
     ===================================================== */
  :root { ... }
  [data-theme="dark"] { ... }
  [data-theme="midnight"] { ... }
  [data-theme="light"] { ... }

  /* =====================================================
     THEME
     ===================================================== */
  /* body, base typography, theme-driven element defaults */

  /* =====================================================
     LAYOUT
     ===================================================== */
  /* app shell, tabs, grid */

  /* =====================================================
     WIDGETS
     ===================================================== */
  /* per-widget rules, .widget-error fallback */

  /* =====================================================
     RESPONSIVE
     ===================================================== */
  /* @media queries */
  ```
- Move `:root` variable blocks to the very top.
- No rule-level changes — pure reorganization with comments. Diff should be reorder + comments only.

### 6.4 Light theme

**Files:** `src/styles.css`, `src/context/ThemeContext.jsx`

- Add `[data-theme="light"]` block with a distinct palette:
  - Background: `#f7f7f8` (page), `#ffffff` (cards).
  - Text: `#1a1a1f` (primary), `#4a4a52` (secondary).
  - Border: `#e3e3e8`.
  - Accent: keep existing accent hue but darken for AA contrast on white.
  - Shadow: `0 1px 2px rgba(15,15,20,0.06), 0 4px 12px rgba(15,15,20,0.04)` — subtle, not heavy.
  - Inputs, buttons, hover/focus states: redefine each variable that other themes set; do not leave any unset (verify by toggling and scanning for invisible elements).
- In `ThemeContext.jsx`:
  - Theme cycle order: `dark → midnight → light → dark`.
  - Persist via `storage.set('theme', theme)`.
  - Apply via `document.documentElement.setAttribute('data-theme', theme)`.
- Migration: existing users on `dark` or `midnight` unchanged; users who previously landed on `light` now see the new distinct palette instead of inheriting dark values.

### 6.5 Edge cases (smaller fixes)

- Clock: tab inactive for hours → on visibility return, both intervals fire on schedule (no special handling needed; `setInterval` keeps running).
- resetLayout: user has unsaved card-editor modal open → reset closes the parent that owns the modal state; if not, add a `useEffect` to dismiss modals on reset.
- CSS reorg: any rule that depended on cascade order from the old structure (unlikely; verify `.widget-error` specificity and theme-overriding selectors after the move).
- Light theme: SVG icons that were white-on-dark must adapt — use `currentColor` or theme-driven CSS variables, not hardcoded white.

### 6.6 Migration steps (smaller fixes)

1. **Clock:** hoist arrays, split intervals, verify in DevTools that the date string only re-renders on day rollover.
2. **resetLayout:** wire `storage.clear()`, drop `location.reload()`, confirm via a manual test that clicking Reset produces the initial layout without a network round-trip.
3. **CSS:** add section banners, move `:root` to top, run the app and diff visually against `main` (should be identical).
4. **Light theme:** define palette block, add to cycle, click through all 5 tabs verifying contrast and visibility of every widget, hover state, focus ring, and the new `.widget-error` fallback.

---

## Cross-cutting Dependencies

- §3 (Storage Service) must land before §2 (Kanban), §4 (Registry), and §6.2/§6.4 swap `localStorage` calls.
- §4 (Registry) must land before §5 (Error Boundaries) wires per-widget wrappers in `Dashboard.jsx`, so both touch the same render block once.
- §1 (usePollingFetch) is independent of the others and can ship in parallel.
- §6 fixes are independent except §6.2 and §6.4, which depend on §3.

## Suggested Landing Order

1. §3 Storage Service (+ migrations).
2. §1 usePollingFetch (parallel-safe).
3. §4 Widget Registry.
4. §5 Error Boundaries.
5. §2 Kanban dnd-kit migration.
6. §6 Smaller fixes (Clock, resetLayout, CSS reorg, light theme).
