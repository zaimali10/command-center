# Refactor Implementation Spec — Command Center Dashboard

## Priority Order & Model Assignment
Items 1–5: Sonnet (model: claude-sonnet-4-20250514)
Items 6–7: Haiku (model: claude-haiku-3-5-20241022)

---

## 1. usePollingFetch Hook
**File:** `src/hooks/usePollingFetch.js`
**Model:** Sonnet

### Interface
```js
function usePollingFetch(url, interval, options = {}): {
  data,        // T | null — fetched data, null initially / on error
  error,       // Error | null
  isLoading,   // boolean — true during first fetch, false afterward
  isRefreshing,// boolean — true during subsequent fetches (keep stale data)
  lastUpdated, // Date | null
  refetch,     // () => void — manual trigger
}
```

Options:
- `transform` — `(raw) => T` — post-process fetched data
- `retry` — number (default 2) — retries on failure
- `onError` — `(Error) => void` — side effect on error
- `enabled` — boolean (default true) — skip fetch if false
- `deps` — array — refetch when deps change (like useEffect deps)

### Behavior
- Auto-fetch on mount, re-fetch on interval
- Skip fetch when `document.hidden === true` (tab not visible)
- Skip fetch if previous request still in-flight (deduplication)
- Auto-clear interval on unmount (no leaks)
- `isLoading` is true only on initial fetch; `isRefreshing` true on subsequent
- On error: `data` stays as previous value (don't wipe valid data), `error` set

### Migration
Replace direct `useEffect` + `fetch` + `setInterval` patterns in:
- `Weather.jsx` (30s interval → usePollingFetch)
- `Monitor.jsx` (30s interval → usePollingFetch)
- `WorkQueue.jsx` (3 separate useEffects → 3 usePollingFetch calls)
- `GatewayStatus.jsx` (manual polling → usePollingFetch)

---

## 2. Kanban dnd-kit Migration
**File:** `src/components/widgets/Kanban.jsx`
**Model:** Sonnet

### Changes
- Remove all manual pointer-event code (onPointerDown, onPointerMove, getDropTarget, getBoundingClientRect, activeDrag, querySelector chains)
- Import `@dnd-kit/core` (DndContext, DragOverlay, useDraggable, useDroppable) and `@dnd-kit/sortable` (SortableContext, useSortable, verticalListSortingStrategy, arrayMove)
- Each card uses `useSortable`. Each column is a droppable zone.
- DragOverlay renders a semi-transparent clone of the dragged card.
- On drag end: detect source column and target column → either reorder within column (arrayMove) or move between columns (splice + update column/order metadata).
- Keep the existing `CardEditor` modal form and `localStorage` persistence unchanged.
- Keep existing `columns` config and data structures unchanged (id, created, order, column, title, description, tags, due).
- Remove keyboard shortcuts `e, E, Delete, Enter` unless easy to port to dnd-kit's keyboard sensor.

### Edge Cases
- Card dropped outside any column → no-op (return to original position)
- During drag, the placeholder slot should be visible (lifted card's original position shows empty space)
- Touch events work natively via dnd-kit's PointerSensor + TouchSensor

---

## 3. Storage Service
**File:** `src/services/storage.js`
**Model:** Sonnet

### Interface
```js
const storage = {
  get(key, defaultValue),  // parse JSON, fallback on error
  set(key, value),         // stringify + write
  remove(key),
  clear(),                 // remove all cc_ keys
  keys(),                  // list of cc_ keys
}
```

All keys prefixed with `cc_` (e.g. `cc_kanban_cards`, `cc_todo_items`).

### Schema Versioning
- Store `cc_schema_version` = 1
- When version changes, run migration functions
- Each migration is a function from old to new format
- Corrupt data → log warning, return default, write clean default back

### Consumers to migrate
- `LayoutContext.jsx` — `const saved = localStorage.getItem('widgetLayout')` → `storage.get('widgetLayout', defaultLayout)`
- `Kanban.jsx` — localStorage access → storage service
- `Todo.jsx` — localStorage access → storage service
- `Grocery.jsx` — localStorage access → storage service
- `ThemeContext.jsx` — localStorage access → storage service

---

## 4. Widget Registry
**File:** `src/registry.js`
**Model:** Sonnet

### Interface
```js
// registry.js
export const WIDGETS = [
  { id: 'weather',     component: Weather,     title: 'Weather',      defaultPosition: { x: 0, y: 0 }, defaultSize: { w: 2, h: 1 } },
  { id: 'monitor',     component: Monitor,     title: 'System Monitor', ... },
  // ... all 14 widgets
]

export function getWidget(id)    // returns widget config or undefined
export function getComponents()  // returns { [id]: component } for Dashboard
export function getTitles()      // returns { [id]: title } — replaces TITLE_MAP
```

### Migration
- Replace `import { WIDGET_COMPONENTS, WIDGET_TITLES }` in Dashboard.jsx with `import { getComponents, getTitles } from '../registry.js'`
- No change to localStorage layout data format (backward compatible)
- Adding a widget: add entry to WIDGETS array + import component

---

## 5. Error Boundaries
**File:** `src/components/ErrorBoundary.jsx`
**Model:** Sonnet

### Implementation
- Class component (React error boundaries require class)
- Props: `name` (widget name for display), `children`
- State: `{ hasError: false, error: null }`
- `static getDerivedStateFromError(error)` → `{ hasError: true, error }`
- `componentDidCatch(error, info)` → `console.error(widgetName, error, info)`
- Render: if error, show card with widget name + error message + "Retry" button (calls `setState({ hasError: false })`)
- Wrap each widget in Dashboard.jsx: `<ErrorBoundary name={title}><WidgetComponent ... /></ErrorBoundary>`

---

## 6. Small Fixes (Haiku)

### 6a. Clock optimization — `src/App.jsx`
- Move `['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']` and month arrays outside the component (module-level constants)
- Only update state when minute changes (not every second — use `setInterval(60000)` for date, separate `setInterval(1000)` for seconds display)
- Or: memoize with useMemo

### 6b. Fix resetLayout — `src/LayoutContext.jsx`
- Replace `window.location.reload()` with: clear `cc_layout` + `cc_hidden_widgets` from localStorage, then reset local state to defaults
- Trigger re-render via state update, not page reload

### 6c. CSS organization plan — `src/styles.css`
No structural change (too risky mid-project). Instead: add section comments:
```
/* === LAYOUT === */
/* === WIDGETS === */
/* === THEME === */
/* === RESPONSIVE === */
```
And move the theme color variables to the top under `:root`.

### 6d. Light theme — `src/styles.css` + `ThemeContext.jsx`
- In `[data-theme="light"]`, add: black text, white/near-white backgrounds, subtle shadows instead of glow effects
- Toggle applied via ThemeContext (already uses data-theme attribute)
- Keep existing dark/midnight colors unchanged

---

## Execution Order

| Step | Item | Depends On | Model |
|------|------|-----------|-------|
| 1 | usePollingFetch hook | Nothing | Sonnet |
| 2 | Error boundaries | Nothing (parallel with step 1) | Sonnet |
| 3 | Storage service | Nothing (parallel with 1, 2) | Sonnet |
| 4 | Widget registry | Step 1 (uses usePollingFetch for a clean pattern) | Sonnet |
| 5 | Kanban dnd-kit | Step 3 (uses storage service) | Sonnet |
| 6 | Clock, resetLayout, CSS, theme | Steps 1–5 complete | Haiku |

Steps 1, 2, 3 can run in parallel. Steps 4–6 are sequential.
