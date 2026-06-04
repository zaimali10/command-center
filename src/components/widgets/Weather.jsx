import React, { useState, useEffect } from 'react';

const WX_URL = 'https://wttr.in/Dallas?format=j1';

function wxEmoji(desc) {
  const s = desc.toLowerCase();
  if (s.includes('sun') || s.includes('clear')) return '☀️';
  if (s.includes('cloud') && s.includes('sun')) return '⛅';
  if (s.includes('cloud')) return '☁️';
  if (s.includes('rain') || s.includes('drizzle') || s.includes('shower')) return '🌧️';
  if (s.includes('thunder') || s.includes('storm')) return '⛈️';
  if (s.includes('snow') || s.includes('sleet') || s.includes('ice')) return '🌨️';
  if (s.includes('fog') || s.includes('mist') || s.includes('haze')) return '🌫️';
  if (s.includes('wind') || s.includes('breez')) return '💨';
  return '☀️';
}

export default function Weather() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    function fetchWeather() {
      fetch(WX_URL)
        .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then(json => {
          if (cancelled) return;
          const current = json.current_condition?.[0];
          if (!current) throw new Error('no weather data');
          setData({
            temp: current.temp_F || '--',
            description: current.weatherDesc?.[0]?.value || '',
            icon: wxEmoji(current.weatherDesc?.[0]?.value || ''),
          });
        })
        .catch(e => { if (!cancelled) setError(e.message); });
    }
    fetchWeather();
    const interval = setInterval(fetchWeather, 1800000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (error) return <div className="wx-err">Error loading weather</div>;
  if (!data) return <div className="empty">loading...</div>;

  return (
    <>
      <div className="wx-main">
        <span className="wx-icon">{data.icon}</span>
        <span className="wx-temp">{data.temp}F</span>
      </div>
      <div className="wx-desc">{data.description}</div>
    </>
  );
}
