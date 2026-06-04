# Command Center: Live Hermes Integration & Aesthetic Overhaul

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Command Center from a static dashboard into a live data-driven hub with premium Linear/Vercel-quality visuals, integrating real-time Hermes Agent data with graceful fallback to static mode.

**Architecture:** 
- Single HTML file with embedded CSS/JS (no build step, no dependencies)
- Dual-mode operation: LIVE (fetches from http://192.168.1.30:9119 with 10s auto-refresh) vs STATIC (fallback with placeholder data)
- Widget-based modular structure: each widget owns its fetch logic, render, and error handling
- Premium glassmorphism aesthetic with micro-interactions, data density optimization, and sparkline visualizations
- Responsive to iPad landscape/portrait with touch-friendly interactions

**Tech Stack:** Vanilla JavaScript, CSS Grid/Flexbox, CSS Backdrop Filter, Fetch API, localStorage for persistence

**API Gateway:** http://192.168.1.30:9119 (local Hermes Agent dashboard)

---

## Data Architecture

### Expected API Response Shapes

#### GET /api/status
```json
{
  "version": "0.2.5",
  "gateway_status": "running",
  "uptime_seconds": 372860,
  "connected_platforms": 5,
  "active_sessions": 3,
  "last_activity": "2026-06-03T19:45:22Z"
}
```

#### GET /api/sessions (recent 20)
```json
{
  "sessions": [
    {
      "id": "sess_abc123",
      "model": "claude-opus-4-7",
      "created_at": "2026-06-03T19:32:10Z",
      "message_count": 15,
      "tokens": { "input": 4200, "output": 3100 },
      "preview": "Tell me about the new feature..."
    }
  ]
}
```

#### GET /api/cron/jobs
```json
{
  "jobs": [
    {
      "id": "cron_1",
      "name": "daily_report",
      "schedule": "0 9 * * *",
      "state": "idle",
      "last_run": "2026-06-03T09:00:15Z",
      "next_run": "2026-06-04T09:00:00Z"
    }
  ]
}
```

#### GET /api/analytics/usage?days=7
```json
{
  "usage": [
    { "date": "2026-05-28", "tokens_in": 42000, "tokens_out": 31000, "cost_usd": 0.85 },
    { "date": "2026-05-29", "tokens_in": 55000, "tokens_out": 48000, "cost_usd": 1.12 }
  ]
}
```

#### GET /api/skills
```json
{
  "skills": [
    {
      "name": "test-driven-development",
      "status": "active",
      "version": "1.0.0",
      "last_updated": "2026-05-30"
    }
  ]
}
```

---

## Layout & Widget Diagram

### Current (8 widgets, mostly static)
```
[Clock/Date Header]
┌──────────────┬──────────────┬──────────────┐
│ Weather      │ Todo         │ Hermes (old) │
├──────────────┴──────────────┼──────────────┤
│ Projects (span-2)           │ Discord      │
├──────────────────────────────┴──────────────┤
│ GitHub Pulse (span-2)                       │
└─────────────────────────────────────────────┘
[Quote Footer]
```

### New (10+ widgets, Hermes-focused)
```
[Clock/Date Header]
┌──────────────┬──────────────┬──────────────┐
│ Weather      │ Todo         │ Live Status  │
│              │              │ (Gateway)    │
├──────────────┴──────────────┼──────────────┤
│ Active Jobs (Cron table)    │ Skills       │
│                             │ Status       │
├─────────────────────────────┼──────────────┤
│ Recent Sessions             │ Analytics    │
│ (5 items)                   │ (7d spark)   │
├─────────────────────────────┴──────────────┤
│ Projects (span-2)           | Discord      │
├─────────────────────────────┴──────────────┤
│ GitHub Pulse (span-2)                       │
└─────────────────────────────────────────────┘
[Quote Footer]
```

---

## CSS Design System Tokens

### New Token Set (replaces some of the existing)
```css
:root {
  /* Existing (keep as-is) */
  --bg:        #0a0e1a;
  --bg-2:      #0f1426;
  --fg:        #e6f1ff;
  --fg-dim:    #9aa9c2;
  --accent:    #00ffd0;
  --accent-2:  #7afcff;
  --danger:    #ff5577;
  --font-ui:   -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'SF Mono', Menlo, Consolas, 'Courier New', monospace;

  /* New design tokens for premium feel */
  --surface:       rgba(255, 255, 255, 0.02);    /* subtle background for tables */
  --surface-alt:   rgba(255, 255, 255, 0.04);    /* alternating rows */
  --border:        rgba(255, 255, 255, 0.06);    /* minimal separators */
  --border-light:  rgba(255, 255, 255, 0.03);    /* very subtle */
  --border-accent: rgba(0, 255, 208, 0.12);      /* accent borders */
  --status-active: #10b981;                      /* green for online/active */
  --status-idle:   #f59e0b;                      /* amber for idle/warning */
  --status-error:  #ef4444;                      /* red for error/offline */
  
  /* Spacing & Radius */
  --radius-sm:     12px;
  --radius-md:     16px;
  --radius-lg:     18px;
  
  /* Shadows for depth */
  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.15);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.25);
}
```

---

## Implementation Phases

### Phase 1: API Integration Foundation (Tasks 1-4)
Set up the communication layer between Command Center and Hermes API.

### Phase 2: CSS Design System & Layout (Tasks 5-7)
Refactor styles for premium aesthetic, data density, and new widget grid.

### Phase 3: Widget Implementation (Tasks 8-12)
Build the five new Hermes-focused widgets with live data binding.

### Phase 4: Integration & Polish (Tasks 13-15)
Wire up auto-refresh, error handling, mode detection, and full-flow testing.

---

## Phase 1: API Integration Foundation

### Task 1: Add CONFIG & Hermes API Utility Functions

**Files:**
- Modify: `index.html:295-332` (CONFIG object)
- Modify: `index.html:290-293` (add script section for utilities before existing code)

**Context:** The CONFIG object currently holds static data and settings. Extend it with Hermes API endpoint configuration and add a reusable fetch utility that handles timeouts, retries, and error states.

- [ ] **Step 1: Extend CONFIG with Hermes API settings**

Update the CONFIG object (around line 295) to include Hermes API configuration:

```javascript
const CONFIG = {
  // Personal
  githubUser: 'zaimali10',
  discordChannelUrl: 'https://discord.com/channels/1500918944637386974/1511524310349516860',
  weatherLocation: 'Dallas',

  // Hermes API Configuration
  hermesApiHost: 'http://192.168.1.30:9119',  // Auto-detected if online
  hermesCheckTimeoutMs: 2000,                  // Quick timeout for availability check
  hermesRefreshMs: 10 * 1000,                  // 10 seconds
  hermesMode: null,                            // Will be set to 'live' or 'static' at runtime

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

  // Hermes static fallback data (used when API unavailable)
  hermesStatic: {
    status: {
      version: '0.2.5',
      gateway_status: 'offline',
      uptime_seconds: 0,
      connected_platforms: 0,
      active_sessions: 0,
      last_activity: new Date().toISOString(),
    },
    sessions: { sessions: [] },
    jobs: { jobs: [] },
    analytics: { usage: [] },
    skills: { skills: [] },
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

- [ ] **Step 2: Add Hermes API utility functions before the clock IIFE**

Add this code right after the CONFIG object definition (before the clock function):

```javascript
// ============================================================================
// Hermes API Utilities
// ============================================================================

const HermesAPI = {
  // Cache for last successful response (for fallback)
  cache: {},

  // Detect if Hermes API is reachable
  async checkAvailability() {
    try {
      const res = await fetch(`${CONFIG.hermesApiHost}/api/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(CONFIG.hermesCheckTimeoutMs),
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  },

  // Generic fetch with timeout and error handling
  async fetch(endpoint) {
    try {
      const url = `${CONFIG.hermesApiHost}${endpoint}`;
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),  // 5 second timeout per request
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.cache[endpoint] = data;  // Update cache on success
      return { ok: true, data };
    } catch (e) {
      console.warn(`[Hermes] Fetch failed for ${endpoint}:`, e.message);
      // Return cached data if available, otherwise return error
      if (this.cache[endpoint]) {
        return { ok: true, data: this.cache[endpoint] };
      }
      return { ok: false, error: e.message };
    }
  },

  // Convenience methods for each endpoint
  async getStatus() {
    return this.fetch('/api/status');
  },

  async getSessions() {
    return this.fetch('/api/sessions');
  },

  async getJobs() {
    return this.fetch('/api/cron/jobs');
  },

  async getAnalytics() {
    return this.fetch('/api/analytics/usage?days=7');
  },

  async getSkills() {
    return this.fetch('/api/skills');
  },
};

// Global state for mode
let HERMES_MODE = 'static';  // Default to static; set to 'live' after availability check

(async function initHermesMode() {
  const isAvailable = await HermesAPI.checkAvailability();
  HERMES_MODE = isAvailable ? 'live' : 'static';
  CONFIG.hermesMode = HERMES_MODE;
  console.log(`[Hermes] Mode: ${HERMES_MODE}`);
  // Trigger initial widget render after mode is determined
  if (HERMES_MODE === 'live') {
    renderLiveHermesWidgets();
  }
})();

function renderLiveHermesWidgets() {
  // Placeholder; will be called after HERMES_MODE is set
  // This will update Hermes-related widgets with live data
}
```

- [ ] **Step 3: Verify CONFIG structure with test data**

Run this in browser console to verify the CONFIG object loads and HermesAPI is accessible:

```javascript
// In browser console:
console.log(CONFIG.hermesApiHost);  // Should print: http://192.168.1.30:9119
console.log(typeof HermesAPI.fetch);  // Should print: function
console.log(HERMES_MODE);  // Should print: 'live' or 'static'
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add Hermes API utility functions and dual-mode configuration"
```

---

### Task 2: Add Static Fallback Data & Error Handling

**Files:**
- Modify: `index.html:290-300` (enhance CONFIG.hermesStatic)

**Context:** When the Hermes API is unreachable, widgets should gracefully fall back to placeholder data. This task defines the shape of fallback data and error-handling helpers.

- [ ] **Step 1: Enhance CONFIG.hermesStatic with realistic fallback data**

Replace the `hermesStatic` object in CONFIG (from Task 1) with richer fallback data:

```javascript
  hermesStatic: {
    status: {
      version: '0.2.5',
      gateway_status: 'offline',
      uptime_seconds: 372860,
      connected_platforms: 0,
      active_sessions: 0,
      last_activity: new Date().toISOString(),
    },
    sessions: {
      sessions: [
        { id: 'sess_1', model: 'claude-opus-4-7', created_at: '2026-06-03T15:22:00Z', message_count: 0, tokens: { input: 0, output: 0 }, preview: '(offline)' },
      ]
    },
    jobs: {
      jobs: [
        { id: 'cron_1', name: 'daily_report', schedule: '0 9 * * *', state: 'idle', last_run: null, next_run: null },
      ]
    },
    analytics: {
      usage: [
        { date: '2026-05-28', tokens_in: 0, tokens_out: 0, cost_usd: 0 },
      ]
    },
    skills: {
      skills: [
        { name: 'test-driven-development', status: 'inactive', version: '1.0.0', last_updated: '2026-05-30' },
      ]
    },
  },
```

- [ ] **Step 2: Add error display helper function**

Add this function after the HermesAPI object definition:

```javascript
function showHermesError(elementId, message = 'API unavailable') {
  const el = document.getElementById(elementId);
  if (el) {
    el.innerHTML = `<h2>${el.querySelector('h2')?.textContent || 'Widget'}</h2><div class="empty" style="color: var(--danger);">${message}</div>`;
  }
}
```

- [ ] **Step 3: Add data normalization helper**

Add this function after the error helper:

```javascript
function getHermesData(endpoint) {
  if (HERMES_MODE === 'static' || !CONFIG.hermesMode) {
    // Return fallback data synchronously (used before async check completes)
    const key = endpoint.replace('/api/', '').replace(/\?.*/, '');
    return CONFIG.hermesStatic[key] || {};
  }
  // Live mode data will be fetched separately
  return null;
}
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add fallback data structure and error handling helpers"
```

---

### Task 3: Implement LIVE/STATIC Mode Detection on Page Load

**Files:**
- Modify: `index.html:340-350` (update initHermesMode function)

**Context:** Currently, initHermesMode sets the mode but doesn't trigger widget updates. Enhance it to call widget renderers once mode is determined.

- [ ] **Step 1: Create wrapper function for mode-aware data fetching**

Add this after the error/data helpers:

```javascript
// Returns either live data via fetch or static fallback
async function fetchHermesData(endpoint, staticKey) {
  if (HERMES_MODE === 'live') {
    const result = await HermesAPI.fetch(endpoint);
    if (result.ok) return result.data;
  }
  // Fall back to static data
  return CONFIG.hermesStatic[staticKey] || {};
}
```

- [ ] **Step 2: Update initHermesMode to render widgets after mode is set**

Replace the initHermesMode function with:

```javascript
(async function initHermesMode() {
  const isAvailable = await HermesAPI.checkAvailability();
  HERMES_MODE = isAvailable ? 'live' : 'static';
  CONFIG.hermesMode = HERMES_MODE;
  console.log(`[Hermes] Mode: ${HERMES_MODE}`);
  
  // Render Hermes widgets after mode is determined
  await renderHermesLiveStatus();
  await renderHermesActiveJobs();
  await renderHermesRecentSessions();
  await renderHermesAnalytics();
  await renderHermesSkills();
  
  // Start auto-refresh if in live mode
  if (HERMES_MODE === 'live') {
    setInterval(refreshHermesWidgets, CONFIG.hermesRefreshMs);
  }
})();

async function refreshHermesWidgets() {
  await renderHermesLiveStatus();
  await renderHermesActiveJobs();
  await renderHermesRecentSessions();
  await renderHermesAnalytics();
  await renderHermesSkills();
}

// Placeholder functions (to be implemented in Phase 3)
async function renderHermesLiveStatus() {}
async function renderHermesActiveJobs() {}
async function renderHermesRecentSessions() {}
async function renderHermesAnalytics() {}
async function renderHermesSkills() {}
```

- [ ] **Step 3: Test mode detection in browser**

Load the page and check browser console:

```javascript
// Console should show:
// [Hermes] Mode: live
// (or "static" if API is not reachable)
```

If the Hermes API is not available locally, you should see `[Hermes] Mode: static` and the widgets should render with fallback data.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: implement live/static mode detection with auto-refresh trigger"
```

---

### Task 4: Add Network Error Handling & Graceful Degradation

**Files:**
- Modify: `index.html:420-440` (HermesAPI object)

**Context:** API calls can fail mid-way. Add retry logic and timeouts to prevent widgets from hanging indefinitely.

- [ ] **Step 1: Enhance HermesAPI.fetch with retry logic**

Replace the HermesAPI.fetch method with:

```javascript
  async fetch(endpoint, retries = 1) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const url = `${CONFIG.hermesApiHost}${endpoint}`;
        const res = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),  // 5 second timeout per request
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        this.cache[endpoint] = data;  // Update cache on success
        return { ok: true, data };
      } catch (e) {
        if (attempt === retries) {
          console.warn(`[Hermes] Fetch failed (${retries + 1} attempts) for ${endpoint}:`, e.message);
          // Return cached data if available, otherwise return error
          if (this.cache[endpoint]) {
            return { ok: true, data: this.cache[endpoint] };
          }
          return { ok: false, error: e.message };
        }
        // Wait 100ms before retry
        await new Promise(r => setTimeout(r, 100));
      }
    }
  },
```

- [ ] **Step 2: Add rate-limiting to prevent API hammering**

Add this property to the HermesAPI object:

```javascript
  lastFetchTime: {},

  // Check if enough time has passed since last fetch of this endpoint
  canFetch(endpoint) {
    const lastTime = this.lastFetchTime[endpoint] || 0;
    const now = Date.now();
    const minInterval = 500;  // Minimum 500ms between same-endpoint fetches
    if (now - lastTime < minInterval) {
      console.debug(`[Hermes] Rate limit: skipping ${endpoint}`);
      return false;
    }
    this.lastFetchTime[endpoint] = now;
    return true;
  },
```

- [ ] **Step 3: Update fetch to use rate limiting**

Modify the fetch method to check rate limiting first:

```javascript
  async fetch(endpoint, retries = 1) {
    if (!this.canFetch(endpoint)) {
      // Return cached data if available
      if (this.cache[endpoint]) {
        return { ok: true, data: this.cache[endpoint] };
      }
      return { ok: false, error: 'Rate limited' };
    }
    // ... rest of fetch logic
  },
```

- [ ] **Step 4: Test error handling**

In browser console, simulate a network error:

```javascript
// Temporarily misconfigure the API host
CONFIG.hermesApiHost = 'http://bad-host-that-does-not-exist:9999';

// Try to fetch
HermesAPI.fetch('/api/status').then(result => {
  console.log('Fetch result:', result);
  // Should show: { ok: false, error: 'fetch failed' }
  // Or: { ok: true, data: ... } if cached
});

// Restore
CONFIG.hermesApiHost = 'http://192.168.1.30:9119';
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add retry logic and rate limiting for Hermes API calls"
```

---

## Phase 2: CSS Design System & Layout

### Task 5: Define New CSS Design Tokens & Base Styles

**Files:**
- Modify: `index.html:10-26` (`:root` CSS variables)
- Modify: `index.html:227-251` (media queries section - add new utility classes)

**Context:** The current glassmorphism design is good, but needs additional tokens and utility classes to support the new premium aesthetic (data tables, status badges, sparklines, etc.).

- [ ] **Step 1: Add new CSS variables to :root**

Add these new variables after the existing tokens (around line 26):

```css
    /* New design tokens for premium feel & data density */
    --surface:       rgba(255, 255, 255, 0.02);
    --surface-alt:   rgba(255, 255, 255, 0.04);
    --border:        rgba(255, 255, 255, 0.06);
    --border-light:  rgba(255, 255, 255, 0.03);
    --border-accent: rgba(0, 255, 208, 0.12);
    --status-active: #10b981;
    --status-idle:   #f59e0b;
    --status-error:  #ef4444;
    --radius-sm:     12px;
    --radius-md:     16px;
```

- [ ] **Step 2: Add utility classes for tables and data rows**

Add this after the `.gh-err` class (around line 226):

```css
    /* Data table & row styles for Hermes widgets */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      font-family: var(--font-mono);
    }
    .data-table th {
      text-align: left;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
      color: var(--fg-dim);
      font-weight: 500;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .data-table td {
      padding: 10px;
      border-bottom: 1px solid var(--border-light);
      color: var(--fg);
    }
    .data-table tbody tr:nth-child(even) {
      background: var(--surface-alt);
    }
    .data-table tbody tr:hover {
      background: var(--surface);
    }

    /* Status badge */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-mono);
    }
    .status-badge.active {
      background: rgba(16, 185, 129, 0.15);
      color: var(--status-active);
    }
    .status-badge.idle {
      background: rgba(245, 158, 11, 0.15);
      color: var(--status-idle);
    }
    .status-badge.error {
      background: rgba(239, 68, 68, 0.15);
      color: var(--status-error);
    }

    /* Status dot (small indicator) */
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .status-dot.active { background: var(--status-active); }
    .status-dot.idle { background: var(--status-idle); }
    .status-dot.error { background: var(--status-error); }

    /* Stat row: label on left, value on right */
    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--border-light);
      font-size: 13px;
    }
    .stat-row:last-child { border-bottom: 0; }
    .stat-row .label { color: var(--fg-dim); flex: 1; }
    .stat-row .value { color: var(--fg); font-family: var(--font-mono); font-weight: 600; }

    /* Mini sparkline using Unicode blocks */
    .sparkline {
      font-family: var(--font-mono);
      font-size: 18px;
      letter-spacing: 2px;
      color: var(--accent);
      line-height: 1;
    }
    .sparkline .block-0 { color: rgba(0, 255, 208, 0.2); }
    .sparkline .block-1 { color: rgba(0, 255, 208, 0.35); }
    .sparkline .block-2 { color: rgba(0, 255, 208, 0.5); }
    .sparkline .block-3 { color: rgba(0, 255, 208, 0.7); }
    .sparkline .block-4 { color: var(--accent); }

    /* Micro-interaction: subtle glow on hover */
    .card {
      transition: border-color 200ms ease, box-shadow 200ms ease;
    }
    .card:hover {
      border-color: var(--border-accent);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), 0 0 20px rgba(0, 255, 208, 0.08);
    }
```

- [ ] **Step 3: Verify new styles are accessible**

Open the page in a browser and check that the new CSS variables are defined:

```javascript
// In console:
getComputedStyle(document.documentElement).getPropertyValue('--surface-active');
// Should return: "rgba(255, 255, 255, 0.02)"
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add premium design tokens, table styles, status badges, and micro-interactions"
```

---

### Task 6: Refactor Grid Layout for New Hermes Widgets

**Files:**
- Modify: `index.html:259-289` (main grid section - add new cards)

**Context:** The current grid has 8 cards. We need to:
1. Remove the old placeholder Hermes card
2. Add 5 new Hermes-focused cards
3. Reorganize the layout for better visual hierarchy

- [ ] **Step 1: Update the grid HTML structure**

Replace the `<main id="grid">` section (lines 259-289) with:

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

    <section class="card" id="widget-hermes-status">
      <h2>Hermes · Status</h2>
      <div class="empty">—</div>
    </section>

    <section class="card span-2" id="widget-hermes-jobs">
      <h2>Active Jobs (Cron)</h2>
      <div class="empty">loading…</div>
    </section>

    <section class="card" id="widget-hermes-skills">
      <h2>Skills</h2>
      <div class="empty">—</div>
    </section>

    <section class="card span-2" id="widget-hermes-sessions">
      <h2>Recent Sessions</h2>
      <div class="empty">loading…</div>
    </section>

    <section class="card" id="widget-hermes-analytics">
      <h2>7-Day Usage</h2>
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

- [ ] **Step 2: Verify visual layout in browser**

Load the page and check that the grid displays correctly with 10 cards in the new layout.

Expected layout (3-column grid):
```
Row 1: Weather | Todo | Hermes Status
Row 2: Active Jobs (span-2) | Skills
Row 3: Recent Sessions (span-2) | Analytics
Row 4: Projects (span-2) | Discord
Row 5: GitHub Pulse (span-2)
```

- [ ] **Step 3: Update responsive behavior if needed**

Check that the media queries (already present in the existing code) still work properly with the new card count.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: replace Hermes placeholder with 5 new live widgets in improved grid layout"
```

---

### Task 7: Add Transition & Hover Effects for Premium Feel

**Files:**
- Modify: `index.html:67-79` (card base styles)

**Context:** Enhance the existing card styles with smooth transitions and micro-interactions to achieve the Linear/Vercel premium feel.

- [ ] **Step 1: Update .card base styles with transitions**

Find the `.card` rule (around line 67) and add transitions:

```css
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
      transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .card:hover {
      border-color: var(--border-accent);
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4), 0 0 24px rgba(0, 255, 208, 0.1);
    }
```

- [ ] **Step 2: Add fade-in animation for widget content**

Add this new animation rule after the media queries section:

```css
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .card > * {
      animation: fadeIn 300ms ease-out;
    }

    /* Stagger animation for list items */
    .data-table tbody tr {
      animation: fadeIn 300ms ease-out;
    }
    .data-table tbody tr:nth-child(2) { animation-delay: 40ms; }
    .data-table tbody tr:nth-child(3) { animation-delay: 80ms; }
    .data-table tbody tr:nth-child(4) { animation-delay: 120ms; }
    .data-table tbody tr:nth-child(5) { animation-delay: 160ms; }
```

- [ ] **Step 3: Test transitions in browser**

Load the page and:
1. Hover over a card - observe the smooth border color change and shadow enhancement
2. Wait for Hermes widgets to load - observe the fade-in effect

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add smooth transitions and micro-interactions for premium feel"
```

---

## Phase 3: Widget Implementation

### Task 8: Implement Live Status Card (Gateway Status)

**Files:**
- Modify: `index.html:590-595` (add renderHermesLiveStatus function)

**Context:** The "Hermes Status" card displays gateway status, uptime, active sessions, and connected platforms. It's a compact stat-focused widget.

- [ ] **Step 1: Create HTML template for Live Status Card**

Add this function before the `renderLiveHermesWidgets()` call:

```javascript
async function renderHermesLiveStatus() {
  const el = document.getElementById('widget-hermes-status');
  const data = await fetchHermesData('/api/status', 'status');
  
  if (!data || Object.keys(data).length === 0) {
    el.innerHTML = `<h2>Hermes · Status</h2><div class="empty">no data</div>`;
    return;
  }

  const status = data.gateway_status || 'unknown';
  const uptime = data.uptime_seconds || 0;
  const uptimeStr = formatUptime(uptime);
  const sessions = data.active_sessions || 0;
  const platforms = data.connected_platforms || 0;

  const statusClass = status === 'running' ? 'active' : 'error';
  const statusText = status === 'running' ? 'Running' : 'Offline';

  el.innerHTML = `
    <h2>Hermes · Status</h2>
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
      <span class="status-badge ${statusClass}">
        <span class="status-dot ${statusClass}"></span>
        ${statusText}
      </span>
    </div>
    <div class="stat-row">
      <span class="label">Uptime</span>
      <span class="value">${uptimeStr}</span>
    </div>
    <div class="stat-row">
      <span class="label">Active Sessions</span>
      <span class="value">${sessions}</span>
    </div>
    <div class="stat-row">
      <span class="label">Platforms</span>
      <span class="value">${platforms}</span>
    </div>
    <div class="stat-row">
      <span class="label">Version</span>
      <span class="value">${data.version || '—'}</span>
    </div>
  `;
}

// Utility: Format seconds to human-readable uptime
function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}
```

- [ ] **Step 2: Update placeholder function in initHermesMode**

Replace the `renderHermesLiveStatus() {}` placeholder with the actual function from Step 1.

- [ ] **Step 3: Test the widget**

Load the page. The "Hermes Status" card should display:
- If API is live: actual gateway status, uptime, session count
- If API is offline: "Offline" badge with fallback data

Test by temporarily killing the API availability check:

```javascript
// In console:
CONFIG.hermesMode = 'static';  // Force static mode
renderHermesLiveStatus();  // Re-render
```

You should see the fallback "Offline" status.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: implement Live Status card with uptime and session metrics"
```

---

### Task 9: Implement Active Jobs Card (Cron Jobs Table)

**Files:**
- Modify: `index.html:590-595` (add renderHermesActiveJobs function)

**Context:** The "Active Jobs" card displays a table of cron jobs with name, schedule, state, last run, and next run. It's a data-dense table widget.

- [ ] **Step 1: Create HTML table template for Active Jobs**

Add this function before the `renderLiveHermesWidgets()` call:

```javascript
async function renderHermesActiveJobs() {
  const el = document.getElementById('widget-hermes-jobs');
  const data = await fetchHermesData('/api/cron/jobs', 'jobs');
  
  if (!data || !data.jobs || data.jobs.length === 0) {
    el.innerHTML = `<h2>Active Jobs (Cron)</h2><div class="empty">no jobs</div>`;
    return;
  }

  const jobs = data.jobs.slice(0, 8);  // Limit to 8 rows for space
  const rows = jobs.map(job => {
    const lastRun = job.last_run ? new Date(job.last_run).toLocaleTimeString() : '—';
    const nextRun = job.next_run ? new Date(job.next_run).toLocaleTimeString() : '—';
    const stateClass = job.state === 'running' ? 'active' : (job.state === 'idle' ? 'idle' : 'error');
    
    return `
      <tr>
        <td>${job.name}</td>
        <td style="font-size: 12px;">${job.schedule || '—'}</td>
        <td><span class="status-badge ${stateClass}">${job.state}</span></td>
        <td style="text-align: right; font-size: 12px;">${lastRun}</td>
        <td style="text-align: right; font-size: 12px;">${nextRun}</td>
      </tr>
    `;
  }).join('');

  el.innerHTML = `
    <h2>Active Jobs (Cron)</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Schedule</th>
          <th>State</th>
          <th style="text-align: right;">Last Run</th>
          <th style="text-align: right;">Next Run</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}
```

- [ ] **Step 2: Update placeholder function in initHermesMode**

Replace the `renderHermesActiveJobs() {}` placeholder with the actual function.

- [ ] **Step 3: Test the widget**

Load the page. The "Active Jobs" card should display a table with cron job details.

Test with mock data:

```javascript
// In console:
const mockJobs = {
  jobs: [
    { id: '1', name: 'sync_db', schedule: '*/5 * * * *', state: 'idle', last_run: new Date().toISOString(), next_run: new Date(Date.now() + 300000).toISOString() },
    { id: '2', name: 'backup', schedule: '0 2 * * *', state: 'idle', last_run: new Date(Date.now() - 3600000).toISOString(), next_run: new Date(Date.now() + 86400000).toISOString() },
  ]
};
CONFIG.hermesStatic.jobs = mockJobs;
renderHermesActiveJobs();
```

You should see a table with two jobs.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: implement Active Jobs card with cron schedule table"
```

---

### Task 10: Implement Recent Sessions Card

**Files:**
- Modify: `index.html:590-595` (add renderHermesRecentSessions function)

**Context:** The "Recent Sessions" card shows the last 5 sessions with model, message count, time ago, and a preview of the first message.

- [ ] **Step 1: Create HTML template for Recent Sessions**

Add this function before the `renderLiveHermesWidgets()` call:

```javascript
async function renderHermesRecentSessions() {
  const el = document.getElementById('widget-hermes-sessions');
  const data = await fetchHermesData('/api/sessions', 'sessions');
  
  if (!data || !data.sessions || data.sessions.length === 0) {
    el.innerHTML = `<h2>Recent Sessions</h2><div class="empty">no sessions</div>`;
    return;
  }

  const sessions = data.sessions.slice(0, 5);  // Last 5 sessions
  const rows = sessions.map(session => {
    const createdTime = new Date(session.created_at);
    const timeAgo = formatTimeAgo(createdTime);
    const model = session.model.replace('claude-', '').replace('claude', 'claude');
    const msgCount = session.message_count || 0;
    const preview = (session.preview || '—').substring(0, 40);
    
    return `
      <div class="stat-row">
        <div>
          <div style="color: var(--accent); font-weight: 600;">${model}</div>
          <div style="font-size: 12px; color: var(--fg-dim); margin-top: 2px;">${preview}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 600;">${msgCount}</div>
          <div style="font-size: 12px;">${timeAgo}</div>
        </div>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <h2>Recent Sessions</h2>
    <div style="display: flex; flex-direction: column; gap: 4px;">
      ${rows}
    </div>
  `;
}

// Utility: Format date to "X minutes ago" / "X hours ago"
function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}
```

- [ ] **Step 2: Update placeholder function in initHermesMode**

Replace the `renderHermesRecentSessions() {}` placeholder with the actual function.

- [ ] **Step 3: Test the widget**

Load the page. The "Recent Sessions" card should display recent sessions with model, message count, and time elapsed.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: implement Recent Sessions card with model and message previews"
```

---

### Task 11: Implement Analytics Sparkline Card (7-Day Usage)

**Files:**
- Modify: `index.html:590-595` (add renderHermesAnalytics function)

**Context:** The "7-Day Usage" card displays token usage over the past 7 days as:
1. A sparkline using Unicode block characters (▁▂▃▄▅▆▇█)
2. A stat row showing total tokens and cost

- [ ] **Step 1: Create sparkline utility function**

Add this function before the widget renderers:

```javascript
// Convert array of values to Unicode sparkline
function sparklineUnicode(values, maxHeight = 4) {
  if (!values || values.length === 0) return '';
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const max = Math.max(...values);
  if (max === 0) return values.map(() => blocks[0]).join('');
  
  return values.map(v => {
    const level = Math.round((v / max) * (blocks.length - 1));
    return blocks[Math.max(0, Math.min(level, blocks.length - 1))];
  }).join('');
}
```

- [ ] **Step 2: Create HTML template for Analytics**

Add this function before the `renderLiveHermesWidgets()` call:

```javascript
async function renderHermesAnalytics() {
  const el = document.getElementById('widget-hermes-analytics');
  const data = await fetchHermesData('/api/analytics/usage?days=7', 'analytics');
  
  if (!data || !data.usage || data.usage.length === 0) {
    el.innerHTML = `<h2>7-Day Usage</h2><div class="empty">no data</div>`;
    return;
  }

  const usage = data.usage.slice(0, 7);  // Last 7 days
  const tokensIn = usage.map(u => u.tokens_in || 0);
  const tokensOut = usage.map(u => u.tokens_out || 0);
  const costs = usage.map(u => u.cost_usd || 0);

  const sparklineIn = sparklineUnicode(tokensIn);
  const sparklineOut = sparklineUnicode(tokensOut);
  const totalIn = tokensIn.reduce((a, b) => a + b, 0);
  const totalOut = tokensOut.reduce((a, b) => a + b, 0);
  const totalCost = costs.reduce((a, b) => a + b, 0);

  el.innerHTML = `
    <h2>7-Day Usage</h2>
    <div class="stat-row">
      <span class="label">Tokens In</span>
      <span class="value">${(totalIn / 1000).toFixed(1)}K</span>
    </div>
    <div style="margin: 6px 0; font-family: var(--font-mono); font-size: 14px; color: rgba(0, 255, 208, 0.7);">${sparklineIn}</div>
    <div class="stat-row">
      <span class="label">Tokens Out</span>
      <span class="value">${(totalOut / 1000).toFixed(1)}K</span>
    </div>
    <div style="margin: 6px 0; font-family: var(--font-mono); font-size: 14px; color: rgba(0, 255, 208, 0.5);">${sparklineOut}</div>
    <div class="stat-row">
      <span class="label">7-Day Cost</span>
      <span class="value">$${totalCost.toFixed(2)}</span>
    </div>
  `;
}
```

- [ ] **Step 3: Update placeholder function in initHermesMode**

Replace the `renderHermesAnalytics() {}` placeholder with the actual function.

- [ ] **Step 4: Test the widget**

Load the page. The "7-Day Usage" card should display:
- Sparkline for tokens in (higher blocks = more usage)
- Sparkline for tokens out
- Total token counts and 7-day cost

Test sparkline with mock data:

```javascript
// In console:
const mockAnalytics = {
  usage: [
    { date: '2026-05-28', tokens_in: 42000, tokens_out: 31000, cost_usd: 0.85 },
    { date: '2026-05-29', tokens_in: 55000, tokens_out: 48000, cost_usd: 1.12 },
    { date: '2026-05-30', tokens_in: 38000, tokens_out: 29000, cost_usd: 0.78 },
    { date: '2026-05-31', tokens_in: 72000, tokens_out: 65000, cost_usd: 1.45 },
    { date: '2026-06-01', tokens_in: 61000, tokens_out: 54000, cost_usd: 1.28 },
    { date: '2026-06-02', tokens_in: 48000, tokens_out: 42000, cost_usd: 0.98 },
    { date: '2026-06-03', tokens_in: 51000, tokens_out: 46000, cost_usd: 1.05 },
  ]
};
CONFIG.hermesStatic.analytics = mockAnalytics;
renderHermesAnalytics();
```

You should see a sparkline chart.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: implement Analytics card with 7-day usage sparklines"
```

---

### Task 12: Implement Skills Status Card

**Files:**
- Modify: `index.html:590-595` (add renderHermesSkills function)

**Context:** The "Skills" card shows installed skills and their active/inactive status. Simple count-based display with a small list.

- [ ] **Step 1: Create HTML template for Skills Status**

Add this function before the `renderLiveHermesWidgets()` call:

```javascript
async function renderHermesSkills() {
  const el = document.getElementById('widget-hermes-skills');
  const data = await fetchHermesData('/api/skills', 'skills');
  
  if (!data || !data.skills || data.skills.length === 0) {
    el.innerHTML = `<h2>Skills</h2><div class="empty">no skills</div>`;
    return;
  }

  const skills = data.skills;
  const activeCount = skills.filter(s => s.status === 'active').length;
  const totalCount = skills.length;
  const skillList = skills.slice(0, 4).map(skill => {
    const statusClass = skill.status === 'active' ? 'active' : 'idle';
    return `
      <div class="stat-row">
        <span class="label">${skill.name}</span>
        <span class="status-badge ${statusClass}" style="font-size: 11px;">${skill.status}</span>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <h2>Skills</h2>
    <div style="padding: 8px 0; margin-bottom: 8px; border-bottom: 1px solid var(--border);">
      <div style="font-size: 24px; font-weight: 700; color: var(--accent);">${activeCount}/${totalCount}</div>
      <div style="font-size: 12px; color: var(--fg-dim);">active</div>
    </div>
    <div>
      ${skillList}
    </div>
  `;
}
```

- [ ] **Step 2: Update placeholder function in initHermesMode**

Replace the `renderHermesSkills() {}` placeholder with the actual function.

- [ ] **Step 3: Test the widget**

Load the page. The "Skills" card should display:
- A count of active skills (e.g., "2/5")
- A list of the first 4 skills with status badges

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: implement Skills Status card with active count and list"
```

---

## Phase 4: Integration & Polish

### Task 13: Wire Up Auto-Refresh for Live Mode

**Files:**
- Modify: `index.html:340-365` (initHermesMode and refreshHermesWidgets)

**Context:** In LIVE mode, widgets should auto-refresh every 10 seconds. Implement the refresh loop with error recovery.

- [ ] **Step 1: Implement robust refresh loop**

Replace the `refreshHermesWidgets` function with:

```javascript
async function refreshHermesWidgets() {
  if (HERMES_MODE !== 'live') return;  // Don't refresh in static mode
  
  try {
    await Promise.all([
      renderHermesLiveStatus(),
      renderHermesActiveJobs(),
      renderHermesRecentSessions(),
      renderHermesAnalytics(),
      renderHermesSkills(),
    ]);
  } catch (e) {
    console.error('[Hermes] Refresh failed:', e.message);
    // Don't show error UI; silently fail and retry on next interval
  }
}
```

- [ ] **Step 2: Update initHermesMode to start refresh interval**

Modify the initHermesMode function's interval setup:

```javascript
(async function initHermesMode() {
  const isAvailable = await HermesAPI.checkAvailability();
  HERMES_MODE = isAvailable ? 'live' : 'static';
  CONFIG.hermesMode = HERMES_MODE;
  console.log(`[Hermes] Mode: ${HERMES_MODE}`);
  
  // Render Hermes widgets after mode is determined
  await renderHermesLiveStatus();
  await renderHermesActiveJobs();
  await renderHermesRecentSessions();
  await renderHermesAnalytics();
  await renderHermesSkills();
  
  // Start auto-refresh if in live mode
  if (HERMES_MODE === 'live') {
    console.log(`[Hermes] Starting auto-refresh every ${CONFIG.hermesRefreshMs}ms`);
    setInterval(refreshHermesWidgets, CONFIG.hermesRefreshMs);
  }
})();
```

- [ ] **Step 3: Test auto-refresh**

Load the page in live mode and monitor the console:

```javascript
// In console, watch for refresh logs:
// [Hermes] Mode: live
// [Hermes] Starting auto-refresh every 10000ms
```

Wait 10 seconds and observe that the widgets update automatically.

- [ ] **Step 4: Test error recovery**

Temporarily break the API:

```javascript
// In console:
CONFIG.hermesApiHost = 'http://bad-host:9999';

// Wait 10 seconds for refresh cycle
// The widgets should still display cached data from previous successful fetch
// Check console for [Hermes] Fetch failed: ... warnings
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: implement 10-second auto-refresh for live Hermes widgets"
```

---

### Task 14: Graceful Fallback for Static Mode & Offline Detection

**Files:**
- Modify: `index.html:400-410` (HermesAPI.checkAvailability)
- Modify: `index.html:340-365` (initHermesMode)

**Context:** If the Hermes API is unreachable on initial load (e.g., user is off WiFi), all Hermes widgets should display fallback data with a subtle indication they're in offline mode. Allow users to manually retry.

- [ ] **Step 1: Add manual retry button for static mode**

Create a new function to render a fallback UI:

```javascript
function renderHermesOfflineNotice() {
  const statusCard = document.getElementById('widget-hermes-status');
  if (statusCard && HERMES_MODE === 'static') {
    // Add a subtle "offline" indicator to the status card
    const notice = document.createElement('div');
    notice.style.cssText = 'font-size: 11px; color: var(--danger); text-transform: uppercase; letter-spacing: 1px; margin-top: 8px; opacity: 0.7;';
    notice.textContent = '⬤ offline mode';
    statusCard.appendChild(notice);
  }
}
```

Call this after rendering in static mode:

```javascript
(async function initHermesMode() {
  const isAvailable = await HermesAPI.checkAvailability();
  HERMES_MODE = isAvailable ? 'live' : 'static';
  CONFIG.hermesMode = HERMES_MODE;
  console.log(`[Hermes] Mode: ${HERMES_MODE}`);
  
  // Render Hermes widgets after mode is determined
  await renderHermesLiveStatus();
  await renderHermesActiveJobs();
  await renderHermesRecentSessions();
  await renderHermesAnalytics();
  await renderHermesSkills();
  
  // Show offline notice if in static mode
  if (HERMES_MODE === 'static') {
    renderHermesOfflineNotice();
  }
  
  // Start auto-refresh if in live mode
  if (HERMES_MODE === 'live') {
    console.log(`[Hermes] Starting auto-refresh every ${CONFIG.hermesRefreshMs}ms`);
    setInterval(refreshHermesWidgets, CONFIG.hermesRefreshMs);
  }
})();
```

- [ ] **Step 2: Test static mode fallback**

Simulate API being unreachable:

```javascript
// Before page loads, modify:
CONFIG.hermesApiHost = 'http://192.168.1.1:9999';  // Unreachable IP

// Reload the page
// All Hermes widgets should display fallback data
// Status card should show "⬅ offline mode"
```

Reset:
```javascript
CONFIG.hermesApiHost = 'http://192.168.1.30:9119';
```

- [ ] **Step 3: Add optional manual retry mechanism (stretch goal)**

Optional: Add a console command for manual retry:

```javascript
window.retryHermesConnection = async function() {
  console.log('[Hermes] Attempting manual retry...');
  const isAvailable = await HermesAPI.checkAvailability();
  if (isAvailable) {
    HERMES_MODE = 'live';
    CONFIG.hermesMode = 'live';
    console.log('[Hermes] Connection restored! Switching to LIVE mode.');
    await refreshHermesWidgets();
    setInterval(refreshHermesWidgets, CONFIG.hermesRefreshMs);
  } else {
    console.log('[Hermes] Still unavailable.');
  }
};
```

Users can call `retryHermesConnection()` in the console to retry.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add graceful offline fallback and offline mode indicator"
```

---

### Task 15: Full Integration Test & Verification

**Files:**
- No file changes; testing only

**Context:** Test the complete flow: LIVE mode with real API, STATIC mode offline, error handling, auto-refresh, responsive layout on iPad.

- [ ] **Step 1: Test LIVE mode (if Hermes API available)**

Prerequisites: Hermes API running at http://192.168.1.30:9119

Load the page:
```
Expected observations:
- Console shows: [Hermes] Mode: live
- All Hermes widgets populate with real data
- Status card shows "Running" with correct uptime
- Jobs table displays cron jobs
- Recent sessions show actual sessions
- Analytics sparklines render
- Skills show active count
- Every 10 seconds, widgets update silently
```

- [ ] **Step 2: Test STATIC mode (Hermes API unavailable)**

Temporarily set unreachable API:

```javascript
CONFIG.hermesApiHost = 'http://bad-host:9999';
location.reload();
```

Expected observations:
```
- Console shows: [Hermes] Mode: static
- All Hermes widgets show fallback data
- Status card shows "Offline" badge
- Jobs table shows 1 placeholder job
- No auto-refresh occurs
- Page is fully functional (weather, projects, GitHub, etc. work)
```

- [ ] **Step 3: Test error recovery (mid-flight API failure)**

Start in LIVE mode, then:

```javascript
// Simulate API going down after initial load
CONFIG.hermesApiHost = 'http://bad-host:9999';

// Wait for next auto-refresh (10 seconds)
// Expected: Widgets continue to display last cached data
// Console shows [Hermes] Fetch failed warnings
// No UI errors or blank widgets
```

- [ ] **Step 4: Test responsive layout on iPad (or with dev tools)**

Open DevTools → Device toolbar → iPad (landscape & portrait)

Verify:
- Grid adjusts correctly (2-column in portrait, 3-column in landscape)
- Touch targets remain ≥44px for buttons/inputs
- Text is readable without zooming
- No horizontal scroll

- [ ] **Step 5: Test performance (watch network & CPU)**

In DevTools Network tab, verify:
- First load: ~5 requests (index.html + external API calls)
- Auto-refresh: 5 GET requests to /api/* endpoints every 10 seconds
- No request duplication or rate-limiting issues
- Each request completes within 5 seconds

- [ ] **Step 6: Test data consistency across widgets**

Verify that if two widgets fetch the same endpoint, they:
- Use the same cached data (no duplicate requests)
- Update at the same time (same 10-second cycle)

Example: if two widgets both fetch `/api/status`, they should only make one request per cycle.

- [ ] **Step 7: Verify widget graceful degradation**

Simulate partial API failure:

```javascript
// Override HermesAPI to fail specific endpoints
const originalFetch = HermesAPI.fetch;
HermesAPI.fetch = async (endpoint) => {
  if (endpoint === '/api/cron/jobs') {
    return { ok: false, error: 'Simulated error' };
  }
  return originalFetch.call(HermesAPI, endpoint);
};

// Wait for next auto-refresh
// Expected: Jobs widget shows "no data", other widgets still render correctly
```

- [ ] **Step 8: Commit final state (no code changes)**

```bash
git status
# Should show no uncommitted changes (all were committed in previous tasks)
git log --oneline -10
# Should show all 8 commits from Phase 1-4
```

---

## Final Checklist

- [ ] All 15 tasks completed and committed
- [ ] LIVE mode works with real Hermes API (if available)
- [ ] STATIC mode with fallback data works offline
- [ ] Auto-refresh cycles every 10 seconds (LIVE mode)
- [ ] All 5 new Hermes widgets render correctly
- [ ] Premium CSS design applied (Linear/Vercel style)
- [ ] Tables, sparklines, and status badges display properly
- [ ] Responsive layout works on iPad landscape/portrait
- [ ] Error handling is graceful (no crashes, no blank widgets)
- [ ] All code commits are atomic and logical
- [ ] No broken references or console errors
- [ ] Single HTML file with embedded CSS/JS (no build step)

---

## Notes for Implementation

### AbortSignal.timeout() Browser Support
The code uses `AbortSignal.timeout()` which is relatively new (2024). If targeting older browsers:

```javascript
// Fallback for older browsers:
function createTimeoutSignal(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, id };
}

// Then in HermesAPI.fetch:
const { signal, id } = createTimeoutSignal(5000);
try {
  const res = await fetch(url, { method: 'GET', signal });
  clearTimeout(id);
  // ...
} catch (e) {
  clearTimeout(id);
  // ...
}
```

### iPad Safari Touch Optimization (already in place)
- Font size ≥16px on inputs (prevents zoom-on-focus)
- 44px+ touch targets for buttons
- `-webkit-tap-highlight-color: transparent` (remove tap flash)
- Pointer media query for iPad-specific styles

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Page Load                                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │ initHermesMode()     │
          │ Check API            │
          │ availability (2s     │
          │ timeout)             │
          └──────────┬───────────┘
                     │
         ┌───────────┴──────────┐
         │                      │
         ▼                      ▼
    ┌─────────┐        ┌──────────────┐
    │  LIVE   │        │   STATIC     │
    │  Mode   │        │    Mode      │
    └────┬────┘        └──────┬───────┘
         │                    │
         ▼                    ▼
    Render Hermes      Render Fallback
    from API            Data (local)
         │                    │
         │                    │
         ▼                    ▼
    Start 10s           No Auto-Refresh
    Auto-Refresh
         │
         ├─► Every 10s:
         │   - fetch /api/status
         │   - fetch /api/cron/jobs
         │   - fetch /api/sessions
         │   - fetch /api/analytics/usage
         │   - fetch /api/skills
         │
         └─► Update all widgets
             (cache on success,
              fallback to cached
              data on failure)
```

---

## Execution Path

This plan is designed for **subagent-driven development**:

1. **Subagent processes each task independently** (Task 1, Task 2, etc.)
2. **Review checkpoint after each task** — verify the changes don't break existing widgets
3. **Parallel execution possible** — Phase 3 tasks (widgets 8-12) are largely independent

**Recommended execution order:**
- Phase 1: Tasks 1-4 (foundation)
- Phase 2: Tasks 5-7 (styling & layout)
- Phase 3: Tasks 8-12 (parallel or sequential)
- Phase 4: Tasks 13-15 (integration)

**Estimated effort:** ~45-60 minutes for experienced developer, ~90-120 minutes for careful implementation with testing.

