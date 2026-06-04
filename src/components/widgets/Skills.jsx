import React, { useState, useEffect } from 'react';

export default function Skills() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchSkills() {
      try {
        const res = await fetch('/api/skills');
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }
    fetchSkills();
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="empty">—</div>;
  if (!data) return <div className="empty">loading...</div>;
  if (!Array.isArray(data) || data.length === 0) return <div className="empty">no skills</div>;

  const enabled = data.filter(s => s.enabled).length;
  const total = data.length;
  const names = data.filter(s => s.enabled).slice(0, 5).map(s => s.name).join(', ');

  return (
    <>
      <div className="stat-row">
        <span className="label">enabled</span>
        <span className="value">{enabled} / {total}</span>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--fg-dim)', marginTop: '8px', wordBreak: 'break-word' }}>
        {names || 'none'}
      </div>
    </>
  );
}
