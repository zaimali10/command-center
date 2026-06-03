import { API } from '../lib/api.js';

function render(el, data) {
  const list = data.sessions || [];
  if (list.length === 0) {
    el.innerHTML = `<h2>Recent Sessions</h2><div class="empty">no sessions</div>`;
    return;
  }
  const recent = list.slice(0, 5).map(s => `
    <div class="stat-row">
      <span class="label">${s.model || 'unknown'}</span>
      <span class="value">${s.messages || 0}m · ${s.timeAgo || '—'}</span>
    </div>
  `).join('');
  el.innerHTML = `<h2>Recent Sessions</h2>${recent}`;
}

export async function mountSessions() {
  const el = document.getElementById('widget-sessions');
  const data = await API.get('/api/sessions');
  if (!data || !API.live) {
    el.innerHTML = `<h2>Recent Sessions</h2><div class="empty">—</div>`;
    return;
  }
  render(el, data);
}

export async function refreshSessions() {
  const el = document.getElementById('widget-sessions');
  if (!el) return;
  const data = await API.get('/api/sessions');
  if (data) render(el, data);
}
