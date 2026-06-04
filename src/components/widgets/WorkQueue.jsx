import React, { useState, useEffect } from 'react';

function statusDot(s) {
  const cls = s === 'running' ? 'wq-dot wq-running' :
              s === 'done'    ? 'wq-dot wq-done' :
              s === 'failed'  ? 'wq-dot wq-failed' :
                                'wq-dot wq-waiting';
  return <span className={cls} />;
}

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function shortTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export default function WorkQueue() {
  const [queueData, setQueueData] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const [cronData, setCronData] = useState(null);
  const [qError, setQError] = useState(null);
  const [lError, setLError] = useState(null);
  const [cError, setCError] = useState(null);

  // Poll work-queue.json
  useEffect(() => {
    let cancelled = false;
    function poll() {
      fetch('/data/work-queue.json?' + Date.now())
        .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then(d => { if (!cancelled) { setQueueData(d); setQError(null); } })
        .catch(e => { if (!cancelled) setQError(e.message); });
    }
    poll();
    const t = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Poll auto-builder.log
  useEffect(() => {
    let cancelled = false;
    function pollLog() {
      fetch('/data/auto-builder.log?' + Date.now())
        .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
        .then(text => {
          if (cancelled) return;
          const lines = text.trim().split('\n').filter(Boolean);
          setLogLines(lines.slice(-15));
          setLError(null);
        })
        .catch(e => { if (!cancelled) setLError(e.message); });
    }
    pollLog();
    const t = setInterval(pollLog, 10_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Poll cron jobs
  useEffect(() => {
    let cancelled = false;
    function pollCron() {
      fetch('/api/cron/jobs')
        .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then(jobs => {
          if (cancelled) return;
          const builder = Array.isArray(jobs) ? jobs.find(j => j.name === 'auto-command-center-builder') : null;
          setCronData(builder || null);
          setCError(null);
        })
        .catch(e => { if (!cancelled) setCError(e.message); });
    }
    pollCron();
    const t = setInterval(pollCron, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const sortedQueue = queueData?.queue
    ? [...queueData.queue].sort((a, b) => {
        const rank = { running: 0, waiting: 1, done: 2, failed: 3 };
        return (rank[a.status] || 9) - (rank[b.status] || 9);
      })
    : [];

  return (
    <div className="wq-layout">
      {/* Pending Tasks */}
      <section className="card wq-section">
        <header className="wq-section-head">
          <h2>Task Queue</h2>
          {queueData && (
            <span className="wq-count">
              {queueData.queue.filter(t => t.status !== 'done').length} pending
            </span>
          )}
        </header>
        {qError && <div className="wq-err">Could not load queue — {qError}</div>}
        {!queueData && !qError && <div className="empty">loading...</div>}
        {sortedQueue.length === 0 && queueData && (
          <div className="empty">no tasks in queue</div>
        )}
        {sortedQueue.length > 0 && (
          <div className="wq-items">
            {sortedQueue.map(task => (
              <div key={task.id} className={`wq-item wq-${task.status}`}>
                {statusDot(task.status)}
                <span className="wq-label">{task.label}</span>
                <span className={`wq-badge wq-badge-${task.assigned_to}`}>
                  {task.assigned_to}
                </span>
                <span className="wq-state">{task.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Claude Code Activity */}
      <section className="card wq-section">
        <header className="wq-section-head">
          <h2>Activity Log</h2>
        </header>
        {lError && <div className="wq-err">Log unavailable — {lError}</div>}
        {logLines.length === 0 && !lError && <div className="empty">no activity yet</div>}
        {logLines.length > 0 && (
          <div className="wq-log">
            {logLines.map((line, i) => (
              <div key={i} className="wq-log-line">{line}</div>
            ))}
          </div>
        )}
      </section>

      {/* Cron Status */}
      <section className="card wq-section">
        <header className="wq-section-head">
          <h2>Auto-Builder</h2>
          {cronData && (
            <span className={`wq-cron-status wq-cron-${cronData.last_status}`}>
              {cronData.last_status || 'unknown'}
            </span>
          )}
        </header>
        {cError && <div className="wq-err">Cron API unavailable — {cError}</div>}
        {!cronData && !cError && <div className="empty">loading...</div>}
        {cronData && (
          <div className="wq-cron-details">
            <div className="stat-row">
              <span className="label">State</span><span className="value">{cronData.state}</span>
            </div>
            <div className="stat-row">
              <span className="label">Schedule</span><span className="value">{cronData.schedule_display || cronData.schedule?.display || '—'}</span>
            </div>
            <div className="stat-row">
              <span className="label">Last Run</span><span className="value">{cronData.last_run_at ? shortTime(cronData.last_run_at) + ' ' + timeAgo(cronData.last_run_at) : '—'}</span>
            </div>
            <div className="stat-row">
              <span className="label">Next Run</span><span className="value">{cronData.next_run_at ? shortTime(cronData.next_run_at) : '—'}</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
