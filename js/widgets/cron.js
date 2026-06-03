import { API } from '../lib/api.js';

function render(el, data) {
  if (!Array.isArray(data) || data.length === 0) {
    el.innerHTML = `<h2>Cron Jobs</h2><div class="empty">no scheduled jobs</div>`;
    return;
  }
  const rows = data.map(job => `
    <tr>
      <td>${job.name || '—'}</td>
      <td>${job.state || '—'}</td>
      <td>${job.schedule || '—'}</td>
      <td>${job.lastRun || '—'}</td>
    </tr>
  `).join('');
  el.innerHTML = `
    <h2>Cron Jobs</h2>
    <table class="widget-table">
      <tr><td>Job</td><td>State</td><td>Schedule</td><td>Last Run</td></tr>
      ${rows}
    </table>
  `;
}

export async function mountCron() {
  const el = document.getElementById('widget-cron');
  const data = await API.get('/api/cron/jobs');
  if (!data || !API.live) {
    el.innerHTML = `<h2>Cron Jobs</h2><div class="empty">—</div>`;
    return;
  }
  render(el, data);
}

export async function refreshCron() {
  const el = document.getElementById('widget-cron');
  if (!el) return;
  const data = await API.get('/api/cron/jobs');
  if (Array.isArray(data)) render(el, data);
}
