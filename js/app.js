import { API }      from './lib/api.js';
import { CONFIG }   from './lib/config.js';
import { mountClock }     from './widgets/clock.js';
import { mountQuote }     from './widgets/quote.js';
import { mountWeather }   from './widgets/weather.js';
import { mountForecast }  from './widgets/forecast.js';
import { mountTheme }     from './widgets/theme.js';
import { mountSystem,    refreshSystem    } from './widgets/system.js';
import { mountTodo }      from './widgets/todo.js';
import { mountGithub }    from './widgets/github.js';
import { mountCron,      refreshCron      } from './widgets/cron.js';
import { mountSessions,  refreshSessions  } from './widgets/sessions.js';
import { mountAnalytics, refreshAnalytics } from './widgets/analytics.js';
import { mountSkills,    refreshSkills    } from './widgets/skills.js';
import { mountProjects }  from './widgets/projects.js';
import { mountDiscord }   from './widgets/discord.js';
import { mountKanban }    from './widgets/kanban.js';
import { mountMonitor }   from './widgets/monitor.js';

const TAB_STORAGE_KEY = 'cc.activeTab.v1';
let kanbanMounted = false;

function setMode(live) {
  const el = document.getElementById('mode-indicator');
  if (live) { el.textContent = 'LIVE';   el.classList.add('live'); }
  else      { el.textContent = 'STATIC'; el.classList.add('static'); }
}

function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const panels  = document.querySelectorAll('.tab-panel');

  function activate(name) {
    buttons.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    panels .forEach(p => p.classList.toggle('active', p.dataset.tab === name));
    localStorage.setItem(TAB_STORAGE_KEY, name);
    if (name === 'kanban' && !kanbanMounted) {
      mountKanban();
      kanbanMounted = true;
    }
  }

  buttons.forEach(b => {
    b.addEventListener('click', () => activate(b.dataset.tab));
  });

  const saved = localStorage.getItem(TAB_STORAGE_KEY) || 'dashboard';
  activate(saved);
}

(async function init() {
  await API.init();
  setMode(API.live);

  setupTabs();

  mountTheme();
  mountClock();
  mountQuote();
  mountWeather();
  mountForecast();
  mountGithub();
  mountProjects();
  mountDiscord();
  mountTodo();
  mountMonitor();

  await Promise.all([
    mountSystem(),
    mountCron(),
    mountSessions(),
    mountAnalytics(),
    mountSkills(),
  ]);

  if (API.live) {
    setInterval(() => {
      Promise.all([
        refreshSystem(),
        refreshCron(),
        refreshSessions(),
        refreshAnalytics(),
        refreshSkills(),
      ]).catch(() => {});
    }, CONFIG.livePollMs);
  }
})();
