import React, { useState } from 'react';
import { storage } from '../../services/storage.js';

const CATEGORIES = [
  'Produce', 'Dairy & Eggs', 'Meat & Seafood', 'Pantry',
  'Frozen', 'Bakery', 'Beverages', 'Other',
];

function load() {
  return storage.get('grocery_items', []);
}
function save(items) {
  storage.set('grocery_items', items);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function Grocery() {
  const [items, setItems] = useState(load);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [collapsed, setCollapsed] = useState({});

  function addItem() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = [...items, { id: uid(), name: trimmed, category, quantity: '', bought: false, created: Date.now() }];
    setItems(next);
    save(next);
    setName('');
  }

  function toggleBought(id) {
    const next = items.map(it => it.id === id ? { ...it, bought: !it.bought } : it);
    setItems(next);
    save(next);
  }

  function removeItem(id) {
    const next = items.filter(it => it.id !== id);
    setItems(next);
    save(next);
  }

  function toggleCollapse(cat) {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  }

  // Group items by category, sort bought to bottom within each group
  const grouped = CATEGORIES.map(cat => ({
    category: cat,
    items: items
      .filter(it => it.category === cat)
      .sort((a, b) => (a.bought === b.bought ? 0 : a.bought ? 1 : -1)),
  })).filter(g => g.items.length > 0);

  const totalActive = items.filter(it => !it.bought).length;

  return (
    <>
      <div className="grocery-input-row">
        <input
          className="grocery-input"
          type="text"
          placeholder="add an item…"
          maxLength={100}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
        />
        <select
          className="grocery-cat-select"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="grocery-add" aria-label="add item" onClick={addItem}>+</button>
      </div>
      <div className="grocery-count">{totalActive} item{totalActive !== 1 ? 's' : ''} remaining</div>
      <div className="grocery-list">
        {grouped.length === 0 ? (
          <div className="grocery-empty">no items yet</div>
        ) : (
          grouped.map(group => (
            <div key={group.category} className="grocery-group">
              <button
                className="grocery-cat-head"
                onClick={() => toggleCollapse(group.category)}
                aria-label={`toggle ${group.category}`}
              >
                <span className={`grocery-cat-arrow ${collapsed[group.category] ? '' : 'open'}`}>▶</span>
                <span className="grocery-cat-label">{group.category}</span>
                <span className="grocery-cat-count">{group.items.length}</span>
              </button>
              {!collapsed[group.category] && group.items.map(it => (
                <div key={it.id} className={`grocery-item${it.bought ? ' bought' : ''}`}>
                  <button
                    className={`grocery-check${it.bought ? ' checked' : ''}`}
                    aria-label="toggle bought"
                    onClick={() => toggleBought(it.id)}
                  />
                  <span className="grocery-name">{it.name}</span>
                  <button
                    className="grocery-del"
                    aria-label="remove item"
                    onClick={() => removeItem(it.id)}
                  >×</button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}
