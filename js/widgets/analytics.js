import { API } from '../lib/api.js';

const SPARK_CHARS = '▁▂▃▄▅▆▇█';

function formatTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function render(el, data) {
  let totalIn = 0, totalOut = 0;
  if (Array.isArray(data.daily)) {
    for (const day of data.daily) {
      totalIn  += day.inputTokens  || 0;
      totalOut += day.outputTokens || 0;
    }
  }
  const totalSessions = data.sessionCount || 0;

  let spark = SPARK_CHARS;
  if (Array.isArray(data.daily)) {
    const max = Math.max(...data.daily.map(d => (d.inputTokens || 0) + (d.outputTokens || 0)));
    spark = data.daily.map(d => {
      const total = (d.inputTokens || 0) + (d.outputTokens || 0);
      if (max === 0) return SPARK_CHARS[0];
      const i = Math.min(Math.ceil((total / max) * 8), 8);
      return SPARK_CHARS[i] || SPARK_CHARS[0];
    }).join('');
  }

  el.innerHTML = `
    <h2>Usage Analytics · 7 days</h2>
    <div style="display:flex;gap:20px;align-items:flex-start;">
      <div>
        <div class="sparkline">${spark}</div>
        <div style="font-size:12px;color:var(--fg-dim);margin-top:8px;">
          ${formatTokens(totalIn)} in / ${formatTokens(totalOut)} out
        </div>
      </div>
      <div style="flex:1;">
        <div class="stat-row">
          <span class="label">sessions</span>
          <span class="value">${totalSessions}</span>
        </div>
      </div>
    </div>
  `;
}

export async function mountAnalytics() {
  const el = document.getElementById('widget-analytics');
  const data = await API.get('/api/analytics/usage?days=7');
  if (!data || !API.live) {
    el.innerHTML = `<h2>Usage Analytics</h2><div class="empty">—</div>`;
    return;
  }
  render(el, data);
}

export async function refreshAnalytics() {
  const el = document.getElementById('widget-analytics');
  if (!el) return;
  const data = await API.get('/api/analytics/usage?days=7');
  if (data) render(el, data);
}
