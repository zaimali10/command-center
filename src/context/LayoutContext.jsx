import React, { createContext, useContext, useState } from 'react';

export const DEFAULT_LAYOUT = [
  { id: 'widget-weather',   span: 1 },
  { id: 'widget-forecast',  span: 1 },
  { id: 'widget-system',    span: 1 },
  { id: 'widget-skills',    span: 1 },
  { id: 'widget-cron',      span: 'full' },
  { id: 'widget-analytics', span: 2 },
  { id: 'widget-monitor',   span: 1 },
  { id: 'widget-projects',  span: 2 },
  { id: 'widget-discord',   span: 1 },
  { id: 'widget-github',    span: 2 },
  { id: 'widget-sessions',  span: 1 },
];

const LayoutContext = createContext(null);

function loadLayout() {
  try {
    const raw = localStorage.getItem('cc.layout.v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fall through
  }
  return DEFAULT_LAYOUT;
}

export function LayoutProvider({ children }) {
  const [order, setOrderState] = useState(loadLayout);

  function setOrder(newOrder) {
    setOrderState(newOrder);
    localStorage.setItem('cc.layout.v1', JSON.stringify(newOrder));
  }

  function resetLayout() {
    localStorage.removeItem('cc.layout.v1');
    window.location.reload();
  }

  return (
    <LayoutContext.Provider value={{ order, setOrder, resetLayout }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within a LayoutProvider');
  return ctx;
}
