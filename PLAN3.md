# Command Center — Phase 2: Tabs + Kanban Board

## Architecture Decision (Opus vetted)
**Vanilla JS + ES modules** (not React). Zero build step, proxy unchanged, iPad works as-is.

## Current File
- `~/Projects/command-center/index.html` — ~1065 lines, monolithic HTML/CSS/JS
- All CSS is inline in `<style>` blocks
- All JS is inline in `<script>` tags
- Served by `serve.py` (Python proxy → Hermes API)

## What to Build

### 1. Split into ES modules
Restructure the monolith into separate files with zero build step:
```
index.html                (~150 lines: shell + tab nav + CSS)
js/
  app.js                  (init, tab router, mounts widgets)
  lib/api.js              (API.fetch wrapper for Hermes /api/*)
  lib/config.js           (CONFIG: user settings, projects, quotes)
  widgets/
    clock.js              (12-hour clock + date)
    quote.js              (rotating quote footer)
    weather.js            (wttr.in fetch + render)
    system.js             (Hermes status: gateway, discord, version)
    todo.js               (existing to-do list, localStorage)
    github.js             (GitHub events + sparkline)
    cron.js               (cron jobs table from API)
    sessions.js           (recent sessions from API)
    analytics.js          (usage analytics + sparkline)
    skills.js             (enabled skills list)
    kanban.js             (NEW: kanban board, localStorage)
    monitor.js            (NEW: system resource monitor placeholder)
```

### 2. Tabbed interface
- 3 tabs: **Dashboard** | **To-Do** | **Kanban**
- Dashboard tab shows: clock, weather, system, cron, analytics, sessions, skills, github, projects, discord chat
- To-Do tab shows: the existing to-do widget (full-width, roomier)
- Kanban tab shows: the new kanban board (full-width)
- Active tab saved to localStorage
- Tab bar at top, glassmorphism style matching the current theme
- Use CSS `display: none` to show/hide tab panels (no router needed)

### 3. Kanban Board Widget (the main feature)
- 3 columns: **Backlog** | **In Progress** | **Done**
- localStorage persistence (same pattern as to-do)
- Click/tap a card → moves it forward (Backlog → In Progress → Done)
- Long-press on card → edit dialog (title, description, tags, due date)
- "New Card" button at top of each column
- Card fields: title (required), description (optional), tags (optional, comma-separated), due date (optional)
- Tags rendered as colored pills
- Empty column shows a subtle placeholder
- Cards sort by creation date within each column
- Delete card via a small × button
- Dark glassmorphism matching current theme

### 4. CSS Updates
- Move all existing inline CSS to a `<style>` block in index.html header
- Add tab bar styles (horizontal pill-style tabs, active state)
- Add kanban board styles (3-column grid, card styling, column headers)
- Keep all existing design tokens and glassmorphism
- Responsive: on narrow screens, kanban columns stack vertically

### 5. serve.py update (if needed)
- serve.py should still serve everything — ES modules work via `<script type="module" src="js/app.js">` — same origin, no CORS
- The Python SimpleHTTPRequestHandler auto-serves static files, so `js/` subdirectory works

## Implementation Order
1. Create directory structure (`js/lib/`, `js/widgets/`)
2. Extract `lib/api.js` and `lib/config.js` from the monolith
3. Extract each widget into its own file (clock, quote, weather, system, todo, github, cron, sessions, analytics, skills, projects, discord)
4. Create `js/app.js` with tab router + init flow
5. Rewrite `index.html` as the thin shell (CSS + module script tag + tab nav + widget containers)
6. Build the kanban widget (`js/widgets/kanban.js`)
7. Add the system monitor placeholder widget
8. Test everything works locally

## Important Constraints
- Zero build step. No webpack, no npm, no bundle. Just `<script type="module">`.
- All existing functionality must work identically after the split.
- HTML structure and CSS classes should stay the same where possible.
- The clock fix (12-hour AM/PM) was just added — preserve it.
- The API auto-detection logic (relative paths when local, LAN IP when GitHub Pages) must be preserved.
- Use the `frontend-design` plugin for polished CSS/grid/component design.
- Use the `superpowers` plugin for enhanced coding workflow.
- Test in the browser after the split before building the kanban.

## Files to Touch
- `~/Projects/command-center/index.html` — rewrite as shell
- `~/Projects/command-center/js/app.js` — NEW: init + tab router
- `~/Projects/command-center/js/lib/api.js` — NEW: API fetch wrapper
- `~/Projects/command-center/js/lib/config.js` — NEW: user config + quotes
- `~/Projects/command-center/js/widgets/*.js` — NEW: one per widget (12 widgets)
- `~/Projects/command-center/serve.py` — likely unchanged

## Verification Checklist
- [ ] `localhost:8080` loads the full dashboard
- [ ] All widgets render with live API data
- [ ] Tabs switch correctly (Dashboard / To-Do / Kanban)
- [ ] To-Do widget works (add, toggle, delete, persists)
- [ ] Kanban board works (create card, click to move, edit, delete, persists)
- [ ] 12-hour clock shows AM/PM
- [ ] No JS console errors
- [ ] `git commit` and `git push` when done
