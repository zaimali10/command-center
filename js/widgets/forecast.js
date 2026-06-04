// 3-day weather forecast — uses shared wttr.in data
const WX_URL = 'https://wttr.in/Dallas?format=j1';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function mountForecast() {
  const el = document.getElementById('widget-forecast');
  if (!el) return;

  fetch(WX_URL)
    .then(r => r.json())
    .then(data => {
      const days = data.weather || [];
      if (!days.length) throw new Error('no forecast data');
      render(el, days.slice(0, 3));
    })
    .catch(err => {
      el.innerHTML = `<h2>3-Day Forecast</h2><div class="empty">${err.message}</div>`;
    });
}

function render(el, days) {
  const html = days.map(d => {
    const date = new Date(d.date + 'T12:00:00');
    const dayName = DAY_NAMES[date.getDay()] || d.date;
    const icon = wxEmoji(d.hourly?.[0]?.weatherDesc?.[0]?.value || '');
    const high = d.maxtempC || '—';
    const low  = d.mintempC || '—';
    const rain = d.hourly?.[0]?.chanceofrain || '0';
    return `
      <div class="fc-day">
        <div class="fc-name">${dayName}</div>
        <div class="fc-icon">${icon}</div>
        <div class="fc-temps">
          <span class="fc-high">${high}°</span> / <span class="fc-low">${low}°</span>
        </div>
        <div class="fc-rain">☔ ${rain}%</div>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <h2>3-Day Forecast</h2>
    <div class="fc-grid">${html}</div>
  `;
}

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
