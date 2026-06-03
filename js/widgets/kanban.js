import { escapeHtml } from '../lib/config.js';

const STORAGE_KEY = 'cc.kanban.v1';
const COLUMNS = [
  { id: 'backlog',     label: 'Backlog'     },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'done',        label: 'Done'        },
];
const NEXT_COLUMN = { 'backlog': 'in-progress', 'in-progress': 'done', 'done': 'done' };

let cards = [];
let editingId = null;

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)); }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function tagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function dueState(iso) {
  if (!iso) return null;
  const due = new Date(iso); due.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due - today) / 86400000);
  if (diffDays < 0)  return { cls: 'overdue', text: `${-diffDays}d overdue` };
  if (diffDays === 0) return { cls: 'today',   text: 'today' };
  if (diffDays === 1) return { cls: 'soon',    text: 'tomorrow' };
  if (diffDays < 7)   return { cls: 'soon',    text: `${diffDays}d` };
  return { cls: 'later', text: due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
}

function tagsArray(card) {
  return (card.tags || '').split(',').map(t => t.trim()).filter(Boolean);
}

function cardHtml(card) {
  const tags = tagsArray(card);
  const tagPills = tags.map(t => {
    const hue = tagColor(t);
    return `<span class="kb-tag" style="--tag-h:${hue}">${escapeHtml(t)}</span>`;
  }).join('');
  const due = dueState(card.due);
  const dueHtml = due ? `<span class="kb-due kb-due-${due.cls}">${due.text}</span>` : '';
  const desc = card.description ? `<div class="kb-card-desc">${escapeHtml(card.description)}</div>` : '';
  return `
    <article class="kb-card" data-id="${card.id}" tabindex="0">
      <div class="kb-card-title">${escapeHtml(card.title)}</div>
      ${desc}
      ${(tagPills || dueHtml) ? `<div class="kb-card-meta">${tagPills}${dueHtml}</div>` : ''}
      <button class="kb-card-del" aria-label="delete card">×</button>
    </article>
  `;
}

function columnHtml(col) {
  const colCards = cards
    .filter(c => c.column === col.id)
    .sort((a, b) => a.created - b.created);
  const body = colCards.length
    ? colCards.map(cardHtml).join('')
    : `<div class="kb-empty">drop something here</div>`;
  return `
    <section class="kb-col" data-col="${col.id}">
      <header class="kb-col-head">
        <h3>${col.label}</h3>
        <span class="kb-count">${colCards.length}</span>
        <button class="kb-add" data-col="${col.id}" aria-label="add card">+</button>
      </header>
      <div class="kb-col-body">${body}</div>
    </section>
  `;
}

function render() {
  const root = document.getElementById('widget-kanban');
  root.innerHTML = `
    <div class="kb-board">${COLUMNS.map(columnHtml).join('')}</div>
    <div class="kb-modal" id="kb-modal" hidden>
      <form class="kb-modal-panel" id="kb-form">
        <h3 id="kb-modal-title">New Card</h3>
        <label class="kb-field">
          <span>Title</span>
          <input name="title" type="text" required maxlength="120" autocomplete="off" />
        </label>
        <label class="kb-field">
          <span>Description</span>
          <textarea name="description" rows="3" maxlength="500"></textarea>
        </label>
        <label class="kb-field">
          <span>Tags <em>(comma-separated)</em></span>
          <input name="tags" type="text" maxlength="120" autocomplete="off" placeholder="design, urgent" />
        </label>
        <label class="kb-field">
          <span>Due date</span>
          <input name="due" type="date" />
        </label>
        <div class="kb-modal-actions">
          <button type="button" class="kb-btn-ghost" data-action="cancel">Cancel</button>
          <button type="submit" class="kb-btn-primary">Save</button>
        </div>
      </form>
    </div>
  `;

  root.querySelectorAll('.kb-add').forEach(btn => {
    btn.addEventListener('click', () => openModal(null, btn.dataset.col));
  });

  root.querySelectorAll('.kb-card').forEach(cardEl => {
    const id = cardEl.dataset.id;
    bindCardInteractions(cardEl, id);

    const delBtn = cardEl.querySelector('.kb-card-del');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeCard(id);
    });
  });

  const modal = document.getElementById('kb-modal');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  modal.querySelector('[data-action="cancel"]').addEventListener('click', closeModal);
  document.getElementById('kb-form').addEventListener('submit', onSubmit);
}

function bindCardInteractions(cardEl, id) {
  let pressTimer = null;
  let longPressed = false;
  let startX = 0, startY = 0;

  const cancelPress = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  };
  const startPress = (x, y) => {
    longPressed = false;
    startX = x; startY = y;
    pressTimer = setTimeout(() => {
      longPressed = true;
      cardEl.classList.add('kb-pressed');
      navigator.vibrate?.(15);
      openModal(id);
    }, 500);
  };

  cardEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.kb-card-del')) return;
    startPress(e.clientX, e.clientY);
  });
  cardEl.addEventListener('pointermove', (e) => {
    if (!pressTimer) return;
    if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) cancelPress();
  });
  cardEl.addEventListener('pointerup', (e) => {
    if (e.target.closest('.kb-card-del')) return;
    cancelPress();
    cardEl.classList.remove('kb-pressed');
    if (!longPressed) advanceCard(id);
  });
  cardEl.addEventListener('pointercancel', () => { cancelPress(); cardEl.classList.remove('kb-pressed'); });
  cardEl.addEventListener('pointerleave', () => { cancelPress(); cardEl.classList.remove('kb-pressed'); });

  cardEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advanceCard(id); }
    if (e.key === 'e' || e.key === 'E')     { e.preventDefault(); openModal(id); }
    if (e.key === 'Delete')                 { e.preventDefault(); removeCard(id); }
  });
}

function advanceCard(id) {
  const card = cards.find(c => c.id === id);
  if (!card) return;
  const next = NEXT_COLUMN[card.column];
  if (next === card.column) return;
  card.column = next;
  save();
  render();
}

function removeCard(id) {
  cards = cards.filter(c => c.id !== id);
  save();
  render();
}

function openModal(id, column) {
  const modal = document.getElementById('kb-modal');
  const form  = document.getElementById('kb-form');
  const title = document.getElementById('kb-modal-title');
  editingId = id || null;
  if (id) {
    const card = cards.find(c => c.id === id);
    if (!card) return;
    title.textContent = 'Edit Card';
    form.title.value       = card.title || '';
    form.description.value = card.description || '';
    form.tags.value        = card.tags || '';
    form.due.value         = card.due || '';
    form.dataset.column    = card.column;
  } else {
    title.textContent = 'New Card';
    form.reset();
    form.dataset.column = column || 'backlog';
  }
  modal.hidden = false;
  setTimeout(() => form.title.focus(), 30);
}

function closeModal() {
  const modal = document.getElementById('kb-modal');
  modal.hidden = true;
  editingId = null;
}

function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const data = new FormData(form);
  const title = (data.get('title') || '').toString().trim();
  if (!title) return;
  const payload = {
    title,
    description: (data.get('description') || '').toString().trim(),
    tags:        (data.get('tags')        || '').toString().trim(),
    due:         (data.get('due')         || '').toString(),
  };
  if (editingId) {
    const card = cards.find(c => c.id === editingId);
    if (card) Object.assign(card, payload);
  } else {
    cards.push({
      id: uid(),
      created: Date.now(),
      column: form.dataset.column || 'backlog',
      ...payload,
    });
  }
  save();
  closeModal();
  render();
}

export function mountKanban() {
  cards = load();
  render();
}
