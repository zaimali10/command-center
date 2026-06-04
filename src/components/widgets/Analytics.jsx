import React, { useState, useEffect } from 'react';

const SPARK_CHARS = '▁▂▃▄▅▆▇█';

function formatTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/analytics/usage?days=7')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="empty">—</div>;
  if (!data)  return <div className="empty">loading…</div>;

  let totalIn = 0, totalOut = 0;
  if (Array.isArray(data.daily)) {
    for (const day of data.daily) {
      totalIn  += day.inputTokens  || 0;
      totalOut += day.outputTokens || 0;
    }
  }
  const totalSessions = data.sessionCount || 0;

  let spark = SPARK_CHARS;
  if (Array.isArray(data.daily) && data.daily.length > 0) {
    const max = Math.max(...data.daily.map(d => (d.inputTokens || 0) + (d.outputTokens || 0)));
    spark = data.daily.map(d => {
      const total = (d.inputTokens || 0) + (d.outputTokens || 0);
      if (max === 0) return SPARK_CHARS[0];
      const i = Math.min(Math.ceil((total / max) * 8), 8) - 1;
      return SPARK_CHARS[Math.max(i, 0)];
    }).join('');
  }

  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
      <div>
        <div className="sparkline">{spark}</div>
        <div style={{ fontSize: '12px', color: 'var(--fg-dim)', marginTop: '8px' }}>
          {formatTokens(totalIn)} in / {formatTokens(totalOut)} out
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div className="stat-row">
          <span className="label">sessions</span>
          <span className="value">{totalSessions}</span>
        </div>
      </div>
    </div>
  );
}
