import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { LayoutProvider } from './context/LayoutContext.jsx';
import { useTheme } from './context/ThemeContext.jsx';
import { useLayout } from './context/LayoutContext.jsx';
import Dashboard from './components/Dashboard.jsx';

const TAB_STORAGE_KEY = 'cc.tab.v1';
const VALID_TABS = ['dashboard', 'todo', 'kanban'];

function loadTab() {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    if (stored && VALID_TABS.includes(stored)) return stored;
  } catch {
    // fall through
  }
  return 'dashboard';
}

function AppInner() {
  const { toggleTheme } = useTheme();
  const { resetLayout } = useLayout();
  const [activeTab, setActiveTab] = useState(loadTab);
  const [clock, setClock] = useState('00:00:00');
  const [date, setDate] = useState('');

  function handleSetTab(tab) {
    setActiveTab(tab);
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  }

  useEffect(() => {
    const formatDate = () => {
      const now = new Date();
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
      const dayName = days[now.getDay()];
      const monthName = months[now.getMonth()];
      const dayNum = now.getDate();
      return `${dayName}, ${monthName} ${dayNum}`;
    };
    setDate(formatDate());

    const updateClock = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setClock(`${hours}:${minutes}:${seconds}`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <header>
        <div id="clock">{clock}</div>
        <div id="date">{date}</div>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <button className="theme-btn" id="reset-layout-btn" onClick={resetLayout}>⟳</button>
          <button className="theme-btn" id="theme-btn" onClick={toggleTheme}>🌓</button>
          <span className="mode-indicator static">STATIC</span>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleSetTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`tab-btn ${activeTab === 'todo' ? 'active' : ''}`}
          onClick={() => handleSetTab('todo')}
        >
          To-Do
        </button>
        <button
          className={`tab-btn ${activeTab === 'kanban' ? 'active' : ''}`}
          onClick={() => handleSetTab('kanban')}
        >
          Kanban
        </button>
      </nav>

      <div className={`tab-panel ${activeTab === 'dashboard' ? 'active' : ''}`}>
        <Dashboard />
      </div>

      <div id="todo-tab" className={`tab-panel ${activeTab === 'todo' ? 'active' : ''}`}>
        <div className="card">
          <h2>To-Do</h2>
          <p className="empty">Coming soon</p>
        </div>
      </div>

      <div id="kanban-tab" className={`tab-panel ${activeTab === 'kanban' ? 'active' : ''}`}>
        <div className="card">
          <h2>Kanban</h2>
          <p className="empty">Coming soon</p>
        </div>
      </div>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LayoutProvider>
        <AppInner />
      </LayoutProvider>
    </ThemeProvider>
  );
}
