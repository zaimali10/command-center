import React, { createContext, useContext, useState } from 'react';
import { storage } from '../services/storage.js';

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
  const layout = storage.get('layout', DEFAULT_LAYOUT);
  if (Array.isArray(layout) && layout.length > 0) return layout;
  return DEFAULT_LAYOUT;
}

export function LayoutProvider({ children }) {
  const [order, setOrderState] = useState(loadLayout);

  function setOrder(newOrder) {
    setOrderState(newOrder);
    storage.set('layout', newOrder);
  }

  function resetLayout() {
    storage.clear();
    setOrderState(DEFAULT_LAYOUT);
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
