import React, { useState, useEffect } from 'react';

export default function Sessions() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/sessions')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="empty">—</div>;
  if (!data)  return <div className="empty">loading…</div>;

  const list = (data.sessions || []).slice(0, 5);
  if (list.length === 0) return <div className="empty">no sessions</div>;

  return (
    <>
      {list.map((s, i) => (
        <div key={i} className="stat-row">
          <span className="label">{s.model || 'unknown'}</span>
          <span className="value">{s.messages || 0}m · {s.timeAgo || '—'}</span>
        </div>
      ))}
    </>
  );
}
