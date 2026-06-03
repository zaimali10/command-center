import { CONFIG } from '../lib/config.js';

const VERB = {
  PushEvent:          'push',
  PullRequestEvent:   'PR',
  IssuesEvent:        'issue',
  CreateEvent:        'create',
  DeleteEvent:        'delete',
  WatchEvent:         'star',
  ForkEvent:          'fork',
  ReleaseEvent:       'release',
  CommitCommentEvent: 'comment',
  IssueCommentEvent:  'comment',
};

function relTime(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function shortRepo(full) {
  const i = full.indexOf('/');
  return i >= 0 ? full.slice(i + 1) : full;
}

function buildSpark(events) {
  const days = 14;
  const buckets = new Array(days).fill(0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const ev of events) {
    const d = new Date(ev.created_at); d.setHours(0, 0, 0, 0);
    const idx = days - 1 - Math.floor((today - d) / 86400000);
    if (idx >= 0 && idx < days) buckets[idx]++;
  }
  return buckets.map(n => {
    if (n === 0) return `<span class="lo">▯</span>`;
    if (n < 3)   return `<span class="mid">▮</span>`;
    return `<span class="hi">▮</span>`;
  }).join('');
}

export function mountGithub() {
  const el = document.getElementById('widget-github');

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
        <span class="gh-verb">${VERB[ev.type] || ev.type.replace('Event', '').toLowerCase()}</span>
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
}
