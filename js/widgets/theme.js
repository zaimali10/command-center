// Theme toggle — cycles between dark / light / midnight
const STORAGE_KEY = 'cc.theme.v1';
const THEMES = ['dark', 'light', 'midnight'];
const ICONS = { dark: '🌙', light: '☀️', midnight: '🌌' };
const LABELS = { dark: 'Glass Dark', light: 'Glass Light', midnight: 'Midnight' };

function getTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'dark';
}

function setTheme(t) {
  localStorage.setItem(STORAGE_KEY, t);
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('theme-btn');
  btn.textContent = ICONS[t] || '🌙';
  btn.title = LABELS[t] || 'Dark';
}

function nextTheme(current) {
  const idx = THEMES.indexOf(current);
  return THEMES[(idx + 1) % THEMES.length];
}

export function mountTheme() {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;

  setTheme(getTheme());

  btn.addEventListener('click', () => {
    const current = getTheme();
    setTheme(nextTheme(current));
  });
}
