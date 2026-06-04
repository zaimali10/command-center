import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { LayoutProvider } from './context/LayoutContext.jsx';
import Dashboard from './components/Dashboard.jsx';

function AppInner() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [clock, setClock] = useState('00:00:00');
  const [date, setDate] = useState('');

  useEffect(() => {
    // Set initial date
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

    // Update clock every second
    const updateClock = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setClock(`${hours}:${minutes}:${seconds}`);
    };

    updateClock(); // Set initial clock value
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <header>
        <div id="clock">{clock}</div>
        <div id="date">{date}</div>
        <div className="mode-indicator static">STATIC</div>
      </header>

      <nav className="tabs">
        <button
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`tab-btn ${activeTab === 'todo' ? 'active' : ''}`}
          onClick={() => setActiveTab('todo')}
        >
          To-Do
        </button>
        <button
          className={`tab-btn ${activeTab === 'kanban' ? 'active' : ''}`}
          onClick={() => setActiveTab('kanban')}
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
