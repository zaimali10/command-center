import React, { useState } from 'react';

const STORAGE_KEY = 'cc.todos.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function save(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

export default function Todo() {
  const [items, setItems] = useState(load);
  const [text, setText] = useState('');

  function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next = [...items, { id: Date.now() + Math.random(), text: trimmed, done: false }];
    setItems(next);
    save(next);
    setText('');
  }

  function toggle(id) {
    const next = items.map(it => it.id === id ? { ...it, done: !it.done } : it);
    setItems(next);
    save(next);
  }

  function remove(id) {
    const next = items.filter(it => it.id !== id);
    setItems(next);
    save(next);
  }

  return (
    <>
      <div className="todo-input-row">
        <input
          className="todo-input"
          type="text"
          placeholder="add a task…"
          maxLength={140}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
        />
        <button className="todo-add" aria-label="add task" onClick={add}>+</button>
      </div>
      <ul className="todo-list">
        {items.length === 0
          ? <li className="todo-empty">no tasks yet</li>
          : items.map(it => (
              <li key={it.id} className={`todo-item${it.done ? ' done' : ''}`}>
                <button
                  className={`todo-check${it.done ? ' checked' : ''}`}
                  aria-label="toggle"
                  onClick={() => toggle(it.id)}
                />
                <span className="todo-text">{it.text}</span>
                <button className="todo-del" aria-label="delete" onClick={() => remove(it.id)}>×</button>
              </li>
            ))
        }
      </ul>
    </>
  );
}
