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
import Weather from './widgets/Weather.jsx';
import Forecast from './widgets/Forecast.jsx';
import System from './widgets/System.jsx';
import Skills from './widgets/Skills.jsx';
import Cron from './widgets/Cron.jsx';
import Github from './widgets/Github.jsx';
import Projects from './widgets/Projects.jsx';
import Discord from './widgets/Discord.jsx';
import Analytics from './widgets/Analytics.jsx';
import Sessions from './widgets/Sessions.jsx';

const WIDGET_COMPONENTS = {
  'widget-weather':   Weather,
  'widget-forecast':  Forecast,
  'widget-system':    System,
  'widget-skills':    Skills,
  'widget-cron':      Cron,
  'widget-github':    Github,
  'widget-projects':  Projects,
  'widget-discord':   Discord,
  'widget-analytics': Analytics,
  'widget-sessions':  Sessions,
};

const TITLE_MAP = {
  'widget-weather':   'Weather · Dallas',
  'widget-forecast':  '3-Day Forecast',
  'widget-system':    'System',
  'widget-skills':    'Skills',
  'widget-cron':      'Cron Jobs',
  'widget-analytics': 'Usage Analytics',
  'widget-monitor':   'System Monitor',
  'widget-projects':  'Projects',
  'widget-discord':   'Quick Chat',
  'widget-github':    'GitHub Pulse',
  'widget-sessions':  'Recent Sessions',
};

function SortableCard({ id, span }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const gridColumn =
    span === 'full' ? '1 / -1' :
    span === 2      ? 'span 2' :
    undefined;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(gridColumn ? { gridColumn } : {}),
  };

  const title = TITLE_MAP[id] || id;
  const WidgetComponent = WIDGET_COMPONENTS[id] || null;

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`card${isDragging ? ' cc-dragging' : ''}`}
      data-span={span}
    >
      <h2 {...attributes} {...listeners}>{title}</h2>
      {WidgetComponent ? <WidgetComponent /> : <p className="empty">widget placeholder</p>}
    </section>
  );
}

export default function Dashboard() {
  const { order, setOrder } = useLayout();
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
      const oldIndex = order.findIndex(w => w.id === active.id);
      const newIndex = order.findIndex(w => w.id === over.id);
      setOrder(arrayMove(order, oldIndex, newIndex));
    }
  }

  const activeWidget = activeId ? order.find(w => w.id === activeId) : null;
  const activeTitle = activeWidget ? (TITLE_MAP[activeWidget.id] || activeWidget.id) : null;

  return (
    <main id="dashboard">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={order.map(w => w.id)}
          strategy={rectSortingStrategy}
        >
          {order.map(widget => (
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
