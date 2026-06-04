import React, { createContext, useContext, useState } from 'react';

export const DEFAULT_LAYOUT = [
  { id: 'clock',     span: 'full' },
  { id: 'weather',   span: '1' },
  { id: 'github',    span: '1' },
  { id: 'hermes',    span: '1' },
  { id: 'projects',  span: '2' },
  { id: 'discord',   span: '1' },
  { id: 'sessions',  span: '1' },
  { id: 'analytics', span: '1' },
  { id: 'system',    span: '2' },
  { id: 'cron',      span: '1' },
  { id: 'skills',    span: '1' },
];

const LayoutContext = createContext(null);

function loadLayout() {
  try {
    const raw = localStorage.getItem('cc.layout.v1');
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through
  }
  return DEFAULT_LAYOUT;
}

export function LayoutProvider({ children }) {
  const [order, setOrder] = useState(loadLayout);

  function saveOrder(newOrder) {
    setOrder(newOrder);
    localStorage.setItem('cc.layout.v1', JSON.stringify(newOrder));
  }

  function resetLayout() {
    localStorage.removeItem('cc.layout.v1');
    setOrder(DEFAULT_LAYOUT);
  }

  return (
    <LayoutContext.Provider value={{ order, saveOrder, resetLayout }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within a LayoutProvider');
  return ctx;
}
