# Command Center — Bug Fixes + Feature Push

## Current State

**Serving on:** `:8080` via `serve.py` (React `dist/`)
**Hermes dashboard:** `:9119` (authenticated)
**Telemetry:** ✅ `/data/telemetry.json` served locally
**Console errors:** 0 ✅

---

## Phase A — Fix Broken API Endpoints

11 of 14 widgets are broken because they proxy to Hermes API routes that don't exist.

### A1 — Fix widgets that CAN use real Hermes data

| Widget | Current endpoint | Real Hermes endpoint |
|--------|-----------------|---------------------|
| System Info | `/api/system` | `/api/status` — returns CPU, memory, uptime |
| Health | `/api/health` | `/api/status` |
| Skills | `/api/skills` | ✅ already works (200) |
| Sessions | `/api/sessions` | ✅ already works (200) |
| Analytics | `/api/analytics` | `/api/status` (use parts of it) |

**Fix:** Update these widgets to hit actual Hermes dashboard routes. The serve.py already proxies `/api/*` → `:9119`.

### A2 — Add local data sources for the rest

Widgets that need NEW data sources (no Hermes equivalent):

| Widget | Approach |
|--------|----------|
| **Weather** | Add `/api/weather` handler in `serve.py` that calls OpenWeatherMap API (store key in `.env` or config) |
| **Forecast** | Same source, 3-day projection |
| **Cron Jobs** | List cron jobs via `hermes cron list` CLI call or read from cron DB |
| **GitHub Pulse** | `gh` CLI or GitHub REST API — recent PRs, issues, stars |
| **Projects** | Read from `~/Projects/` directory + `.git` info |
| **Todo** | Read/write to a local JSON file under `/data/` |
| **Kanban** | Read/write to a local JSON file under `/data/` |

**For MVP:** Add a `/data/` JSON file generator — either a cron job or a boot-time script that populates all static data. Then widgets fetch from `/data/<widget>.json` instead of going through the API proxy.

### A3 — Fix Mode Indicator

Banner shows hardcoded `"STATIC"` — should read from the Hermes dashboard or a config value.

---

## Phase B — New Features & Tools

### B1 — Real Weather Data

- Add OpenWeatherMap API key to environment config
- Create cron job: `hermes cron create --name weather-poller --schedule '*/30 * * * *' --no-agent --script scripts/poll-weather.sh`
- Poller writes to `/data/weather.json`
- Weather + Forecast widgets read from there

### B2 — Working Todo Widget

- Client-side: Add/remove/complete items stored in `/data/todo.json`
- serve.py serves `POST /api/todo` for persistence
- Add drag-to-reorder (dnd-kit already imported)

### B3 — Kanban Board

- Three columns: Backlog, In Progress, Done
- dnd-kit for drag between columns
- Persisted to `/data/kanban.json`
- Write via cron or direct API

### B4 — Grocery / Shopping List

- Quick-add items with checkboxes
- Categorized (Produce, Dairy, Meat, Pantry)
- Persisted to `/data/grocery.json`

### B5 — Dashboard Polish

- Per-core CPU sparklines in Monitor widget
- Dark mode toggle persistence
- Clock auto-updates every second (currently static on load)
- iPad-optimized touch targets

---

## Phase C — ESP32-S3 Voice Nodes

(Deferred until after Phases A & B)
- Flash firmware for INMP441 mic → MAX98357 speaker pipeline
- Wake-word detection
- Hermes voice gateway integration

---

## Execution Order

```
1. Fix broken widget endpoints   ← highest priority, app is mostly broken
2. Fix mode indicator
3. Add weather data source
4. Working Todo widget
5. Kanban board
6. Polish (clock, sparklines, dark mode persistence)
7. Grocery list
```

## Claude Code Prompt Strategy

Use file-based heredoc for all Claude Code prompts to avoid backtick quoting bugs:

```bash
cat > /tmp/prompt.txt << 'EOF'
<instructions>
EOF
claude -p "$(cat /tmp/prompt.txt)" --print
```

Keep prompts focused on ONE phase at a time to maximize throughput within usage limits.
