import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { LayoutProvider } from './context/LayoutContext.jsx';
import { useTheme } from './context/ThemeContext.jsx';
import { useLayout } from './context/LayoutContext.jsx';
import Dashboard from './components/Dashboard.jsx';
import Todo from './components/widgets/Todo.jsx';
import Kanban from './components/widgets/Kanban.jsx';
import Grocery from './components/widgets/Grocery.jsx';
import WorkQueue from './components/widgets/WorkQueue.jsx';

const TAB_STORAGE_KEY = 'cc.tab.v1';
const VALID_TABS = ['dashboard', 'todo', 'kanban', 'workqueue', 'grocery'];

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
  const [gatewayState, setGatewayState] = useState(null);

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
      let hours = now.getHours();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      const clockStr = `${String(hours).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${ampm}`;
      setClock(clockStr);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function pollGateway() {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setGatewayState(json.gateway_state);
      } catch {}
    }
    pollGateway();
    const interval = setInterval(pollGateway, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <>
      <header>
        <div id="clock">{clock}</div>
        <div id="date">{date}</div>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <button className="theme-btn" id="reset-layout-btn" onClick={resetLayout}>⟳</button>
          <button className="theme-btn" id="theme-btn" onClick={toggleTheme}>🌓</button>
          <span className={`mode-indicator ${gatewayState === 'running' ? 'live' : 'static'}`}>
            {gatewayState === 'running' ? 'LIVE' : 'STATIC'}
          </span>
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
        <button
          className={`tab-btn ${activeTab === 'workqueue' ? 'active' : ''}`}
          onClick={() => handleSetTab('workqueue')}
        >
          Queue
        </button>
        <button
          className={`tab-btn ${activeTab === 'grocery' ? 'active' : ''}`}
          onClick={() => handleSetTab('grocery')}
        >
          Grocery
        </button>
      </nav>

      <div className={`tab-panel ${activeTab === 'dashboard' ? 'active' : ''}`}>
        <Dashboard />
      </div>

      <div id="todo-tab" className={`tab-panel ${activeTab === 'todo' ? 'active' : ''}`}>
        <div className="card">
          <h2>To-Do</h2>
          <Todo />
        </div>
      </div>

      <div id="kanban-tab" className={`tab-panel ${activeTab === 'kanban' ? 'active' : ''}`}>
        <Kanban />
      </div>

      <div id="workqueue-tab" className={`tab-panel ${activeTab === 'workqueue' ? 'active' : ''}`}>
        <WorkQueue />
      </div>

      <div id="grocery-tab" className={`tab-panel ${activeTab === 'grocery' ? 'active' : ''}`}>
        <div className="card">
          <h2>Grocery List</h2>
          <Grocery />
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
