import React, { useState, useEffect } from 'react';

export default function Cron() {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchJobs() {
      try {
        const res = await fetch('/api/cron/jobs');
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!cancelled) setJobs(json);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }
    fetchJobs();
    const interval = setInterval(fetchJobs, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (error) return <div className="empty">—</div>;
  if (!jobs) return <div className="empty">loading...</div>;
  if (!Array.isArray(jobs) || jobs.length === 0) return <div className="empty">no scheduled jobs</div>;

  return (
    <table className="widget-table">
      <thead>
        <tr><td>Job</td><td>State</td><td>Schedule</td><td>Last Run</td><td>Status</td></tr>
      </thead>
      <tbody>
        {jobs.map((job, i) => (
          <tr key={job.name || i}>
            <td>{job.name || '—'}</td>
            <td>{job.state || '—'}</td>
            <td>{job.schedule_display || '—'}</td>
            <td>{job.last_run_at || '—'}</td>
            <td>{job.last_status || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
