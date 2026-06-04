import React, { useState, useEffect } from 'react';

export default function Weather() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchWeather() {
      try {
        const res = await fetch('/api/weather');
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }
    fetchWeather();
    const interval = setInterval(fetchWeather, 1800000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (error) return <><h2>Weather . Dallas</h2><div className="wx-err">Error loading weather</div></>;
  if (!data) return <><h2>Weather . Dallas</h2><div className="empty">loading...</div></>;

  return (
    <>
      <h2>Weather . Dallas</h2>
      <div className="wx-main">
        <span className="wx-icon">{data.icon || '☀️'}</span>
        <span className="wx-temp">{data.temp || '--'}F</span>
      </div>
      <div className="wx-desc">{data.description || ''}</div>
    </>
  );
}
