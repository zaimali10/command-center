import { CONFIG } from '../lib/config.js';

export function mountQuote() {
  const el = document.getElementById('widget-quote');
  let i = Math.floor(Math.random() * CONFIG.quotes.length);

  function render() {
    const q = CONFIG.quotes[i];
    el.innerHTML = `"${q.text}" — <span style="color:var(--accent-2)">${q.author}</span>`;
  }
  render();
  setInterval(() => {
    i = (i + 1) % CONFIG.quotes.length;
    render();
  }, CONFIG.quoteRotateMs);
}
