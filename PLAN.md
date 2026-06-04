# Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal command-center dashboard as a single `index.html` file (embedded CSS + JS) that runs locally or on GitHub Pages, optimized for iPad Safari, with a dark neon-terminal aesthetic.

**Architecture:** Single static HTML file. CSS Grid for layout, glassmorphism via `backdrop-filter`, vanilla ES modules-free JavaScript (one IIFE per widget). State for the todo list is persisted to `localStorage`. External data (weather, GitHub activity) is fetched directly from public APIs at page load with simple in-memory caching. There is no build step, no bundler, no framework.

**Tech Stack:** HTML5, CSS3 (Grid, custom properties, `backdrop-filter`), vanilla JavaScript (ES2020), `wttr.in` JSON API, GitHub REST API v3, `localStorage`.

---

## 1. Project Overview

The Command Center is a single-page heads-up display the user opens on an iPad (and occasionally desktop). It surfaces, at a glance:

- **What time is it / what day is it** — live clock + date header.
- **What do I need to do** — a persistent to-do list.
- **What's the weather** — current Dallas conditions.
- **What am I working on** — project cards linking to active repos.
- **What did I ship recently** — GitHub activity pulse across the user's public repos.
- **What is Hermes (background agent) doing** — status panel, placeholder for now.
- **Where do I chat with my agents** — Discord `#jarvis` quick-link.
- **Daily motivation** — rotating quote at the bottom.

It is a *read-mostly* surface — the only interactive widget is the to-do list. Everything else is display.

### Design Principles

1. **Zero build tools.** One file, double-click to open. Deployable to GitHub Pages by committing `index.html`.
2. **Offline-tolerant.** If a network widget fails (weather, GitHub), it shows a graceful error state but does not break the rest of the page.
3. **iPad-first.** Touch targets ≥ 44×44 px (Apple HIG). No hover-only affordances. Safe-area-inset padding for notched devices in landscape.
4. **Dark neon terminal.** Primary accent `#00ffd0` (cyan/teal). Secondary `#7afcff`. Background near-black `#0a0e1a`. Glass cards via `rgba(255,255,255,0.04)` + `backdrop-filter: blur(20px)`.
5. **System font stack.** `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` for chrome; `'SF Mono', Menlo, Consolas, monospace` for terminal-y bits (clock, GitHub activity).

---

## 2. Architecture

### Layout Diagram (iPad landscape, 1194×834)

```
+-------------------------------------------------------------------------------+
| HEADER STRIP                                                                  |
|  ┌──────────────────────────────┐                ┌────────────────────────┐  |
|  │  21:47:03                    │                │  Wed 03 Jun 2026       │  |
|  │  CLOCK (mono, 56px, glow)    │                │  DATE (subtle, 20px)   │  |
|  └──────────────────────────────┘                └────────────────────────┘  |
+-------------------------------------------------------------------------------+
| MAIN GRID (CSS Grid: 3 columns × 2 rows, 16px gap)                            |
|                                                                               |
|  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐            |
|  │ WEATHER          │  │ TO-DO LIST       │  │ HERMES STATUS    │            |
|  │ Dallas, TX       │  │ ┌──────────────┐ │  │ ● online         │            |
|  │ 84°F  ☀          │  │ │ + add task   │ │  │ last run: 12m    │            |
|  │ Feels 88°        │  │ └──────────────┘ │  │ queue: 3 tasks   │            |
|  │ Wind 9 mph SW    │  │ □ buy groceries  │  │ uptime: 4d 6h    │            |
|  │ Hum 41%          │  │ ☑ ship PR #42    │  │ [placeholder]    │            |
|  └──────────────────┘  │ □ call mom       │  └──────────────────┘            |
|                        └──────────────────┘                                   |
|                                                                               |
|  ┌────────────────────────────────────────┐   ┌──────────────────┐           |
|  │ PROJECT CARDS (horizontal row, 3 cards)│   │ DISCORD QUICK    │           |
|  │ ┌─────────┐ ┌─────────┐ ┌─────────┐    │   │  [open #jarvis]  │           |
|  │ │couples  │ │companion│ │property │    │   │  large button    │           |
|  │ │_v1 (Fam)│ │_v1      │ │evaluator│    │   └──────────────────┘           |
|  │ │ ↗ open  │ │ ↗ open  │ │ ↗ open  │    │                                   |
|  │ └─────────┘ └─────────┘ └─────────┘    │   ┌──────────────────┐           |
|  └────────────────────────────────────────┘   │ GITHUB PULSE     │           |
|                                                │  ▮▮▯▮▮▮▯▮ 8/14   │           |
|                                                │  recent events:  │           |
|                                                │  push couples..  │           |
|                                                │  PR  companion.. │           |
|                                                └──────────────────┘           |
+-------------------------------------------------------------------------------+
| FOOTER                                                                        |
|  "The cave you fear to enter holds the treasure you seek." — Joseph Campbell  |
+-------------------------------------------------------------------------------+
```

On iPad portrait (834×1194) the grid collapses to 2 columns; on phone widths it stacks to 1 column (media query at `max-width: 700px`).

### Component Boundaries

The single `index.html` is logically divided into self-contained widget modules. Each widget owns its DOM subtree (a `<section class="card" data-widget="X">`) and exposes only `init()` to a top-level bootstrap. Widgets do **not** call each other.

| Widget       | DOM root id            | Owns                                     |
|--------------|------------------------|------------------------------------------|
| Clock        | `#widget-clock`        | header time + date, 1 Hz tick            |
| Weather      | `#widget-weather`      | wttr.in fetch + render, 30 min refresh   |
| Todo         | `#widget-todo`         | input, list, localStorage CRUD           |
| Discord      | `#widget-discord`      | static anchor + click target             |
| Projects     | `#widget-projects`     | 3 hardcoded project cards                |
| GitHub Pulse | `#widget-github`       | events fetch, sparkline, recent list     |
| Hermes       | `#widget-hermes`       | placeholder status from a JS constant    |
| Quote        | `#widget-quote`        | rotating quote, 60s interval             |

### Data Flow

```
                       page load
                          │
            ┌─────────────┼──────────────────────────┐
            │             │                          │
            ▼             ▼                          ▼
   (sync, in-memory)  (localStorage)            (network)
   - clock tick       - todo items              - wttr.in       ──► WeatherCard
   - quote rotation   - (read once, write       - GitHub API    ──► PulseCard
   - hermes constant    on every mutation)
   - project list                                   │
                                                    │
                                              [fetch fails?]
                                                    │
                                                    ▼
                                              render error state
                                              in that card only

   User actions
   ─────────────
   add todo  ──► append to in-memory array ──► render list ──► persist to localStorage
   toggle    ──► flip item.done            ──► render list ──► persist
   delete    ──► splice from array         ──► render list ──► persist
   tap Discord ──► window.location = discord:// (falls back to https://discord.com/...)
```

No global state object, no event bus. Widgets are independent.

---

## 3. File Structure

This is a single-file project. The final repository contains:

```
command-center/
├── index.html        # the entire dashboard (HTML + <style> + <script>)
├── README.md         # how to open / deploy
├── PLAN.md           # this file
└── .nojekyll         # empty file, so GitHub Pages serves index.html directly
```

**Why no separate CSS/JS files?** The user explicitly requested zero build tools and a single HTML file. Splitting into multiple files would require either a build step (to bundle) or multiple HTTP requests (slower on cold load, more moving parts on GitHub Pages). Embedded keeps it one artifact.

Within `index.html`, the structure is:

```
<!DOCTYPE html>
<html>
  <head>
    <meta tags, viewport, theme-color>
    <title>
    <style>  ← all CSS, organized in this order:
      :root custom properties
      reset + base
      layout grid
      card / glassmorphism
      per-widget styles (clock, weather, todo, ...)
      responsive media queries
      iPad-specific tweaks
    </style>
  </head>
  <body>
    <header>...clock + date...</header>
    <main class="grid">
      <section id="widget-weather">...</section>
      <section id="widget-todo">...</section>
      ...
    </main>
    <footer id="widget-quote">...</footer>

    <script>  ← all JS, organized as IIFE-per-widget:
      const CONFIG = { ... };       // single source of truth for tunables
      (function clock() { ... })();
      (function weather() { ... })();
      (function todo() { ... })();
      (function discord() { ... })();
      (function projects() { ... })();
      (function github() { ... })();
      (function hermes() { ... })();
      (function quote() { ... })();
    </script>
  </body>
</html>
```

---

## 4. Configuration Block

A single `CONFIG` object lives at the top of the `<script>` so the user can tweak without hunting:

```javascript
const CONFIG = {
  // Personal
  githubUser: 'zaimali10',
  discordChannelUrl: 'https://discord.com/channels/@me',   // replace with actual channel deep-link
  weatherLocation: 'Dallas',

  // Projects (label, repo full name, description)
  projects: [
    { label: 'Fam',          repo: 'zaimali10/couples_v1',        desc: 'couples_v1' },
    { label: 'Companion',    repo: 'zaimali10/companion_v1',      desc: 'companion_v1' },
    { label: 'CRE Analyzer', repo: 'zaimali10/property-evaluator',desc: 'property-evaluator' },
  ],

  // Refresh cadences (ms)
  clockTickMs:     1000,
  quoteRotateMs:   60_000,
  weatherRefreshMs: 30 * 60_000,  // 30 minutes
  githubRefreshMs:  10 * 60_000,  // 10 minutes

  // Hermes placeholder
  hermes: {
    status: 'online',
    lastRunMinutesAgo: 12,
    queueDepth: 3,
    uptimeText: '4d 6h',
  },

  // Quotes
  quotes: [
    { text: 'The cave you fear to enter holds the treasure you seek.', author: 'Joseph Campbell' },
    { text: 'Discipline equals freedom.', author: 'Jocko Willink' },
    { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', author: 'James Clear' },
    { text: 'What is essential is invisible to the eye.', author: 'Antoine de Saint-Exupéry' },
    { text: 'The obstacle is the way.', author: 'Marcus Aurelius' },
    { text: 'Make the thing, then make the thing better.', author: '—' },
    { text: 'Slow is smooth, smooth is fast.', author: 'Navy SEALs' },
  ],
};
```

---

## 5. External APIs

### Weather: wttr.in

- **Endpoint:** `https://wttr.in/Dallas?format=j1`
- **Auth:** none.
- **Response shape (only the fields we use):**

```json
{
  "current_condition": [{
    "temp_F": "84",
    "FeelsLikeF": "88",
    "weatherDesc": [{ "value": "Sunny" }],
    "windspeedMiles": "9",
    "winddir16Point": "SW",
    "humidity": "41",
    "weatherCode": "113"
  }],
  "nearest_area": [{ "areaName": [{ "value": "Dallas" }] }]
}
```

- **Rendering:** map `weatherCode` to a Unicode glyph (☀ ☁ ⛅ ⛈ 🌧 🌫 ❄). A small `WEATHER_ICON` lookup table handles this.
- **Fallback:** if fetch fails, render `"weather unavailable"` inside the card.

### GitHub Activity: REST API v3

- **Endpoint:** `https://api.github.com/users/<githubUser>/events/public`
- **Auth:** none required for public events. Rate limit: 60/hour per IP (plenty).
- **Response:** array of event objects. We use `type`, `repo.name`, `created_at`, and (for PushEvents) `payload.commits[0].message`.
- **Rendering:**
  - **Sparkline:** count events per day for the last 14 days, render as a row of `▯` (empty) / `▮` (1) / `▮` styled brighter (≥3) glyphs. (Simple, no SVG.)
  - **Recent list:** top 5 events as `<verb> <repo>` lines, e.g. `push couples_v1 · 2h ago`.
- **Fallback:** if fetch fails, render `"github pulse unavailable"`.

### Discord

No API call. The Discord quick-link is just an anchor:

```html
<a id="discord-link" href="..." target="_blank" rel="noopener">Open #jarvis</a>
```

The href comes from `CONFIG.discordChannelUrl`. The user will paste the real channel URL once they have it.

---

## 6. Milestones

The plan is broken into **6 phases**, each ending with a working, committable artifact. Run phases sequentially.

| Phase | Outcome                                                              |
|-------|----------------------------------------------------------------------|
| 1     | Empty page with header, dark theme tokens, font stack — visible.     |
| 2     | Grid layout with placeholder cards for all 8 widgets.                |
| 3     | Static widgets working: clock, date, quote, Hermes, projects, Discord. |
| 4     | Todo widget with localStorage persistence.                            |
| 5     | Network widgets: weather (wttr.in) and GitHub pulse.                  |
| 6     | iPad polish, deployment to GitHub Pages, README.                      |

---

## Phase 1: Foundation

**Goal:** Bootstrap `index.html` with the dark theme, font stack, and header — visible in a browser.

### Task 1.1: Create the HTML skeleton

**Files:**
- Create: `index.html`

- [ ] **Step 1: Write the file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0a0e1a">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Command Center</title>
  <style>
    /* Phase 1: design tokens + base reset */
    :root {
      --bg:        #0a0e1a;
      --bg-2:      #0f1426;
      --fg:        #e6f1ff;
      --fg-dim:    #9aa9c2;
      --accent:    #00ffd0;
      --accent-2:  #7afcff;
      --danger:    #ff5577;
      --glass-bg:  rgba(255, 255, 255, 0.04);
      --glass-br:  rgba(255, 255, 255, 0.08);
      --radius:    18px;
      --gap:       16px;
      --font-ui:   -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      --font-mono: 'SF Mono', Menlo, Consolas, 'Courier New', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: var(--font-ui);
      color: var(--fg);
      background:
        radial-gradient(1200px 600px at 20% -10%, rgba(0,255,208,0.08), transparent 60%),
        radial-gradient(900px 500px at 110% 10%, rgba(122,252,255,0.06), transparent 60%),
        var(--bg);
      min-height: 100vh;
      padding: env(safe-area-inset-top) env(safe-area-inset-right)
               env(safe-area-inset-bottom) env(safe-area-inset-left);
      -webkit-font-smoothing: antialiased;
      -webkit-tap-highlight-color: transparent;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 24px 32px 16px;
    }
    #clock {
      font-family: var(--font-mono);
      font-size: 56px;
      letter-spacing: 2px;
      color: var(--accent);
      text-shadow: 0 0 18px rgba(0,255,208,0.45);
    }
    #date {
      font-size: 20px;
      color: var(--fg-dim);
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  <header>
    <div id="clock">00:00:00</div>
    <div id="date">— — —</div>
  </header>

  <main id="grid"></main>

  <footer id="widget-quote"></footer>

  <script>
    'use strict';
    const CONFIG = {};  // populated in Phase 3
    // widget IIFEs land here in later phases
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify by opening in a browser**

On Windows: double-click `index.html`, or run `start index.html` from PowerShell. On macOS: `open index.html`.

Expected: dark background with subtle cyan glow in upper corners. Header shows `00:00:00` in cyan mono with glow, and `— — —` in dim text on the right. No console errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: scaffold index.html with dark theme and header"
```

---

## Phase 2: Layout Grid + Card Placeholders

**Goal:** All 8 widget regions visible as empty glassmorphism cards arranged on the grid. No content yet — just confirm geometry on iPad and desktop.

### Task 2.1: Add grid + card styles

**Files:**
- Modify: `index.html` (extend `<style>` block)

- [ ] **Step 1: Append grid + card CSS inside `<style>`**

Add immediately after the `#date` rule:

```css
main#grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: minmax(180px, auto);
  gap: var(--gap);
  padding: 8px 32px 24px;
}
.card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-br);
  border-radius: var(--radius);
  padding: 20px;
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 180px;
}
.card h2 {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--accent);
  opacity: 0.85;
}
.card .empty {
  color: var(--fg-dim);
  font-size: 14px;
}
/* span helpers */
.span-2 { grid-column: span 2; }
.span-full { grid-column: 1 / -1; }

footer#widget-quote {
  padding: 24px 32px 32px;
  text-align: center;
  color: var(--fg-dim);
  font-style: italic;
  font-size: 16px;
}

/* responsive */
@media (max-width: 1000px) {
  main#grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 700px) {
  main#grid { grid-template-columns: 1fr; }
  header { flex-direction: column; align-items: flex-start; gap: 4px; padding: 16px; }
  #clock { font-size: 44px; }
}
```

- [ ] **Step 2: Replace `<main id="grid"></main>` with the 8 card placeholders**

```html
<main id="grid">
  <section class="card" id="widget-weather">
    <h2>Weather · Dallas</h2>
    <div class="empty">loading…</div>
  </section>

  <section class="card" id="widget-todo">
    <h2>To-Do</h2>
    <div class="empty">no tasks</div>
  </section>

  <section class="card" id="widget-hermes">
    <h2>Hermes</h2>
    <div class="empty">—</div>
  </section>

  <section class="card span-2" id="widget-projects">
    <h2>Projects</h2>
    <div class="empty">—</div>
  </section>

  <section class="card" id="widget-discord">
    <h2>Quick Chat</h2>
    <div class="empty">—</div>
  </section>

  <section class="card span-2" id="widget-github">
    <h2>GitHub Pulse</h2>
    <div class="empty">loading…</div>
  </section>
</main>
```

Note: 6 cards on the grid; clock/date in the header and quote in the footer are not in the grid.

- [ ] **Step 3: Verify in the browser**

Refresh `index.html`. Expected: six translucent glass cards visible on a dark background, arranged in a 3-column grid on a wide window. The Projects card and GitHub card each span 2 columns. Each card shows its uppercase cyan title. Cards are at least 180px tall.

Resize the window narrower: at <1000px should collapse to 2 columns; at <700px should stack to 1 column.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: grid layout with 6 glassmorphism card placeholders"
```

---

## Phase 3: Static Widgets

**Goal:** Five widgets that need no network or persistence: clock, date, quote rotator, Hermes status panel, project cards, Discord link.

### Task 3.1: Populate the CONFIG object

**Files:**
- Modify: `index.html` (the `const CONFIG = {};` line inside `<script>`)

- [ ] **Step 1: Replace `const CONFIG = {};` with the full config**

Use exactly the block from Section 4 of this plan. Paste it verbatim.

- [ ] **Step 2: Verify no console errors**

Refresh. Open DevTools console. Expected: clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "chore: add CONFIG block with tunables"
```

### Task 3.2: Clock + date widget

**Files:**
- Modify: `index.html` (append inside `<script>`)

- [ ] **Step 1: Append the clock IIFE**

```javascript
(function clock() {
  const elTime = document.getElementById('clock');
  const elDate = document.getElementById('date');
  const pad = n => String(n).padStart(2, '0');
  const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function tick() {
    const d = new Date();
    elTime.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    elDate.textContent = `${DAY[d.getDay()]} ${pad(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`;
  }
  tick();
  setInterval(tick, CONFIG.clockTickMs);
})();
```

- [ ] **Step 2: Verify**

Refresh. Expected: clock shows current local time and ticks once per second. Date shows `Wed 03 Jun 2026` (or whatever today is) in dim text.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: live clock and date in header"
```

### Task 3.3: Quote rotator widget

**Files:**
- Modify: `index.html` (append inside `<script>`)

- [ ] **Step 1: Append the quote IIFE**

```javascript
(function quote() {
  const el = document.getElementById('widget-quote');
  let i = Math.floor(Math.random() * CONFIG.quotes.length);

  function render() {
    const q = CONFIG.quotes[i];
    el.innerHTML = `"${q.text}" — <span style="color:var(--accent-2)">${q.author}</span>`;
  }
  render();
  setInterval(() => {
    i = (i + 1) % CONFIG.quotes.length;
    render();
  }, CONFIG.quoteRotateMs);
})();
```

- [ ] **Step 2: Verify**

Refresh. Expected: a random quote appears in the footer in italic dim text with author name in cyan. (To verify rotation without waiting 60s, temporarily set `quoteRotateMs: 2000`, refresh, watch it cycle, then change it back and commit.)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: rotating motivational quote in footer"
```

### Task 3.4: Hermes status widget

**Files:**
- Modify: `index.html` (append CSS in `<style>`, append JS in `<script>`)

- [ ] **Step 1: Add Hermes CSS in `<style>`**

```css
.hermes-row { display: flex; justify-content: space-between; font-size: 14px; color: var(--fg-dim); }
.hermes-row span:last-child { color: var(--fg); font-family: var(--font-mono); }
.hermes-status {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 16px; color: var(--fg);
}
.hermes-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--accent); box-shadow: 0 0 10px var(--accent);
}
.hermes-dot.offline { background: var(--danger); box-shadow: 0 0 10px var(--danger); }
```

- [ ] **Step 2: Append Hermes IIFE in `<script>`**

```javascript
(function hermes() {
  const el = document.getElementById('widget-hermes');
  const h = CONFIG.hermes;
  const dotClass = h.status === 'online' ? '' : 'offline';
  el.innerHTML = `
    <h2>Hermes</h2>
    <div class="hermes-status">
      <span class="hermes-dot ${dotClass}"></span>
      <span>${h.status}</span>
    </div>
    <div class="hermes-row"><span>last run</span><span>${h.lastRunMinutesAgo}m ago</span></div>
    <div class="hermes-row"><span>queue</span><span>${h.queueDepth} tasks</span></div>
    <div class="hermes-row"><span>uptime</span><span>${h.uptimeText}</span></div>
  `;
})();
```

- [ ] **Step 3: Verify**

Refresh. Expected: Hermes card shows a glowing cyan dot, `online`, and three rows: `last run 12m ago`, `queue 3 tasks`, `uptime 4d 6h`. Numeric values render in mono.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: hermes status placeholder widget"
```

### Task 3.5: Project cards widget

**Files:**
- Modify: `index.html` (append CSS and JS)

- [ ] **Step 1: Add project CSS in `<style>`**

```css
.proj-row { display: flex; gap: 12px; flex-wrap: wrap; }
.proj {
  flex: 1 1 180px;
  min-width: 180px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(0, 255, 208, 0.04);
  border: 1px solid rgba(0, 255, 208, 0.18);
  display: flex; flex-direction: column; gap: 6px;
  text-decoration: none;
  color: var(--fg);
  min-height: 88px;
  transition: background 120ms ease, transform 120ms ease;
}
.proj:active { transform: scale(0.98); background: rgba(0,255,208,0.10); }
.proj-label { font-size: 16px; font-weight: 600; color: var(--accent); }
.proj-desc  { font-size: 12px; color: var(--fg-dim); font-family: var(--font-mono); }
.proj-cta   { margin-top: auto; font-size: 12px; color: var(--accent-2); }
```

- [ ] **Step 2: Append project IIFE in `<script>`**

```javascript
(function projects() {
  const el = document.getElementById('widget-projects');
  const cards = CONFIG.projects.map(p => `
    <a class="proj" href="https://github.com/${p.repo}" target="_blank" rel="noopener">
      <div class="proj-label">${p.label}</div>
      <div class="proj-desc">${p.desc}</div>
      <div class="proj-cta">open ↗</div>
    </a>
  `).join('');
  el.innerHTML = `<h2>Projects</h2><div class="proj-row">${cards}</div>`;
})();
```

- [ ] **Step 3: Verify**

Refresh. Expected: Projects card (spanning 2 columns) shows 3 sub-cards side by side: `Fam / couples_v1`, `Companion / companion_v1`, `CRE Analyzer / property-evaluator`. Each is tappable; tapping opens the GitHub repo in a new tab.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: project cards for couples_v1, companion_v1, property-evaluator"
```

### Task 3.6: Discord quick-chat widget

**Files:**
- Modify: `index.html` (append CSS and JS)

- [ ] **Step 1: Add Discord CSS in `<style>`**

```css
.discord-btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 10px;
  padding: 16px 20px;
  margin-top: auto;
  min-height: 56px;             /* touch-friendly: well above 44px */
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(0,255,208,0.18), rgba(122,252,255,0.10));
  border: 1px solid rgba(0,255,208,0.35);
  color: var(--fg);
  text-decoration: none;
  font-weight: 600;
  font-size: 16px;
  transition: transform 120ms ease, background 120ms ease;
}
.discord-btn:active { transform: scale(0.97); background: rgba(0,255,208,0.22); }
.discord-sub { color: var(--fg-dim); font-size: 13px; }
```

- [ ] **Step 2: Append Discord IIFE in `<script>`**

```javascript
(function discord() {
  const el = document.getElementById('widget-discord');
  el.innerHTML = `
    <h2>Quick Chat</h2>
    <div class="discord-sub">Send a message to your agents in #jarvis</div>
    <a class="discord-btn" href="${CONFIG.discordChannelUrl}" target="_blank" rel="noopener">
      Open #jarvis →
    </a>
  `;
})();
```

- [ ] **Step 3: Verify**

Refresh. Expected: Quick Chat card with subtitle and a large gradient button reading `Open #jarvis →`. Tapping opens the Discord URL in a new tab. Button feels at least 56px tall.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: discord quick-chat button to #jarvis"
```

---

## Phase 4: Todo List with localStorage

**Goal:** Add task, toggle done, delete task, persist across refresh.

### Task 4.1: Todo widget

**Files:**
- Modify: `index.html` (append CSS and JS)

- [ ] **Step 1: Add Todo CSS in `<style>`**

```css
.todo-input-row { display: flex; gap: 8px; }
.todo-input {
  flex: 1;
  min-height: 44px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--glass-br);
  background: rgba(255,255,255,0.03);
  color: var(--fg);
  font-family: var(--font-ui);
  font-size: 16px;     /* 16px+ prevents iOS Safari zoom-on-focus */
  outline: none;
}
.todo-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(0,255,208,0.2); }
.todo-add {
  min-width: 56px; min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--accent);
  background: rgba(0,255,208,0.12);
  color: var(--accent);
  border-radius: 12px;
  font-size: 20px; font-weight: 700;
  cursor: pointer;
}
.todo-add:active { background: rgba(0,255,208,0.22); }

.todo-list { list-style: none; display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
.todo-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255,255,255,0.03);
  min-height: 44px;
}
.todo-item.done .todo-text { text-decoration: line-through; color: var(--fg-dim); }
.todo-check {
  width: 22px; height: 22px;
  border-radius: 6px;
  border: 1.5px solid var(--accent);
  background: transparent;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0;
}
.todo-check.checked { background: var(--accent); }
.todo-check.checked::after { content: '✓'; color: var(--bg); font-weight: 900; font-size: 14px; }
.todo-text { flex: 1; font-size: 15px; color: var(--fg); word-break: break-word; }
.todo-del {
  background: none; border: none; color: var(--fg-dim);
  font-size: 20px; cursor: pointer; padding: 4px 8px; min-width: 32px; min-height: 32px;
}
.todo-del:active { color: var(--danger); }
```

- [ ] **Step 2: Append Todo IIFE in `<script>`**

```javascript
(function todo() {
  const STORAGE_KEY = 'cc.todos.v1';
  const el = document.getElementById('widget-todo');

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }
  function save(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

  let items = load();

  function render() {
    el.innerHTML = `
      <h2>To-Do</h2>
      <div class="todo-input-row">
        <input class="todo-input" type="text" placeholder="add a task…" maxlength="140" />
        <button class="todo-add" aria-label="add task">+</button>
      </div>
      <ul class="todo-list"></ul>
    `;
    const input = el.querySelector('.todo-input');
    const addBtn = el.querySelector('.todo-add');
    const list   = el.querySelector('.todo-list');

    function add() {
      const text = input.value.trim();
      if (!text) return;
      items.push({ id: Date.now() + Math.random(), text, done: false });
      input.value = '';
      save(items);
      renderList();
    }
    addBtn.addEventListener('click', add);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });

    function renderList() {
      list.innerHTML = items.map(it => `
        <li class="todo-item ${it.done ? 'done' : ''}" data-id="${it.id}">
          <button class="todo-check ${it.done ? 'checked' : ''}" aria-label="toggle"></button>
          <span class="todo-text">${escapeHtml(it.text)}</span>
          <button class="todo-del" aria-label="delete">×</button>
        </li>
      `).join('') || '<li style="color:var(--fg-dim);font-size:14px;padding:8px 4px;">no tasks yet</li>';

      list.querySelectorAll('.todo-item').forEach(li => {
        const id = Number(li.dataset.id);
        li.querySelector('.todo-check').addEventListener('click', () => toggle(id));
        li.querySelector('.todo-del').addEventListener('click', () => remove(id));
      });
    }

    function toggle(id) {
      const it = items.find(x => x.id === id);
      if (!it) return;
      it.done = !it.done;
      save(items); renderList();
    }
    function remove(id) {
      items = items.filter(x => x.id !== id);
      save(items); renderList();
    }
    function escapeHtml(s) {
      return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    renderList();
  }

  render();
})();
```

- [ ] **Step 3: Verify add**

Refresh. Type `buy groceries` into the input, tap `+` (or press Enter). Expected: item appears in the list with an empty cyan checkbox and an `×` button. Input clears.

- [ ] **Step 4: Verify toggle**

Tap the checkbox. Expected: it fills with cyan and shows a `✓`; the text gets strikethrough and dims.

- [ ] **Step 5: Verify delete**

Tap the `×`. Expected: item disappears.

- [ ] **Step 6: Verify persistence**

Add 2 items, mark one done, refresh the page. Expected: both items reappear with the same done/undone state. In DevTools Application → Local Storage, key `cc.todos.v1` shows the JSON array.

- [ ] **Step 7: Verify XSS protection**

Add a task with the literal text `<img src=x onerror=alert(1)>`. Expected: it renders as plain text, no alert fires.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: todo list with localStorage persistence"
```

---

## Phase 5: Network Widgets

**Goal:** Live weather from `wttr.in` and live GitHub activity from the public events API.

### Task 5.1: Weather widget

**Files:**
- Modify: `index.html` (append CSS and JS)

- [ ] **Step 1: Add Weather CSS in `<style>`**

```css
.wx-main { display: flex; align-items: center; gap: 14px; }
.wx-icon { font-size: 44px; line-height: 1; }
.wx-temp { font-family: var(--font-mono); font-size: 36px; color: var(--accent); text-shadow: 0 0 12px rgba(0,255,208,0.35); }
.wx-desc { color: var(--fg-dim); font-size: 14px; }
.wx-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 14px; font-size: 13px; }
.wx-grid .k { color: var(--fg-dim); }
.wx-grid .v { color: var(--fg); font-family: var(--font-mono); }
.wx-err { color: var(--danger); font-size: 13px; }
```

- [ ] **Step 2: Append Weather IIFE in `<script>`**

```javascript
(function weather() {
  const el = document.getElementById('widget-weather');

  // wttr weatherCode → glyph
  const ICON = (code) => {
    const c = Number(code);
    if (c === 113) return '☀';                              // clear/sunny
    if ([116].includes(c)) return '⛅';                      // partly cloudy
    if ([119, 122].includes(c)) return '☁';                 // cloudy / overcast
    if ([143, 248, 260].includes(c)) return '🌫';           // fog/mist
    if ([176, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308, 311, 314, 317, 350, 353, 356, 359, 386, 389].includes(c)) return '🌧';
    if ([200].includes(c)) return '⛈';                      // thunder
    if ([179, 182, 185, 227, 230, 320, 323, 326, 329, 332, 335, 338, 368, 371, 374, 377, 392, 395].includes(c)) return '❄';
    return '🌡';
  };

  function render(state) {
    if (state.error) {
      el.innerHTML = `<h2>Weather · Dallas</h2><div class="wx-err">weather unavailable</div>`;
      return;
    }
    const d = state.data;
    el.innerHTML = `
      <h2>Weather · ${d.area}</h2>
      <div class="wx-main">
        <div class="wx-icon">${ICON(d.code)}</div>
        <div>
          <div class="wx-temp">${d.tempF}°F</div>
          <div class="wx-desc">${d.desc}</div>
        </div>
      </div>
      <div class="wx-grid">
        <div class="k">feels</div><div class="v">${d.feelsF}°F</div>
        <div class="k">wind</div> <div class="v">${d.windMph} mph ${d.windDir}</div>
        <div class="k">humidity</div><div class="v">${d.humidity}%</div>
      </div>
    `;
  }

  async function fetchWeather() {
    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(CONFIG.weatherLocation)}?format=j1`);
      if (!res.ok) throw new Error('http ' + res.status);
      const j = await res.json();
      const cc = j.current_condition[0];
      const area = (j.nearest_area && j.nearest_area[0] && j.nearest_area[0].areaName[0].value) || CONFIG.weatherLocation;
      render({ data: {
        area,
        tempF:    cc.temp_F,
        feelsF:   cc.FeelsLikeF,
        desc:     cc.weatherDesc[0].value,
        windMph:  cc.windspeedMiles,
        windDir:  cc.winddir16Point,
        humidity: cc.humidity,
        code:     cc.weatherCode,
      }});
    } catch (e) {
      console.warn('[weather]', e);
      render({ error: true });
    }
  }

  render({ data: { area: CONFIG.weatherLocation, tempF: '--', feelsF: '--', desc: 'loading…', windMph: '--', windDir: '--', humidity: '--', code: 0 }});
  fetchWeather();
  setInterval(fetchWeather, CONFIG.weatherRefreshMs);
})();
```

- [ ] **Step 3: Verify success path**

Refresh with internet connected. Expected: within ~1s the Weather card shows `Weather · Dallas`, a weather glyph, a temperature in cyan mono, a description, and three stat rows (feels, wind, humidity).

- [ ] **Step 4: Verify failure path**

Open DevTools Network tab, set to "Offline". Refresh. Expected: Weather card shows `weather unavailable` in red. Other widgets continue to work.

Set Network back to "Online" before next step.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: live Dallas weather via wttr.in"
```

### Task 5.2: GitHub activity pulse widget

**Files:**
- Modify: `index.html` (append CSS and JS)

- [ ] **Step 1: Add GitHub CSS in `<style>`**

```css
.gh-spark { font-family: var(--font-mono); font-size: 22px; letter-spacing: 4px; color: var(--accent); line-height: 1; }
.gh-spark .lo  { color: rgba(0,255,208,0.25); }
.gh-spark .mid { color: rgba(0,255,208,0.65); }
.gh-spark .hi  { color: var(--accent); text-shadow: 0 0 8px var(--accent); }
.gh-count { font-size: 12px; color: var(--fg-dim); margin-left: 8px; vertical-align: middle; }
.gh-events { display: flex; flex-direction: column; gap: 4px; font-size: 13px; max-height: 160px; overflow-y: auto; }
.gh-event { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.05); }
.gh-event:last-child { border-bottom: 0; }
.gh-verb { color: var(--accent-2); font-family: var(--font-mono); width: 56px; flex-shrink: 0; }
.gh-repo { color: var(--fg); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gh-when { color: var(--fg-dim); font-family: var(--font-mono); font-size: 12px; flex-shrink: 0; }
.gh-err  { color: var(--danger); font-size: 13px; }
```

- [ ] **Step 2: Append GitHub IIFE in `<script>`**

```javascript
(function github() {
  const el = document.getElementById('widget-github');

  const VERB = {
    PushEvent:        'push',
    PullRequestEvent: 'PR',
    IssuesEvent:      'issue',
    CreateEvent:      'create',
    DeleteEvent:      'delete',
    WatchEvent:       'star',
    ForkEvent:        'fork',
    ReleaseEvent:     'release',
    CommitCommentEvent: 'comment',
    IssueCommentEvent:  'comment',
  };

  function relTime(iso) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60)      return `${s}s ago`;
    if (s < 3600)    return `${Math.floor(s/60)}m ago`;
    if (s < 86400)   return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
  }

  function shortRepo(full) {
    const i = full.indexOf('/');
    return i >= 0 ? full.slice(i+1) : full;
  }

  function buildSpark(events) {
    // count events per day for last 14 days (oldest → newest)
    const days = 14;
    const buckets = new Array(days).fill(0);
    const today = new Date(); today.setHours(0,0,0,0);
    for (const ev of events) {
      const d = new Date(ev.created_at); d.setHours(0,0,0,0);
      const idx = days - 1 - Math.floor((today - d) / 86400000);
      if (idx >= 0 && idx < days) buckets[idx]++;
    }
    return buckets.map(n => {
      if (n === 0) return `<span class="lo">▯</span>`;
      if (n < 3)   return `<span class="mid">▮</span>`;
      return `<span class="hi">▮</span>`;
    }).join('');
  }

  function render(state) {
    if (state.error) {
      el.innerHTML = `<h2>GitHub Pulse</h2><div class="gh-err">github pulse unavailable</div>`;
      return;
    }
    const evs = state.events;
    const total = evs.length;
    const spark = buildSpark(evs);
    const recent = evs.slice(0, 5).map(ev => `
      <div class="gh-event">
        <span class="gh-verb">${VERB[ev.type] || ev.type.replace('Event','').toLowerCase()}</span>
        <span class="gh-repo">${shortRepo(ev.repo.name)}</span>
        <span class="gh-when">${relTime(ev.created_at)}</span>
      </div>
    `).join('') || '<div style="color:var(--fg-dim)">no recent activity</div>';

    el.innerHTML = `
      <h2>GitHub Pulse · @${CONFIG.githubUser}</h2>
      <div><span class="gh-spark">${spark}</span><span class="gh-count">${total} events / 14d</span></div>
      <div class="gh-events">${recent}</div>
    `;
  }

  async function fetchEvents() {
    try {
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(CONFIG.githubUser)}/events/public`, {
        headers: { 'Accept': 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error('http ' + res.status);
      const events = await res.json();
      render({ events });
    } catch (e) {
      console.warn('[github]', e);
      render({ error: true });
    }
  }

  el.innerHTML = `<h2>GitHub Pulse · @${CONFIG.githubUser}</h2><div class="empty">loading…</div>`;
  fetchEvents();
  setInterval(fetchEvents, CONFIG.githubRefreshMs);
})();
```

- [ ] **Step 3: Verify success path**

Refresh. Expected: within ~1s the GitHub card shows the username header, a 14-character sparkline of `▯` and `▮` glyphs, a count like `8 events / 14d`, and up to 5 recent event lines formatted `push  couples_v1  2h ago`. If the user has no public activity, sparkline is all `▯` and the recent list says `no recent activity`.

- [ ] **Step 4: Verify failure path**

Set DevTools Network to "Offline", refresh. Expected: `github pulse unavailable` in red. Set back to "Online".

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: github activity pulse with 14d sparkline"
```

---

## Phase 6: iPad Polish + Deployment

**Goal:** Confirm everything works on iPad Safari, add the `.nojekyll` file, write a `README.md`, push to GitHub Pages.

### Task 6.1: iPad-specific tweaks

**Files:**
- Modify: `index.html` (append CSS in `<style>`)

- [ ] **Step 1: Append iPad-targeted media query**

Add at the end of `<style>`:

```css
/* iPad landscape and portrait fine-tuning */
@media (min-width: 768px) and (max-width: 1366px) and (pointer: coarse) {
  body { font-size: 16px; }
  .card { min-height: 200px; padding: 22px; }
  .todo-input, .todo-add, .todo-del, .todo-check, .discord-btn, .proj { font-size: 16px; }
  /* Prevent rubber-band overscroll bleed */
  html, body { overscroll-behavior: none; }
}

/* Hide scrollbars in webkit while keeping scroll */
.gh-events::-webkit-scrollbar, .todo-list::-webkit-scrollbar { width: 6px; }
.gh-events::-webkit-scrollbar-thumb, .todo-list::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1); border-radius: 3px;
}
```

- [ ] **Step 2: Verify in iPad Safari**

Open `index.html` on iPad Safari. Easiest path: serve locally so the iPad can hit it.

In PowerShell from the project folder:

```powershell
python -m http.server 8080
```

Find the desktop's LAN IP (`ipconfig`), then on the iPad open `http://<desktop-ip>:8080/`.

Verify, in order:
- All cards render with glassmorphism blur.
- Clock ticks; quote is visible.
- Weather card loads Dallas data.
- GitHub pulse loads activity.
- Tap an empty todo input — it focuses without the page zooming in (font-size ≥ 16px does this).
- Add a todo, toggle, delete — works with touch.
- Tap a project card — opens GitHub in a new Safari tab.
- Tap the Discord button — opens the Discord URL.
- Rotate the iPad to portrait — grid collapses to 2 columns.
- Pull-down does not cause overscroll bleed.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: iPad Safari polish and touch tuning"
```

### Task 6.2: Add README and .nojekyll

**Files:**
- Create: `README.md`
- Create: `.nojekyll` (empty file)

- [ ] **Step 1: Create README.md**

```markdown
# Command Center

Personal heads-up display for the iPad. Single static `index.html` — no build tools.

## Run locally

Open `index.html` directly in a browser, or serve the folder:

```bash
python -m http.server 8080
# then visit http://localhost:8080/
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In repo Settings → Pages → Source: `main` branch, root folder.
3. Wait ~1 minute. Visit `https://<username>.github.io/command-center/`.

## Configuration

Edit the `CONFIG` block near the top of the `<script>` in `index.html`:

- `githubUser` — your GitHub username for the activity pulse.
- `discordChannelUrl` — deep link to the channel you want the Quick Chat button to open.
- `weatherLocation` — any string `wttr.in` accepts (city name, airport code, etc.).
- `projects` — array of `{ label, repo, desc }` for the project cards.
- `hermes` — placeholder status fields; replace once Hermes exposes a real endpoint.
- `quotes` — array of `{ text, author }`; rotates every 60s.

## Wiring Hermes for real

Replace the `hermes` IIFE's call to `CONFIG.hermes` with a `fetch()` to your Hermes
status endpoint. The render contract is: `{ status, lastRunMinutesAgo, queueDepth, uptimeText }`.
```

- [ ] **Step 2: Create empty `.nojekyll`**

In PowerShell:

```powershell
New-Item -ItemType File .nojekyll
```

- [ ] **Step 3: Commit**

```bash
git add README.md .nojekyll
git commit -m "docs: README and disable jekyll for Pages"
```

### Task 6.3: Push to GitHub and enable Pages

- [ ] **Step 1: Push**

```bash
git remote add origin https://github.com/zaimali10/command-center.git   # if not set
git push -u origin main
```

- [ ] **Step 2: Enable Pages**

In a browser: github.com/zaimali10/command-center → Settings → Pages → Source = `Deploy from a branch` → Branch = `main` / `(root)` → Save.

- [ ] **Step 3: Verify**

Wait 30–90 seconds. Visit `https://zaimali10.github.io/command-center/` on the iPad. Expected: everything from Task 6.1 still works, served from the public URL.

- [ ] **Step 4: (Optional) bookmark to home screen**

In iPad Safari → Share → Add to Home Screen. Confirm the home-screen icon launches in standalone mode (the meta tags from Task 1 enable this).

---

## 7. Testing Instructions

The dashboard has no automated test suite — it is a static page with manual smoke tests. Use this checklist after any change.

### Smoke checklist (≤ 3 minutes)

Open `index.html` in Chrome desktop and iPad Safari:

1. **Header**
   - Clock shows current local time, ticks every second.
   - Date matches today.

2. **Weather card**
   - Shows `Weather · Dallas` with glyph, temperature, description.
   - Stat rows render: feels, wind, humidity.
   - DevTools Network → Offline → refresh → card shows `weather unavailable`. Restore network.

3. **Todo card**
   - Add a task via `+` and via Enter key — both work.
   - Toggle a task — checkbox fills, text gets strikethrough.
   - Delete a task — disappears.
   - Refresh page — tasks persist.
   - Add `<script>alert(1)</script>` as a task — renders as plain text, no alert.

4. **Hermes card**
   - Shows cyan dot, `online`, last-run / queue / uptime rows.

5. **Projects card**
   - Three cards: Fam, Companion, CRE Analyzer.
   - Each opens the correct GitHub repo in a new tab.

6. **Discord card**
   - Large button reads `Open #jarvis →`.
   - Tap opens the configured URL in a new tab.

7. **GitHub Pulse**
   - Sparkline of 14 glyphs renders.
   - Event count visible.
   - Up to 5 recent events listed with verb, repo, relative time.
   - DevTools Offline → refresh → shows `github pulse unavailable`. Restore.

8. **Quote**
   - Italic quote with cyan author in footer.
   - Temporarily set `quoteRotateMs: 2000` to confirm rotation, then revert.

9. **Layout**
   - Resize browser narrower → grid collapses 3 → 2 → 1 columns.
   - On iPad: rotate portrait/landscape; layout adapts.
   - All buttons are ≥ 44px tall.

10. **Console**
    - No errors logged (warnings from offline tests are expected).

### iPad-specific manual checks

- Tap-to-focus the todo input — page does **not** zoom in.
- Cards render with visible blur (glassmorphism).
- Safe-area insets work in landscape (notched iPads).
- After "Add to Home Screen", the app launches without Safari chrome.

### When something breaks

| Symptom                              | Likely cause / fix                                                |
|--------------------------------------|-------------------------------------------------------------------|
| Weather shows error in dev only      | CORS or wttr.in rate-limited. Wait or open in normal browser tab. |
| GitHub shows error                   | 60 req/hr/IP limit hit. Wait an hour, or sign in to GitHub.       |
| Todo doesn't persist                 | Private/Incognito mode disables localStorage. Use normal window.  |
| Backdrop blur missing                | Older browser. Confirmed on Safari 15+ / Chrome 90+.              |
| Clock frozen                         | Console error in a later IIFE halted script. Check DevTools.      |

---

## 8. Spec Coverage Self-Check

Cross-referencing the original requirements against tasks:

| Requirement                                              | Implemented in        |
|----------------------------------------------------------|-----------------------|
| Dark theme                                               | Task 1.1 (tokens)     |
| iPad-optimized                                           | Task 6.1              |
| Card-based layout                                        | Task 2.1              |
| Live clock + date                                        | Task 3.2              |
| To-do list (localStorage)                                | Task 4.1              |
| Discord quick link to #jarvis                            | Task 3.6              |
| Weather for Dallas (wttr.in)                             | Task 5.1              |
| Project cards: couples_v1, companion_v1, property-evaluator | Task 3.5           |
| GitHub activity pulse                                    | Task 5.2              |
| Hermes agent status (placeholder)                        | Task 3.4              |
| Rotating motivational quote                              | Task 3.3              |
| Neon terminal accent (cyan/teal primary)                 | Task 1.1              |
| Glassmorphism cards                                      | Task 2.1              |
| System font stack                                        | Task 1.1              |
| Touch-friendly buttons                                   | Tasks 3.6, 4.1, 6.1   |
| Zero build tools / single HTML file                      | Section 3 (structure) |
| Works on iPad Safari                                     | Task 6.1, Section 7   |

All requirements have a corresponding task. No gaps.

---

## 9. Execution Notes

- **TDD-style verification is replaced by browser smoke tests.** This is a vanilla static page with no test runner; the equivalent of a "failing test" is "load the page and observe the broken state," and the equivalent of "passing test" is the verification step at the end of each task.
- **Commit cadence is per task**, not per phase — keeps history granular.
- **Do not introduce a build step.** If you find yourself reaching for npm, stop and reconsider.
- **Keep the file under ~800 lines.** If it grows past that, it's a signal to revisit whether one of the widgets has become heavy enough to deserve its own file (which would then require the user to accept a multi-file deployment — discuss before doing it).
