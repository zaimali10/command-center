import React, { useState, useRef, useEffect } from 'react';
import { storage } from '../../services/storage.js';
const COLUMNS = [
  { id: 'backlog',     label: 'Backlog'     },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'done',        label: 'Done'        },
];
const NEXT_COLUMN = { backlog: 'in-progress', 'in-progress': 'done', done: 'done' };

function loadCards() {
  return storage.get('kanban_cards', []);
}
function saveCards(cards) {
  storage.set('kanban_cards', cards);
}

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

// ── Drop-zone geometry ───────────────────────────────────────────────────────
function getDropTarget(x, y) {
  const colBodies = document.querySelectorAll('.kb-col-body');
  let best = null;
  let bestDist = Infinity;

  colBodies.forEach(body => {
    const r = body.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top - 40 && y <= r.bottom + 40) {
      const dist = Math.abs(y - (r.top + r.height / 2));
      if (dist < bestDist) { bestDist = dist; best = body; }
    }
  });

  if (!best) return null;

  const colId = best.dataset.col;
  const indicators = best.querySelectorAll('.kb-drop-indicator');
  const cardEls = best.querySelectorAll('.kb-card');
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
      if (prev?.classList.contains('kb-card')) {
        insertAfterId = prev.dataset.id;
        insertBeforeId = null;
      } else if (next?.classList.contains('kb-card')) {
        insertBeforeId = next.dataset.id;
        insertAfterId = null;
      } else {
        insertAfterId = null;
        insertBeforeId = null;
      }
    }
  });

  if (!cardEls.length) return { colId, insertAfterId: null, insertBeforeId: null };
  return { colId, insertAfterId, insertBeforeId };
}

// ── Module-level drag state (one drag at a time) ─────────────────────────────
let activeDrag = null;

function startDragFromCard(cardEl, cardId, e) {
  const rect = cardEl.getBoundingClientRect();
  const ghost = cardEl.cloneNode(true);
  ghost.classList.add('kb-ghost');
  ghost.style.width  = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  ghost.style.left   = (e.clientX - rect.width / 2) + 'px';
  ghost.style.top    = (e.clientY - rect.height / 2) + 'px';
  document.body.appendChild(ghost);
  cardEl.classList.add('kb-dragging');
  activeDrag = { cardId, ghost, cardEl };
}

function moveDrag(e) {
  if (!activeDrag) return;
  activeDrag.ghost.style.left = (e.clientX - activeDrag.ghost.offsetWidth  / 2) + 'px';
  activeDrag.ghost.style.top  = (e.clientY - activeDrag.ghost.offsetHeight / 2) + 'px';

  document.querySelectorAll('.kb-col-body').forEach(b => b.classList.remove('kb-drop-active'));
  const target = getDropTarget(e.clientX, e.clientY);
  if (target) {
    const body = document.querySelector(`.kb-col-body[data-col="${target.colId}"]`);
    if (body) {
      const inds = body.querySelectorAll('.kb-drop-indicator');
      inds.forEach(ind => ind.classList.remove('kb-drop-highlight'));
      let bestInd = null;
      let minDist = Infinity;
      inds.forEach(ind => {
        const r = ind.getBoundingClientRect();
        const dist = Math.abs(e.clientY - (r.top + r.height / 2));
        if (dist < minDist) { minDist = dist; bestInd = ind; }
      });
      if (bestInd) bestInd.classList.add('kb-drop-highlight');
      body.classList.add('kb-drop-active');
    }
  }
}

function endDragCleanup() {
  if (!activeDrag) return;
  activeDrag.ghost.remove();
  activeDrag.cardEl?.classList.remove('kb-dragging');
  document.querySelectorAll('.kb-col-body').forEach(b => b.classList.remove('kb-drop-active'));
  document.querySelectorAll('.kb-drop-indicator').forEach(ind => ind.classList.remove('kb-drop-highlight'));
}

// ── Card component ───────────────────────────────────────────────────────────
function KanbanCard({ card, onAdvance, onDelete, onEdit, onMoveCard }) {
  const pressTimerRef  = useRef(null);
  const startPosRef    = useRef({ x: 0, y: 0 });
  const longPressedRef = useRef(false);
  const isDraggingRef  = useRef(false);
  const cardRef        = useRef(null);

  const tags = tagsArray(card);
  const due  = dueState(card.due);

  function cancelPress() {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
  }

  function handlePointerDown(e) {
    if (e.target.closest('.kb-card-del')) return;
    longPressedRef.current  = false;
    isDraggingRef.current   = false;
    startPosRef.current     = { x: e.clientX, y: e.clientY };
    pressTimerRef.current   = setTimeout(() => {
      longPressedRef.current = true;
      cardRef.current?.classList.add('kb-pressed');
      navigator.vibrate?.(15);
      onEdit(card.id);
    }, 500);
  }

  function handlePointerMove(e) {
    if (isDraggingRef.current) {
      e.preventDefault();
      moveDrag(e);
      return;
    }
    if (!pressTimerRef.current) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > 10 || dy > 10) {
      cancelPress();
      cardRef.current?.classList.remove('kb-pressed');
      isDraggingRef.current = true;
      cardRef.current?.setPointerCapture(e.pointerId);
      startDragFromCard(cardRef.current, card.id, e);
    }
  }

  function handlePointerUp(e) {
    if (isDraggingRef.current) {
      e.preventDefault();
      const target = getDropTarget(e.clientX, e.clientY);
      endDragCleanup();
      activeDrag = null;
      isDraggingRef.current = false;
      if (target) onMoveCard(card.id, target);
      return;
    }
    cancelPress();
    cardRef.current?.classList.remove('kb-pressed');
    if (!longPressedRef.current) onAdvance(card.id);
  }

  function handlePointerCancel() {
    if (isDraggingRef.current) {
      endDragCleanup();
      activeDrag = null;
      isDraggingRef.current = false;
      return;
    }
    cancelPress();
    cardRef.current?.classList.remove('kb-pressed');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdvance(card.id); }
    if (e.key === 'e' || e.key === 'E')     { e.preventDefault(); onEdit(card.id); }
    if (e.key === 'Delete')                 { e.preventDefault(); onDelete(card.id); }
  }

  return (
    <article
      ref={cardRef}
      className="kb-card"
      data-id={card.id}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
    >
      <div className="kb-card-title">{card.title}</div>
      {card.description && <div className="kb-card-desc">{card.description}</div>}
      {(tags.length > 0 || due) && (
        <div className="kb-card-meta">
          {tags.map(t => (
            <span key={t} className="kb-tag" style={{ '--tag-h': tagColor(t) }}>{t}</span>
          ))}
          {due && <span className={`kb-due kb-due-${due.cls}`}>{due.text}</span>}
        </div>
      )}
      <button
        className="kb-card-del"
        aria-label="delete card"
        onClick={e => { e.stopPropagation(); onDelete(card.id); }}
      >×</button>
    </article>
  );
}

// ── Main Kanban component ────────────────────────────────────────────────────
export default function Kanban() {
  const [cards, setCards] = useState(loadCards);
  const [modal, setModal] = useState(null); // null | { mode:'new', column } | { mode:'edit', id }
  const formRef = useRef(null);

  function moveCard(cardId, { colId, insertAfterId, insertBeforeId }) {
    setCards(prev => {
      const colCards = prev
        .filter(c => c.column === colId && c.id !== cardId)
        .sort((a, b) => (a.order || a.created) - (b.order || b.created));

      let movedOrder = Date.now();
      if (insertBeforeId) {
        const idx = colCards.findIndex(c => c.id === insertBeforeId);
        if (idx >= 0) {
          const after = colCards[idx].order || colCards[idx].created;
          movedOrder = idx > 0
            ? ((colCards[idx - 1].order || colCards[idx - 1].created) + after) / 2
            : after - 1000;
        }
      } else if (insertAfterId) {
        const idx = colCards.findIndex(c => c.id === insertAfterId);
        if (idx >= 0) {
          const after = colCards[idx].order || colCards[idx].created;
          movedOrder = idx < colCards.length - 1
            ? (after + (colCards[idx + 1].order || colCards[idx + 1].created)) / 2
            : after + 1000;
        }
      } else if (colCards.length > 0) {
        const last = colCards[colCards.length - 1];
        movedOrder = (last.order || last.created) + 1000;
      }

      const next = prev.map(c =>
        c.id === cardId ? { ...c, column: colId, order: movedOrder } : c
      );
      saveCards(next);
      return next;
    });
  }

  function advanceCard(id) {
    setCards(prev => {
      const next = prev.map(c => {
        if (c.id !== id) return c;
        const nextCol = NEXT_COLUMN[c.column];
        return nextCol === c.column ? c : { ...c, column: nextCol, order: Date.now() };
      });
      saveCards(next);
      return next;
    });
  }

  function removeCard(id) {
    setCards(prev => {
      const next = prev.filter(c => c.id !== id);
      saveCards(next);
      return next;
    });
  }

  function openAdd(column) { setModal({ mode: 'new', column }); }
  function openEdit(id)    { setModal({ mode: 'edit', id }); }
  function closeModal()    { setModal(null); }

  useEffect(() => {
    if (modal && formRef.current) {
      const t = setTimeout(() => formRef.current?.querySelector('[name="title"]')?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [modal]);

  function handleSubmit(e) {
    e.preventDefault();
    const data    = new FormData(e.currentTarget);
    const title   = (data.get('title') || '').toString().trim();
    if (!title) return;
    const payload = {
      title,
      description: (data.get('description') || '').toString().trim(),
      tags:  (data.get('tags') || '').toString().trim(),
      due:   (data.get('due')  || '').toString(),
    };
    if (modal.mode === 'edit') {
      setCards(prev => {
        const next = prev.map(c => c.id === modal.id ? { ...c, ...payload } : c);
        saveCards(next);
        return next;
      });
    } else {
      setCards(prev => {
        const next = [...prev, {
          id: uid(),
          created: Date.now(),
          order: Date.now(),
          column: modal.column || 'backlog',
          ...payload,
        }];
        saveCards(next);
        return next;
      });
    }
    closeModal();
  }

  const editingCard = modal?.mode === 'edit' ? cards.find(c => c.id === modal.id) : null;

  return (
    <div id="widget-kanban">
      <div className="kb-board">
        {COLUMNS.map(col => {
          const colCards = cards
            .filter(c => c.column === col.id)
            .sort((a, b) => (a.order || a.created) - (b.order || b.created));
          return (
            <section key={col.id} className="kb-col" data-col={col.id}>
              <header className="kb-col-head">
                <h3>{col.label}</h3>
                <span className="kb-count">{colCards.length}</span>
                <button className="kb-add" data-col={col.id} aria-label="add card"
                  onClick={() => openAdd(col.id)}>+</button>
              </header>
              <div className="kb-col-body" data-col={col.id}>
                {colCards.length === 0
                  ? <div className="kb-empty">drop something here</div>
                  : colCards.map(card => (
                      <React.Fragment key={card.id}>
                        <KanbanCard
                          card={card}
                          onAdvance={advanceCard}
                          onDelete={removeCard}
                          onEdit={openEdit}
                          onMoveCard={moveCard}
                        />
                        <div className="kb-drop-indicator" data-col={col.id} />
                      </React.Fragment>
                    ))
                }
              </div>
            </section>
          );
        })}
      </div>

      {modal && (
        <div
          className="kb-modal"
          id="kb-modal"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <form
            ref={formRef}
            key={modal.mode + (modal.id || modal.column)}
            className="kb-modal-panel"
            onSubmit={handleSubmit}
          >
            <h3 id="kb-modal-title">{modal.mode === 'edit' ? 'Edit Card' : 'New Card'}</h3>
            <label className="kb-field">
              <span>Title</span>
              <input name="title" type="text" required maxLength={120} autoComplete="off"
                defaultValue={editingCard?.title || ''} />
            </label>
            <label className="kb-field">
              <span>Description</span>
              <textarea name="description" rows={3} maxLength={500}
                defaultValue={editingCard?.description || ''} />
            </label>
            <label className="kb-field">
              <span>Tags <em>(comma-separated)</em></span>
              <input name="tags" type="text" maxLength={120} autoComplete="off"
                placeholder="design, urgent" defaultValue={editingCard?.tags || ''} />
            </label>
            <label className="kb-field">
              <span>Due date</span>
              <input name="due" type="date" defaultValue={editingCard?.due || ''} />
            </label>
            <div className="kb-modal-actions">
              <button type="button" className="kb-btn-ghost" onClick={closeModal}>Cancel</button>
              <button type="submit" className="kb-btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
