# React + Vite + dnd-kit Migration Plan

> **For Hermes:** Execute phase-by-phase via Claude Code (Sonnet for implementation, Opus for any architecture decisions). If Claude hits usage limits, wait 60s and retry — do not fall back to manual Hermes tool calls. Keep retrying until it works or the user is notified.

**Goal:** Migrate the Command Center from vanilla ES modules to React + Vite + dnd-kit for a buttery-smooth drag-and-drop experience with spring physics, auto-scroll, keyboard reorder, and proper touch handling.

**Architecture:** Same-repo migration. Vite dev server during development (`npm run dev`), Vite build outputs to `dist/`, `serve.py` updated to serve `dist/` for production. All 11 widgets rewritten as React components. dnd-kit provides the sortable grid context. Existing API layer (`api.js`) reused as a utility module.

**Tech Stack:** React 18, Vite 6, dnd-kit (sortable + utilities), vanilla CSS (same design tokens, ported to a single `styles.css`).

---

### Phase 1: Scaffold Vite + React + Port Layout State

**Objective:** Set up Vite + React project inside the repo. Port layout state (widget order, spans, column count) to a React context. One widget renders as a proof of concept.

**Files:**
- Create: `package.json` (name: "command-center", private, deps: react, react-dom, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities)
- Create: `vite.config.js` (React plugin, base: './' for file:// serve)
- Create: `index.html` (replace current — Vite entry point, references `/src/main.jsx`)
- Create: `src/main.jsx` (React root, renders `<App />`)
- Create: `src/App.jsx` (Dashboard view, wraps with DndContext + SortableContext)
- Create: `src/context/LayoutContext.jsx` (widget order, spans, column count — reads/writes cc.layout.v1)
- Create: `src/context/ThemeContext.jsx` (theme toggle, persisted to cc.theme.v1)
- Create: `src/styles.css` (all existing CSS from index.html <style>, ported verbatim)
- Create: `src/lib/api.js` (copy from js/lib/api.js)
- Create: `src/lib/config.js` (copy from js/lib/config.js)
- Create: `src/components/Dashboard.jsx` (the grid container, maps layout to SortableGrid)
- Create: `src/components/widgets/Weather.jsx` (first ported widget — proof of concept)
- Modify: `serve.py` — add `--dev` flag to proxy Vite dev server, default to serving `dist/`
- Delete: `js/` directory (after all widgets ported — end of Phase 5)

**Step 1: Create package.json**

```json
{
  "name": "command-center",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0"
  }
}
```

**Step 2: Create vite.config.js**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
});
```

**Step 3: Create Vite index.html entry**

Replace existing `index.html` with Vite entry:
- Keep the same `<head>` with design tokens, viewport meta, apple-mobile-web-app
- Keep the same `<body>` shell (header with clock, tabs, panels for dashboard/todo/kanban)
- Change `<script type="module" src="js/app.js">` to `<script type="module" src="/src/main.jsx">`
- Remove all `<section>` widget shells from the dashboard (React renders them)
- Remove all tab panel content (React renders them)
- Keep the CSS (will move to `src/styles.css` later)

**Step 4: Create LayoutContext.jsx**

```jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cc.layout.v1';
const DEFAULT_LAYOUT = [
  { id: 'widget-weather',   span: 1 },
  { id: 'widget-forecast',  span: 1 },
  { id: 'widget-system',    span: 1 },
  { id: 'widget-skills',    span: 1 },
  { id: 'widget-cron',      span: 'full' },
  { id: 'widget-analytics', span: 2 },
  { id: 'widget-monitor',   span: 1 },
  { id: 'widget-projects',  span: 2 },
  { id: 'widget-discord',   span: 1 },
  { id: 'widget-github',    span: 2 },
  { id: 'widget-sessions',  span: 1 },
];

const LayoutContext = createContext();

export function LayoutProvider({ children }) {
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {}
    return structuredClone(DEFAULT_LAYOUT);
  });

  const saveOrder = useCallback((newOrder) => {
    setOrder(newOrder);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder)); } catch {}
  }, []);

  const resetLayout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setOrder(structuredClone(DEFAULT_LAYOUT));
  }, []);

  return (
    <LayoutContext.Provider value={{ order, saveOrder, resetLayout, DEFAULT_LAYOUT }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be inside LayoutProvider');
  return ctx;
}
```

**Step 5: Create ThemeContext.jsx**

```jsx
import React, { createContext, useContext, useState, useEffect } from 'react';

const THEME_KEY = 'cc.theme.v1';
const THEMES = ['dark', 'light', 'midnight'];

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(THEME_KEY) || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

**Step 6: Create Dashboard.jsx with SortableGrid**

```jsx
import React, { useMemo } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLayout } from '../context/LayoutContext';

function SortableCard({ id, span, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    gridColumn: span === 'full' ? '1 / -1' : span === 2 ? 'span 2' : undefined,
  };

  return (
    <section ref={setNodeRef} className="card" style={style} data-span={span} {...attributes} {...listeners}>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { order, saveOrder } = useLayout();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const widgetIds = useMemo(() => order.map(w => w.id), [order]);

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = order.findIndex(w => w.id === active.id);
    const newIndex = order.findIndex(w => w.id === over.id);
    const newOrder = [...order];
    const [moved] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, moved);
    saveOrder(newOrder);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
        <main id="dashboard">
          {order.map(w => (
            <SortableCard key={w.id} id={w.id} span={w.span}>
              {/* Render widget by id — each widget registered in a map */}
            </SortableCard>
          ))}
        </main>
      </SortableContext>
    </DndContext>
  );
}
```

**Step 7: Wire Weather widget as proof of concept**

Create `src/components/widgets/Weather.jsx`:
```jsx
import React, { useState, useEffect } from 'react';
import { useAPI } from '../../hooks/useAPI';

export default function Weather() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch('/api/weather');
        if (res.ok) setData(await res.json());
      } catch {}
    }
    fetchWeather();
    const interval = setInterval(fetchWeather, 1800000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <h2>Weather · Dallas</h2>
      {data ? (
        <div className="wx-main">
          <span className="wx-icon">{data.icon}</span>
          <span className="wx-temp">{data.temp}°F</span>
        </div>
      ) : (
        <div className="empty">loading…</div>
      )}
    </>
  );
}
```

**Step 8: Wire in app**

Update `src/App.jsx`:
```jsx
import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { LayoutProvider } from './context/LayoutContext';
import Dashboard from './components/Dashboard';
import './styles.css';

export default function App() {
  return (
    <ThemeProvider>
      <LayoutProvider>
        <header>{/* clock, date, theme toggle */}</header>
        <Dashboard />
      </LayoutProvider>
    </ThemeProvider>
  );
}
```

**Verify:**
- Run: `npm run dev` — Vite starts on :5173
- Open browser to :5173 — Weather widget renders, layout context loads from localStorage
- No console errors
- Run `npm run build` — builds to `dist/`

---

### Phase 2: Port All 11 Widgets

**Objective:** Rewrite every widget as a React component. Each lives in `src/components/widgets/`. All mount* functions become React components with useState/useEffect.

**Widget list (in port order):**
1. Clock — `src/components/widgets/Clock.jsx` (interval, shows time/date in header)
2. Quote — `src/components/widgets/Quote.jsx` (footer quote)
3. Weather — already done in Phase 1
4. Forecast — `src/components/widgets/Forecast.jsx` (3-day, wttr.in)
5. System — `src/components/widgets/System.jsx` (Hermes system info)
6. Skills — `src/components/widgets/Skills.jsx` (skills table)
7. Cron — `src/components/widgets/Cron.jsx` (cron jobs, live refresh)
8. Sessions — `src/components/widgets/Sessions.jsx` (recent sessions)
9. Analytics — `src/components/widgets/Analytics.jsx` (usage stats)
10. Monitor — `src/components/widgets/Monitor.jsx` (CPU/RAM/disk)
11. Github — `src/components/widgets/Github.jsx` (GitHub pulse)
12. Projects — `src/components/widgets/Projects.jsx`
13. Discord — `src/components/widgets/Discord.jsx`
14. Todo — `src/components/widgets/Todo.jsx` (renders in To-Do tab)
15. Kanban — `src/components/widgets/Kanban.jsx` (renders in Kanban tab, uses dnd-kit)

**Pattern for each widget:**
- Import from `../../lib/api.js` for fetch helpers
- Use `useState` for data, `useEffect` for fetch + interval
- `useEffect` return cleanup clears intervals
- Export as default function component

**Verify:**
- Every widget renders with live data
- No console errors
- Intervals don't duplicate
- Tab switching works (Dashboard / To-Do / Kanban)

---

### Phase 3: dnd-kit Sortable Grid — Full Drag-and-Drop

**Objective:** Replace the placeholder SortableCard in Dashboard.jsx with a fully functional sortable grid — spring animation, auto-scroll, touch support, keyboard reorder.

**What dnd-kit gives us for free:**
- `closestCenter` collision detection (finds nearest item on drop)
- `PointerSensor` with `distance: 8` activation threshold (no long-press needed — just start dragging)
- `SortableContext` with `rectSortingStrategy` (2D grid-aware sorting)
- `CSS.Transform.toString()` for automatic spring animation on reorder
- Auto-scroll when dragging near viewport edge (built into DndContext)
- Keyboard reorder (built into SortableContext — tab to card, space to pick up, arrow keys to move)
- Touch support (PointerSensor works on touch devices natively)

**Updates needed:**
- Add `DndContext` `autoScroll` prop configuration
- Add drag overlay (a floating clone of the dragged card for visual feedback — `DragOverlay` component from dnd-kit)
- Add `onDragStart` handler to capture the dragged widget's span for the overlay
- Ensure `data-span` attribute updates on resize
- Remove the `--cols` CSS var approach — React state + inline styles are cleaner
- Remove layout.js, watchResize, currentCols — all replaced by React state / dnd-kit

**Verify:**
- Drag any widget by its header → spring animation follows pointer
- Drop between widgets → spring animation snaps to position
- Refresh → order persists from localStorage
- Drag on iPad touch → works with PointerSensor
- Auto-scroll when dragging near bottom of page

---

### Phase 4: Port Kanban + Update serve.py + Scheduled Task

**Objective:** Port Kanban to use dnd-kit (replacing hand-rolled Pointer Events), update serve.py to serve Vite build, update the scheduled task.

**Kanban port:**
- Replace the 300-line Pointer Events drag system with dnd-kit sortable
- Each kanban column is a separate SortableContext
- Cards use `useSortable` within their column
- Moving between columns = onDragEnd handler that moves the card data between lists
- Keep the same modal UI for editing
- Keep the same tags/due-dates display

**serve.py updates:**
- Default: serve `dist/` (the Vite production build)
- `--dev` flag: proxy to Vite dev server (`http://localhost:5173`)
- Keep the API proxy (`/api/*` to localhost:9119)
- Keep the telemetry daemon spawn
- Keep the zombie killer

**Scheduled task update:**
- Update the scheduled task to run `npm run build && python serve.py` at boot
- Or just run `npx vite build` before serve.py starts

**Verify:**
- `npm run build` → `dist/` has index.html + assets/
- `python serve.py` → serves React app from dist/
- Kanban works with dnd-kit — drag between columns
- Scheduled task at boot serves React app

---

### Phase 5: Cleanup

**Objective:** Remove old vanilla files, update .gitignore, final commit.

**Files to delete:**
- `js/` directory (entire)
- `serve.py` → or keep it and just update it (Phase 4 handles this)
- `old-index.html` if it exists
- `.hermes/plans/` old plan files

**Files to update:**
- `.gitignore` — add `node_modules/`, `dist/`
- `README.md` — update build instructions

**Final verify:**
- `git clone` fresh → `npm install && npm run build && python serve.py` → app works
- iPad at `http://192.168.1.30:8080/` → app loads, all widgets render, drag works

---

### Total Estimate

| Phase | Hours | Cumulative |
|-------|-------|-----------|
| 1 — Scaffold + Layout Context | 2 | 2 |
| 2 — Port all 11 widgets | 4 | 6 |
| 3 — dnd-kit sortable grid | 2 | 8 |
| 4 — Kanban + serve.py + task | 2 | 10 |
| 5 — Cleanup | 1 | 11 |

**iPad Mini grid with buttery drag** achieved at end of Phase 3.
