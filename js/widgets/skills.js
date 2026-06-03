import { API } from '../lib/api.js';

function render(el, data) {
  if (!Array.isArray(data) || data.length === 0) {
    el.innerHTML = `<h2>Skills</h2><div class="empty">no skills</div>`;
    return;
  }
  const enabled = data.filter(s => s.enabled).length;
  const total = data.length;
  const names = data.filter(s => s.enabled).slice(0, 5).map(s => s.name).join(', ');
  el.innerHTML = `
    <h2>Skills</h2>
    <div class="stat-row">
      <span class="label">enabled</span>
      <span class="value">${enabled} / ${total}</span>
    </div>
    <div style="font-size:12px;color:var(--fg-dim);margin-top:8px;word-break:break-word;">
      ${names || 'none'}
    </div>
  `;
}

export async function mountSkills() {
  const el = document.getElementById('widget-skills');
  const data = await API.get('/api/skills');
  if (!data || !API.live) {
    el.innerHTML = `<h2>Skills</h2><div class="empty">—</div>`;
    return;
  }
  render(el, data);
}

export async function refreshSkills() {
  const el = document.getElementById('widget-skills');
  if (!el) return;
  const data = await API.get('/api/skills');
  if (Array.isArray(data)) render(el, data);
}
