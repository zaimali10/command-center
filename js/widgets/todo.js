import { escapeHtml } from '../lib/config.js';

const STORAGE_KEY = 'cc.todos.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function save(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

export function mountTodo() {
  const el = document.getElementById('widget-todo');
  let items = load();

  el.innerHTML = `
    <h2>To-Do</h2>
    <div class="todo-input-row">
      <input class="todo-input" type="text" placeholder="add a task…" maxlength="140" />
      <button class="todo-add" aria-label="add task">+</button>
    </div>
    <ul class="todo-list"></ul>
  `;
  const input  = el.querySelector('.todo-input');
  const addBtn = el.querySelector('.todo-add');
  const list   = el.querySelector('.todo-list');

  function add() {
    const text = input.value.trim();
    if (!text) return;
    items.push({ id: Date.now() + Math.random(), text, done: false });
    input.value = '';
    save(items);
    renderList();
  }
  addBtn.addEventListener('click', add);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });

  function toggle(id) {
    const it = items.find(x => x.id === id);
    if (!it) return;
    it.done = !it.done;
    save(items); renderList();
  }
  function remove(id) {
    items = items.filter(x => x.id !== id);
    save(items); renderList();
  }

  function renderList() {
    list.innerHTML = items.map(it => `
      <li class="todo-item ${it.done ? 'done' : ''}" data-id="${it.id}">
        <button class="todo-check ${it.done ? 'checked' : ''}" aria-label="toggle"></button>
        <span class="todo-text">${escapeHtml(it.text)}</span>
        <button class="todo-del" aria-label="delete">×</button>
      </li>
    `).join('') || '<li class="todo-empty">no tasks yet</li>';

    list.querySelectorAll('.todo-item').forEach(li => {
      const id = Number(li.dataset.id);
      li.querySelector('.todo-check').addEventListener('click', () => toggle(id));
      li.querySelector('.todo-del').addEventListener('click', () => remove(id));
    });
  }

  renderList();
}
