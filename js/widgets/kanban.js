import { escapeHtml } from '../lib/config.js';

/*
 * Kanban Board — drag-and-drop, reorder, tags, due dates.
 *
 * Gesture detection:
 *   Tap (< 10px movement, < 500ms)          → advance card to next column
 *   Long-press (> 500ms, < 10px movement)   → open edit modal
 *   Drag (> 10px movement)                  → drag-and-drop mode
 */

const STORAGE_KEY = 'cc.kanban.v1';
const COLUMNS = [
  { id: 'backlog',     label: 'Backlog'     },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'done',        label: 'Done'        },
];
const NEXT_COLUMN = { 'backlog': 'in-progress', 'in-progress': 'done', 'done': 'done' };

let cards = [];
let editingId = null;

// ── Drag state ──────────────────────────────────────────────────────────────
let drag = null; // { cardId, ghost, startX, startY, originalCol, offsetX, offsetY }

// ── Persistence ─────────────────────────────────────────────────────────────
function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)); }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Tag → colour (deterministic HSL) ────────────────────────────────────────
function tagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

// ── Due-state helpers ───────────────────────────────────────────────────────
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

// ── Card HTML ───────────────────────────────────────────────────────────────
function cardHtml(card) {
  const tags = tagsArray(card);
  const tagPills = tags.map(t => {
    const hue = tagColor(t);
    return `<span class="kb-tag" style="--tag-h:${hue}">${escapeHtml(t)}</span>`;
  }).join('');
  const due = dueState(card.due);
  const dueHtml = due ? `<span class="kb-due kb-due-${due.cls}">${due.text}</span>` : '';
  const desc = card.description
    ? `<div class="kb-card-desc">${escapeHtml(card.description)}</div>`
    : '';
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
    .sort((a, b) => (a.order || a.created) - (b.order || b.created));
  const body = colCards.length
    ? colCards.map(c => cardHtml(c) + `<div class="kb-drop-indicator" data-col="${col.id}"></div>`).join('')
    : `<div class="kb-empty">drop something here</div>`;
  return `
    <section class="kb-col" data-col="${col.id}">
      <header class="kb-col-head">
        <h3>${col.label}</h3>
        <span class="kb-count">${colCards.length}</span>
        <button class="kb-add" data-col="${col.id}" aria-label="add card">+</button>
      </header>
      <div class="kb-col-body" data-col="${col.id}">${body}</div>
    </section>
  `;
}

// ── Drop-zone geometry ──────────────────────────────────────────────────────
function getDropTarget(x, y) {
  // Find the column whose body bounds contain (x, y), or the nearest one
  const colBodies = document.querySelectorAll('.kb-col-body');
  let best = null;
  let bestDist = Infinity;

  colBodies.forEach(body => {
    const r = body.getBoundingClientRect();
    // Check if point is horizontally within column
    if (x >= r.left && x <= r.right && y >= r.top - 40 && y <= r.bottom + 40) {
      const dist = Math.abs(y - (r.top + r.height / 2));
      if (dist < bestDist) {
        bestDist = dist;
        best = body;
      }
    }
  });

  if (!best) return null;

  const colId = best.dataset.col;
  const indicators = best.querySelectorAll('.kb-drop-indicator');
  const cardEls = best.querySelectorAll('.kb-card');

  // Find which indicator is closest vertically
  let insertAfterId = null;
  let insertBeforeId = null;
  let minDist = Infinity;

  indicators.forEach(ind => {
    const r = ind.getBoundingClientRect();
    const dist = Math.abs(y - (r.top + r.height / 2));
    if (dist < minDist) {
      minDist = dist;
      const prev = ind.previousElementSibling;
      const next = ind.nextElementSibling;
      if (prev && prev.classList.contains('kb-card')) {
        insertAfterId = prev.dataset.id;
        insertBeforeId = null;
      } else if (next && next.classList.contains('kb-card')) {
        insertBeforeId = next.dataset.id;
        insertAfterId = null;
      } else {
        insertAfterId = null;
        insertBeforeId = null;
      }
    }
  });

  // If no indicator found (empty column), insert at end
  if (!cardEls.length) {
    return { colId, insertAfterId: null, insertBeforeId: null };
  }

  return { colId, insertAfterId, insertBeforeId };
}

function moveCard(cardId, { colId, insertAfterId, insertBeforeId }) {
  const card = cards.find(c => c.id === cardId);
  if (!card) return;

  card.column = colId;

  // Determine the new order value
  const colCards = cards
    .filter(c => c.column === colId && c.id !== cardId)
    .sort((a, b) => (a.order || a.created) - (b.order || b.created));

  if (insertBeforeId) {
    const beforeIdx = colCards.findIndex(c => c.id === insertBeforeId);
    if (beforeIdx >= 0) {
      const beforeCard = colCards[beforeIdx];
      const afterOrder = beforeCard.order || beforeCard.created;
      if (beforeIdx > 0) {
        const prevCard = colCards[beforeIdx - 1];
        const prevOrder = prevCard.order || prevCard.created;
        card.order = (prevOrder + afterOrder) / 2;
      } else {
        card.order = afterOrder - 1000;
      }
    }
  } else if (insertAfterId) {
    const afterIdx = colCards.findIndex(c => c.id === insertAfterId);
    if (afterIdx >= 0) {
      const afterCard = colCards[afterIdx];
      const afterOrder = afterCard.order || afterCard.created;
      if (afterIdx < colCards.length - 1) {
        const nextCard = colCards[afterIdx + 1];
        const nextOrder = nextCard.order || nextCard.created;
        card.order = (afterOrder + nextOrder) / 2;
      } else {
        card.order = afterOrder + 1000;
      }
    }
  } else {
    // Append to end
    if (colCards.length > 0) {
      const last = colCards[colCards.length - 1];
      card.order = (last.order || last.created) + 1000;
    } else {
      card.order = Date.now();
    }
  }

  save();
  render();
}

// ── Drag handlers ───────────────────────────────────────────────────────────
function startDrag(cardEl, id, e) {
  const rect = cardEl.getBoundingClientRect();
  const ghost = cardEl.cloneNode(true);
  ghost.classList.add('kb-ghost');
  ghost.style.width = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  ghost.style.left = (e.clientX - rect.width / 2) + 'px';
  ghost.style.top = (e.clientY - rect.height / 2) + 'px';
  document.body.appendChild(ghost);

  cardEl.classList.add('kb-dragging');

  drag = {
    cardId: id,
    ghost,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
  };
}

function moveDrag(e) {
  if (!drag) return;
  drag.ghost.style.left = (e.clientX - drag.ghost.offsetWidth / 2) + 'px';
  drag.ghost.style.top = (e.clientY - drag.ghost.offsetHeight / 2) + 'px';

  // Highlight valid drop zones
  document.querySelectorAll('.kb-col-body').forEach(body => {
    body.classList.remove('kb-drop-active');
  });
  const target = getDropTarget(e.clientX, e.clientY);
  if (target) {
    const body = document.querySelector(`.kb-col-body[data-col="${target.colId}"]`);
    if (body) {
      const indicators = body.querySelectorAll('.kb-drop-indicator');
      indicators.forEach(ind => ind.classList.remove('kb-drop-highlight'));
      // Highlight the closest indicator
      const colCards = body.querySelectorAll('.kb-card');
      let bestInd = null;
      let minDist = Infinity;
      indicators.forEach(ind => {
        const r = ind.getBoundingClientRect();
        const dist = Math.abs(e.clientY - (r.top + r.height / 2));
        if (dist < minDist) {
          minDist = dist;
          bestInd = ind;
        }
      });
      if (bestInd) bestInd.classList.add('kb-drop-highlight');
      body.classList.add('kb-drop-active');
    }
  }
}

function endDrag(e) {
  if (!drag) return;
  const target = getDropTarget(e.clientX, e.clientY);

  // Cleanup ghosts / classes
  drag.ghost.remove();
  const origCard = document.querySelector(`.kb-card[data-id="${drag.cardId}"]`);
  if (origCard) origCard.classList.remove('kb-dragging');
  document.querySelectorAll('.kb-col-body').forEach(body => body.classList.remove('kb-drop-active'));
  document.querySelectorAll('.kb-drop-indicator').forEach(ind => ind.classList.remove('kb-drop-highlight'));

  if (target) {
    moveCard(drag.cardId, target);
  }

  drag = null;
}

// ── Card interaction binding ────────────────────────────────────────────────
function bindCardInteractions(cardEl, id) {
  let pressTimer = null;
  let longPressed = false;
  let startX = 0, startY = 0;
  let isDragging = false;

  const cancelPress = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  };

  const onDown = (x, y) => {
    longPressed = false;
    isDragging = false;
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
    onDown(e.clientX, e.clientY);
  });

  cardEl.addEventListener('pointermove', (e) => {
    if (isDragging) {
      e.preventDefault();
      moveDrag(e);
      return;
    }
    if (!pressTimer) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > 10 || dy > 10) {
      // Cancel long-press, start drag
      cancelPress();
      cardEl.classList.remove('kb-pressed');
      isDragging = true;
      cardEl.setPointerCapture(e.pointerId);
      startDrag(cardEl, id, e);
    }
  });

  cardEl.addEventListener('pointerup', (e) => {
    if (isDragging) {
      e.preventDefault();
      endDrag(e);
      return;
    }
    cancelPress();
    cardEl.classList.remove('kb-pressed');
    if (!longPressed) advanceCard(id);
  });

  cardEl.addEventListener('pointercancel', () => {
    if (isDragging) {
      endDrag({ clientX: startX, clientY: startY });
      return;
    }
    cancelPress();
    cardEl.classList.remove('kb-pressed');
  });

  cardEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advanceCard(id); }
    if (e.key === 'e' || e.key === 'E')     { e.preventDefault(); openModal(id); }
    if (e.key === 'Delete')                 { e.preventDefault(); removeCard(id); }
  });
}

// ── Board actions ───────────────────────────────────────────────────────────
function advanceCard(id) {
  const card = cards.find(c => c.id === id);
  if (!card) return;
  const next = NEXT_COLUMN[card.column];
  if (next === card.column) return;
  card.column = next;
  card.order = Date.now();
  save();
  render();
}

function removeCard(id) {
  cards = cards.filter(c => c.id !== id);
  save();
  render();
}

// ── Modal ───────────────────────────────────────────────────────────────────
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
    tags:  (data.get('tags')  || '').toString().trim(),
    due:   (data.get('due')   || '').toString(),
  };
  if (editingId) {
    const card = cards.find(c => c.id === editingId);
    if (card) Object.assign(card, payload);
  } else {
    cards.push({
      id: uid(),
      created: Date.now(),
      order: Date.now(),
      column: form.dataset.column || 'backlog',
      ...payload,
    });
  }
  save();
  closeModal();
  render();
}

// ── Render ──────────────────────────────────────────────────────────────────
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

export function mountKanban() {
  cards = load();
  render();
}
