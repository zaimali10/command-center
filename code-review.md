# Code Review: Command Center Dashboard
Generated: 2026-06-04

## 🔴 Critical Issues

**1. Kanban's Custom Drag-and-Drop is Fragile & Redundant**
- Kanban.jsx (435 lines) implements manual pointer-event drag logic with DOM queries instead of using the installed dnd-kit library
- Drop-target detection will slow down with 50+ cards — DOM traversal on every mouse move
- Uses `activeDrag` as module-level state, fragile if React ever batches updates differently

**2. No Abstraction Over Fetch + Polling**
- 8+ components reimplement the same pattern: fetch → handle errors → set state → interval cleanup
- `API` wrapper exists but only used for gateway status, not consistently
- Adding request deduplication, caching, or global error handling requires touching every component

**3. Every Component Owns Its Storage**
- Todo, Kanban, Grocery, LayoutContext all do `localStorage.getItem(KEY)` → JSON.parse directly
- No validation, no versioning, no migration path
- Data consistency not guaranteed with two tabs open

**4. Layout Reset is a Footgun**
- `resetLayout()` calls `window.location.reload()` — wipes all transient state
- Should clear localStorage + reset local state instead

**5. Monolithic Components**
- Kanban: 435 lines — drag logic + data mutation + modal form + rendering mixed
- WorkQueue: 3 independent useEffect hooks for 3 polling sources
- No custom hooks, logic can't be reused or tested

## 🟡 Design/Pattern Issues

**6. Widget Registry Not Extensible**
- WIDGET_COMPONENTS and TITLE_MAP hardcoded in Dashboard.jsx
- Adding a widget requires editing Dashboard + maps
- No lazy-loading or plugin system

**7. Inconsistent Data Models**
- Todo, Kanban, Grocery each have their own schema with no shared conventions

**8. Date/Time Handling Scattered**
- `Date.now() + Math.random()` for IDs — will collide with fast adds
- Clock/date recalculation in App.jsx runs every second despite date only changing at midnight

**9. Clock Optimization**
- `formatDate()` creates array literals every render — should be memoized

**10. CSS is 1000+ Line Monolith**
- No component-scoped styles, hard to maintain

## 🟠 Maintenance Red Flags

**11. No Error Boundaries** — a crash in any widget crashes the whole dashboard

**12. No Tests** — Kanban card reordering is complex and untested

**13. Hardcoded Configuration** — Dallas, 192.168.1.30, no .env

**14. Inconsistent Polling Intervals** — 10s to 30min, no documented rationale

**15. Accessibility Gaps** — limited ARIA labels, modal doesn't trap focus

**16. Theme Implementation Incomplete** — 'light' mode has no distinct colors

## ✅ What's Good
- Design is modern and cohesive
- dnd-kit integration in Dashboard is clean and correct
- Modal pattern in Kanban is well-structured
- localStorage with versioned keys is sensible
- Good touch/mouse support
- Minimal dependencies, focused stack

## 💥 What Breaks First
1. 40+ Kanban cards → lag from DOM query drop detection
2. Adding caching → rewriting 8 components
3. New widget → forgetting to update Dashboard.jsx
4. localStorage schema change → no migration path
5. Widget crash → whole dashboard dies

## 🛠️ Refactoring Roadmap (Priority Order)
1. Extract a `usePollingFetch` hook
2. Move Kanban to dnd-kit
3. Create a storage service with validation + migrations
4. Build an extensible widget registry
5. Add error boundaries per widget
6. Extract custom hooks (Kanban modal, date formatting)
7. Organize CSS by component
8. Add integration tests (Kanban card ordering)
