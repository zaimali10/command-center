import React, { useState, useEffect } from 'react';

export default function Monitor() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    function fetchTelemetry() {
      fetch('/data/telemetry.json?' + Date.now())
        .then(r => { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
        .then(d => { if (!cancelled) { setData(d); setError(null); } })
        .catch(e => { if (!cancelled) setError(e.message); });
    }

    fetchTelemetry();
    const timer = setInterval(fetchTelemetry, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (error) return <div className="mon-foot">offline — {error}</div>;
  if (!data)  return <div className="mon-foot">loading...</div>;

  const cpu  = data.cpu.percent;
  const mem  = data.memory.percent;
  const disk = data.disk.percent;

  return (
    <>
      <div className="mon-grid">
        <div className="mon-cell">
          <div className="mon-k">CPU</div>
          <div className="mon-v">{cpu}%</div>
          <div className="mon-bar"><span style={{ width: Math.min(cpu, 100) + '%' }} /></div>
        </div>
        <div className="mon-cell">
          <div className="mon-k">Memory</div>
          <div className="mon-v">{mem}% ({data.memory.used_gb}/{data.memory.total_gb} GB)</div>
          <div className="mon-bar"><span style={{ width: Math.min(mem, 100) + '%' }} /></div>
        </div>
        <div className="mon-cell">
          <div className="mon-k">Disk</div>
          <div className="mon-v">{disk}% ({data.disk.used_gb}/{data.disk.total_gb} GB)</div>
          <div className="mon-bar"><span style={{ width: Math.min(disk, 100) + '%' }} /></div>
        </div>
      </div>
      <div className="mon-foot">
        {data.system.hostname} · up {data.system.uptime} · {data.system.process_count} procs
      </div>
    </>
  );
}
