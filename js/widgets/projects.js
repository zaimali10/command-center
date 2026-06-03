import { CONFIG } from '../lib/config.js';

export function mountProjects() {
  const el = document.getElementById('widget-projects');
  const cards = CONFIG.projects.map(p => `
    <a class="proj" href="https://github.com/${p.repo}" target="_blank" rel="noopener">
      <div class="proj-label">${p.label}</div>
      <div class="proj-desc">${p.desc}</div>
      <div class="proj-cta">open ↗</div>
    </a>
  `).join('');
  el.innerHTML = `<h2>Projects</h2><div class="proj-row">${cards}</div>`;
}
