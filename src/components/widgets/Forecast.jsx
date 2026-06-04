import React, { useState, useEffect } from 'react';

const WX_URL = 'https://wttr.in/Dallas?format=j1';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export default function Forecast() {
  const [days, setDays] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(WX_URL)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const weather = data.weather || [];
        if (!weather.length) throw new Error('no forecast data');
        setDays(weather.slice(0, 3));
      })
      .catch(e => {
        if (!cancelled) setError(e.message);
      });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="empty">{error}</div>;
  if (!days) return <div className="empty">loading...</div>;

  return (
    <div className="fc-grid">
      {days.map(d => {
        const date = new Date(d.date + 'T12:00:00');
        const dayName = DAY_NAMES[date.getDay()] || d.date;
        const icon = wxEmoji(d.hourly?.[0]?.weatherDesc?.[0]?.value || '');
        const high = d.maxtempC || '—';
        const low = d.mintempC || '—';
        const rain = d.hourly?.[0]?.chanceofrain || '0';
        return (
          <div key={d.date} className="fc-day">
            <div className="fc-name">{dayName}</div>
            <div className="fc-icon">{icon}</div>
            <div className="fc-temps">
              <span className="fc-high">{high}°</span> / <span className="fc-low">{low}°</span>
            </div>
            <div className="fc-rain">☔ {rain}%</div>
          </div>
        );
      })}
    </div>
  );
}
