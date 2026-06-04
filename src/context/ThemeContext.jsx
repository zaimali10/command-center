import React, { createContext, useContext, useEffect, useState } from 'react';

const THEME_CYCLE = ['dark', 'light', 'midnight'];
const STORAGE_KEY = 'cc.theme.v1';

const ThemeContext = createContext(null);

function loadTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // fall through
  }
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(loadTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(current => {
      const idx = THEME_CYCLE.indexOf(current);
      return THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
