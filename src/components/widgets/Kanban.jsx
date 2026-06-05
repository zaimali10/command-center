import React, { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  useDroppable,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePollingFetch } from '../../hooks/usePollingFetch.js';

// Column mapping from queue status to board columns
const STATUS_TO_COLUMN = {
  'waiting': 'To Do',
  'in_progress': 'Working',
  'done': 'Completed',
  'failed': 'Blocked',
  'paused': 'Blocked'
};

const COLUMN_TO_STATUS = {
  'To Do': 'waiting',
  'Working': 'in_progress',
  'Completed': 'done',
  'Blocked': 'paused'
};

const COLUMNS = ['To Do', 'Working', 'Completed', 'Blocked'];

// Model badge color mapping
function getModelColor(model) {
  if (!model) return '#666';
  if (model.includes('claude')) return '#00ffd0';
  if (model.includes('sonnet')) return '#7afcff';
  if (model.includes('opus')) return '#ff5577';
  if (model.includes('haiku')) return '#ffaa33';
  return '#9aa9c2';
}

// Status dot mapping
function getStatusDot(status) {
  switch (status) {
    case 'waiting': return 'wq-waiting';
    case 'in_progress': return 'wq-running';
    case 'done': return 'wq-done';
    case 'failed':
    case 'paused': return 'wq-failed';
    default: return 'wq-waiting';
  }
}

// Format timestamp for completed items
function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Individual draggable card component
function QueueCard({ item }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const modelColor = getModelColor(item.model);
  const statusDotClass = getStatusDot(item.status);
  const isCompleted = item.status === 'done' || item.status === 'failed';

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`kb-card ${isDragging ? 'kb-dragging' : ''}`}
      data-id={item.id}
    >
      <div className="kb-card-title">{item.label || 'Untitled Task'}</div>

      <div className="kb-card-meta">
        {/* Status dot */}
        <div className={`wq-dot ${statusDotClass}`} title={`Status: ${item.status}`}></div>

        {/* Model badge */}
        {item.model && (
          <span
            className="kb-tag"
            style={{
              '--tag-h': '0',
              color: modelColor,
              background: `${modelColor}20`,
              borderColor: `${modelColor}50`
            }}
          >
            {item.model.replace('claude-', '').replace('-20250514', '')}
          </span>
        )}

        {/* Completion timestamp */}
        {isCompleted && item.completed_at && (
          <span className="kb-due kb-due-later">
            {formatTimestamp(item.completed_at)}
          </span>
        )}
      </div>
    </article>
  );
}

// Droppable column component
function KanbanColumn({ title, items, columnId }) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
  });

  return (
    <section className="kb-col" data-col={columnId}>
      <header className="kb-col-head">
        <h3>{title}</h3>
        <span className="kb-count">{items.length}</span>
      </header>

      <div
        ref={setNodeRef}
        className={`kb-col-body ${isOver ? 'kb-drop-active' : ''}`}
        data-col={columnId}
      >
        <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
          {items.length === 0 ? (
            <div className="kb-empty">No items</div>
          ) : (
            items.map(item => (
              <QueueCard key={item.id} item={item} />
            ))
          )}
        </SortableContext>
      </div>
    </section>
  );
}

// Main Kanban component
export default function Kanban() {
  const [activeId, setActiveId] = useState(null);

  // Fetch queue data with 15s polling, no retry
  const { data: queueItems, error, isLoading } = usePollingFetch(
    'http://localhost:8089/api/queue',
    15000, // 15 seconds
    { retry: 0 }
  );

  // Set up drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 8,
      },
    })
  );

  // Group items by column
  const itemsByColumn = useMemo(() => {
    if (!queueItems || !Array.isArray(queueItems)) {
      return COLUMNS.reduce((acc, col) => ({ ...acc, [col]: [] }), {});
    }

    return queueItems.reduce((acc, item) => {
      const column = STATUS_TO_COLUMN[item.status] || 'Blocked';
      if (!acc[column]) acc[column] = [];
      acc[column].push(item);
      return acc;
    }, COLUMNS.reduce((acc, col) => ({ ...acc, [col]: [] }), {}));
  }, [queueItems]);

  // Find the active item being dragged
  const activeItem = useMemo(() => {
    if (!activeId || !queueItems) return null;
    return queueItems.find(item => item.id === activeId);
  }, [activeId, queueItems]);

  // Handle drag start
  function handleDragStart(event) {
    setActiveId(event.active.id);
  }

  // Handle drag end
  async function handleDragEnd(event) {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    // Determine the target column
    let targetColumn = over.id;

    // If dropped on another item, find which column that item belongs to
    if (queueItems) {
      const overItem = queueItems.find(item => item.id === over.id);
      if (overItem) {
        targetColumn = STATUS_TO_COLUMN[overItem.status] || 'Blocked';
      }
    }

    // If it's not a column ID, check if it's a valid column
    if (!COLUMNS.includes(targetColumn)) {
      return;
    }

    const newStatus = COLUMN_TO_STATUS[targetColumn];
    if (!newStatus) return;

    // Find the item being moved
    const activeItem = queueItems?.find(item => item.id === active.id);
    if (!activeItem || activeItem.status === newStatus) return;

    // Send PATCH request to update status
    try {
      const response = await fetch(`http://localhost:8089/api/queue/${active.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      console.warn('Failed to update queue item status:', err);
    }
  }

  if (error) {
    return (
      <div id="widget-kanban">
        <div className="wq-err">
          Failed to load queue: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div id="widget-kanban">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="kb-board">
          {COLUMNS.map(columnId => (
            <KanbanColumn
              key={columnId}
              title={columnId}
              columnId={columnId}
              items={itemsByColumn[columnId] || []}
            />
          ))}
        </div>

        <DragOverlay>
          {activeItem ? (
            <div className="kb-ghost">
              <div className="kb-card-title">{activeItem.label || 'Untitled Task'}</div>
              <div className="kb-card-meta">
                <div className={`wq-dot ${getStatusDot(activeItem.status)}`}></div>
                {activeItem.model && (
                  <span
                    className="kb-tag"
                    style={{
                      '--tag-h': '0',
                      color: getModelColor(activeItem.model),
                      background: `${getModelColor(activeItem.model)}20`,
                      borderColor: `${getModelColor(activeItem.model)}50`
                    }}
                  >
                    {activeItem.model.replace('claude-', '').replace('-20250514', '')}
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}