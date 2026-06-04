import React, { useState, useEffect } from 'react';
import { CONFIG } from '../../lib/config.js';

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
    if (n === 0) return { char: '▯', cls: 'lo' };
    if (n < 3)   return { char: '▮', cls: 'mid' };
    return { char: '▮', cls: 'hi' };
  });
}

export default function Github() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      try {
        const res = await fetch(
          `https://api.github.com/users/${encodeURIComponent(CONFIG.githubUser)}/events/public`,
          { headers: { Accept: 'application/vnd.github+json' } }
        );
        if (!res.ok) throw new Error('http ' + res.status);
        const data = await res.json();
        if (!cancelled) setEvents(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }

    fetchEvents();
    const interval = setInterval(fetchEvents, CONFIG.githubRefreshMs);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (error) return <div className="gh-err">github pulse unavailable</div>;
  if (!events) return <div className="empty">loading…</div>;

  const spark = buildSpark(events);
  const recent = events.slice(0, 5);

  return (
    <>
      <div>
        <span className="gh-spark">
          {spark.map((s, i) => <span key={i} className={s.cls}>{s.char}</span>)}
        </span>
        <span className="gh-count">{events.length} events / 14d</span>
      </div>
      <div className="gh-events">
        {recent.length === 0
          ? <div style={{ color: 'var(--fg-dim)' }}>no recent activity</div>
          : recent.map((ev, i) => (
            <div key={ev.id || i} className="gh-event">
              <span className="gh-verb">{VERB[ev.type] || ev.type.replace('Event', '').toLowerCase()}</span>
              <span className="gh-repo">{shortRepo(ev.repo.name)}</span>
              <span className="gh-when">{relTime(ev.created_at)}</span>
            </div>
          ))
        }
      </div>
    </>
  );
}
