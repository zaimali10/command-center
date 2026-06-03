import { CONFIG } from '../lib/config.js';

const ICON = (code) => {
  const c = Number(code);
  if (c === 113) return '☀';
  if ([116].includes(c)) return '⛅';
  if ([119, 122].includes(c)) return '☁';
  if ([143, 248, 260].includes(c)) return '🌫';
  if ([176, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308, 311, 314, 317, 350, 353, 356, 359, 386, 389].includes(c)) return '🌧';
  if ([200].includes(c)) return '⛈';
  if ([179, 182, 185, 227, 230, 320, 323, 326, 329, 332, 335, 338, 368, 371, 374, 377, 392, 395].includes(c)) return '❄';
  return '🌡';
};

export function mountWeather() {
  const el = document.getElementById('widget-weather');

  function render(state) {
    if (state.error) {
      el.innerHTML = `<h2>Weather · ${CONFIG.weatherLocation}</h2><div class="wx-err">weather unavailable</div>`;
      return;
    }
    const d = state.data;
    el.innerHTML = `
      <h2>Weather · ${d.area}</h2>
      <div class="wx-main">
        <div class="wx-icon">${ICON(d.code)}</div>
        <div>
          <div class="wx-temp">${d.tempF}°F</div>
          <div class="wx-desc">${d.desc}</div>
        </div>
      </div>
      <div class="wx-grid">
        <div class="k">feels</div><div class="v">${d.feelsF}°F</div>
        <div class="k">wind</div> <div class="v">${d.windMph} mph ${d.windDir}</div>
        <div class="k">humidity</div><div class="v">${d.humidity}%</div>
      </div>
    `;
  }

  async function fetchWeather() {
    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(CONFIG.weatherLocation)}?format=j1`);
      if (!res.ok) throw new Error('http ' + res.status);
      const j = await res.json();
      const cc = j.current_condition[0];
      const area = j.nearest_area?.[0]?.areaName?.[0]?.value || CONFIG.weatherLocation;
      render({ data: {
        area,
        tempF:    cc.temp_F,
        feelsF:   cc.FeelsLikeF,
        desc:     cc.weatherDesc[0].value,
        windMph:  cc.windspeedMiles,
        windDir:  cc.winddir16Point,
        humidity: cc.humidity,
        code:     cc.weatherCode,
      }});
    } catch (e) {
      console.warn('[weather]', e);
      render({ error: true });
    }
  }

  render({ data: { area: CONFIG.weatherLocation, tempF: '--', feelsF: '--', desc: 'loading…', windMph: '--', windDir: '--', humidity: '--', code: 0 } });
  fetchWeather();
  setInterval(fetchWeather, CONFIG.weatherRefreshMs);
}
