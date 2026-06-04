/**
 * Layout – data-driven widget grid.
 *
 * Phase 1: data-driven ordering + responsive column count.
 * No drag yet — that's Phase 2.
 *
 * Design:
 *  - Layout is data stored in localStorage under "cc.layout.v1".
 *  - applyLayout() reorders DOM nodes with appendChild (preserving live state)
 *    and sets data-span attributes. CSS Grid does the visual flow via --cols.
 *  - ResizeObserver with debounce auto-adjusts --cols on iPad/screen resize.
 *  - resetLayout() wipes the saved layout and reloads defaults.
 */

const STORAGE_KEY = 'cc.layout.v1';
const CONTAINER_ID = 'dashboard';

/** Default widget order + spans matching current dashboard content. */
const DEFAULT_LAYOUT = [
  { id: 'widget-weather',   span: 1 },
  { id: 'widget-forecast',  span: 1 },
  { id: 'widget-system',    span: 1 },
  { id: 'widget-skills',    span: 1 },
  { id: 'widget-cron',      span: 'full' },
  { id: 'widget-analytics', span: 2 },
  { id: 'widget-monitor',   span: 1 },
  { id: 'widget-projects',  span: 2 },
  { id: 'widget-discord',   span: 1 },
  { id: 'widget-github',    span: 2 },
  { id: 'widget-sessions',  span: 1 },
];

/**
 * Load persisted layout, falling back to DEFAULT_LAYOUT.
 * Defensive merge: unknown widgets are dropped, missing widgets are
 * appended at the end with their default span.
 */
function loadLayout() {
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
    catch { return null; }
  })();

  if (!Array.isArray(saved) || saved.length === 0) {
    return structuredClone(DEFAULT_LAYOUT);
  }

  const ids = new Set(saved.map(e => e.id));

  // Start with saved order but drop entries whose elements don't exist on the page
  const layout = saved.filter(e => {
    const el = document.getElementById(e.id);
    return el !== null && typeof e.span === 'number' && e.span >= 1;
  });

  // Append any default widgets that weren't in the saved layout
  for (const def of DEFAULT_LAYOUT) {
    if (!ids.has(def.id)) {
      layout.push({ ...def });
    }
  }

  return layout;
}

/**
 * Persist layout to localStorage.
 */
function saveLayout(layout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch { /* quota exceeded – silently ignored */ }
}

/**
 * Apply a layout to the DOM:
 *  - Reorder children of #dashboard via appendChild (preserves state)
 *  - Set data-span on each card
 *  - Set --cols CSS custom property on the container
 */
function applyLayout(layout) {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  const cols = currentCols(container);
  container.style.setProperty('--cols', cols);

  layout.forEach(item => {
    const el = document.getElementById(item.id);
    if (!el) return;
    container.appendChild(el);
    el.dataset.span = String(item.span);
  });
}

/**
 * Determine the column count based on container width.
 * Buckets: >=960px → 3 cols, 640-960px → 2 cols, <640px → 1 col.
 */
function currentCols(container) {
  const w = container.clientWidth;
  if (w >= 960) return 3;
  if (w >= 640) return 2;
  return 1;
}

/**
 * Set up a debounced ResizeObserver on the container.
 * Re-applies --cols on resize so the grid auto-balances.
 * Returns the observer (for teardown if needed).
 */
function watchResize() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  let debounceId = null;
  const handler = () => {
    if (debounceId) clearTimeout(debounceId);
    debounceId = setTimeout(() => {
      container.style.setProperty('--cols', currentCols(container));
    }, 200);
  };

  const ro = new ResizeObserver(handler);
  ro.observe(container);
  return ro;
}

/**
 * Reset layout to defaults: delete stored layout, reload the page.
 */
function resetLayout() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

export {
  DEFAULT_LAYOUT,
  loadLayout,
  saveLayout,
  applyLayout,
  currentCols,
  watchResize,
  resetLayout,
};
