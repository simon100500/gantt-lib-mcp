import { useRef, useEffect } from 'react';
import { gantt } from 'dhtmlx-gantt';
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css';
import type { Task } from '../types.ts';

interface GanttChartProps {
  tasks: Task[];
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start);
  const b = new Date(end);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

export function GanttChart({ tasks }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!initialized.current) {
      gantt.config.date_format = '%Y-%m-%d';
      gantt.config.xml_date = '%Y-%m-%d';
      gantt.init(containerRef.current);
      initialized.current = true;
    }
  }, []);

  useEffect(() => {
    if (!initialized.current) return;
    gantt.clearAll();
    if (tasks.length === 0) return;

    gantt.parse({
      data: tasks.map(t => ({
        id: t.id,
        text: t.name,
        start_date: t.startDate,
        duration: daysBetween(t.startDate, t.endDate),
        color: t.color ?? '#4f9cf9',
        progress: (t.progress ?? 0) / 100,
      })),
      links: tasks.flatMap(t =>
        (t.dependencies ?? []).map((dep, i) => ({
          id: `${t.id}-${i}`,
          source: dep.taskId,
          target: t.id,
          type: dep.type === 'FS' ? '0'
            : dep.type === 'SS' ? '1'
            : dep.type === 'FF' ? '2'
            : '3',
        }))
      ),
    });
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
        <p>No tasks yet. Start a conversation to create your Gantt chart.</p>
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
