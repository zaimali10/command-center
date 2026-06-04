import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLayout } from '../context/LayoutContext.jsx';

function SortableCard({ id, span, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const title = id.charAt(0).toUpperCase() + id.slice(1);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card${isDragging ? ' cc-dragging' : ''}`}
      data-span={span}
    >
      <h2 {...attributes} {...listeners}>{title}</h2>
      <p className="empty">widget placeholder</p>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const { widgets, setWidgets } = useLayout();
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  function handleDragStart(event) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveId(null);
    if (over && active.id !== over.id) {
      const oldIndex = widgets.findIndex(w => w.id === active.id);
      const newIndex = widgets.findIndex(w => w.id === over.id);
      setWidgets(arrayMove(widgets, oldIndex, newIndex));
    }
  }

  const activeWidget = activeId ? widgets.find(w => w.id === activeId) : null;
  const activeTitle = activeWidget
    ? activeWidget.id.charAt(0).toUpperCase() + activeWidget.id.slice(1)
    : null;

  return (
    <main id="dashboard">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={widgets.map(w => w.id)}
          strategy={rectSortingStrategy}
        >
          {widgets.map(widget => (
            <SortableCard key={widget.id} id={widget.id} span={widget.span} />
          ))}
        </SortableContext>

        <DragOverlay>
          {activeId ? (
            <div className="cc-ghost">{activeTitle}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}
