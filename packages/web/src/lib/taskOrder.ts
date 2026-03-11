import type { Task } from '../types.ts';

export function normalizeTaskOrder(tasks: Task[]): Task[] {
  return tasks.map((task, index) => (
    task.order === index ? task : { ...task, order: index }
  ));
}

export function sortTasksByOrder(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });
}
