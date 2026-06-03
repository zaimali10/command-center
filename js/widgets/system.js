import { API } from '../lib/api.js';
import { CONFIG } from '../lib/config.js';

function renderFallback(el) {
  const h = CONFIG.hermes;
  const dotClass = h.status === 'online' ? 'green' : 'red';
  el.innerHTML = `
    <h2>System</h2>
    <div class="stat-row">
      <span class="label">gateway</span>
      <span class="badge"><span class="badge-dot ${dotClass}"></span><span>${h.status}</span></span>
    </div>
    <div class="stat-row">
      <span class="label">discord</span>
      <span class="badge"><span class="badge-dot gray"></span><span>offline</span></span>
    </div>
    <div class="stat-row"><span class="label">sessions</span><span class="value">0</span></div>
    <div class="stat-row"><span class="label">version</span><span class="value">v1.0.0</span></div>
  `;
}

function renderLive(el, data) {
  const gatewayDot = data.gateway_state === 'running' ? 'green' : 'red';
  const discordDot = data.gateway_platforms?.discord?.state === 'connected' ? 'green' : 'red';
  el.innerHTML = `
    <h2>System</h2>
    <div class="stat-row">
      <span class="label">gateway</span>
      <span class="badge"><span class="badge-dot ${gatewayDot}"></span><span>${data.gateway_state || 'offline'}</span></span>
    </div>
    <div class="stat-row">
      <span class="label">discord</span>
      <span class="badge"><span class="badge-dot ${discordDot}"></span><span>${data.gateway_platforms?.discord?.state || 'offline'}</span></span>
    </div>
    <div class="stat-row"><span class="label">sessions</span><span class="value">${data.active_sessions || 0}</span></div>
    <div class="stat-row"><span class="label">version</span><span class="value">${data.version || 'v1.0.0'}</span></div>
  `;
}

export async function mountSystem() {
  const el = document.getElementById('widget-system');
  const data = await API.get('/api/status');
  if (data && API.live) renderLive(el, data);
  else renderFallback(el);
}

export async function refreshSystem() {
  const el = document.getElementById('widget-system');
  if (!el) return;
  const data = await API.get('/api/status');
  if (data) renderLive(el, data);
}
