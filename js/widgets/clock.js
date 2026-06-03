import { CONFIG } from '../lib/config.js';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = n => String(n).padStart(2, '0');

export function mountClock() {
  const elTime = document.getElementById('clock');
  const elDate = document.getElementById('date');

  function tick() {
    const d = new Date();
    let h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    elTime.textContent = `${pad(h)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ampm}`;
    elDate.textContent = `${DAY[d.getDay()]} ${pad(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`;
  }
  tick();
  setInterval(tick, CONFIG.clockTickMs);
}
