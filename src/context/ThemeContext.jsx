import React, { createContext, useContext, useEffect, useState } from 'react';
import { storage } from '../services/storage.js';

const THEME_CYCLE = ['dark', 'light', 'midnight'];

const ThemeContext = createContext(null);

function loadTheme() {
  const stored = storage.get('theme', 'dark');
  if (THEME_CYCLE.includes(stored)) return stored;
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(loadTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storage.set('theme', theme);
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
