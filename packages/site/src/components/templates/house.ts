import type { Task } from 'gantt-lib';

export const TASKS_HOUSE: Task[] = [
  { id: 'h-p1', name: 'Проектирование', startDate: '2026-03-10', endDate: '2026-04-04' },
  { id: 'h-p1-1', name: 'Архитектурный проект', startDate: '2026-03-10', endDate: '2026-03-19', parentId: 'h-p1', progress: 100, accepted: true },
  // OVERDUE: закончилось 22 марта, выполнено только 20%
  { id: 'h-p1-2', name: 'Геодезия участка', startDate: '2026-03-16', endDate: '2026-03-22', parentId: 'h-p1', progress: 20, dependencies: [{ taskId: 'h-p1-1', type: 'SS' as const, lag: 3 }] },
  { id: 'h-p1-3', name: 'Разрешения и согласования', startDate: '2026-03-23', endDate: '2026-04-04', parentId: 'h-p1', progress: 10, dependencies: [{ taskId: 'h-p1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'h-p2', name: 'Фундамент', startDate: '2026-04-07', endDate: '2026-05-03', dependencies: [{ taskId: 'h-p1', type: 'FS' as const, lag: 0 }] },
  { id: 'h-p2-1', name: 'Земляные работы', startDate: '2026-04-07', endDate: '2026-04-14', parentId: 'h-p2', progress: 0 },
  { id: 'h-p2-2', name: 'Заливка фундамента', startDate: '2026-04-15', endDate: '2026-04-27', parentId: 'h-p2', progress: 0, dependencies: [{ taskId: 'h-p2-1', type: 'FS' as const, lag: 0 }] },
  { id: 'h-p2-3', name: 'Гидроизоляция', startDate: '2026-04-28', endDate: '2026-05-03', parentId: 'h-p2', progress: 0, dependencies: [{ taskId: 'h-p2-2', type: 'FS' as const, lag: 0 }] },
  { id: 'h-p3', name: 'Стены и кровля', startDate: '2026-05-04', endDate: '2026-06-19', dependencies: [{ taskId: 'h-p2', type: 'FS' as const, lag: 0 }] },
  { id: 'h-p3-1', name: 'Возведение стен', startDate: '2026-05-04', endDate: '2026-06-01', parentId: 'h-p3', progress: 0 },
  { id: 'h-p3-2', name: 'Монтаж кровли', startDate: '2026-06-02', endDate: '2026-06-19', parentId: 'h-p3', progress: 0, dependencies: [{ taskId: 'h-p3-1', type: 'FS' as const, lag: 0 }] },
  { id: 'h-p4', name: 'Отделка', startDate: '2026-06-22', endDate: '2026-08-21', dependencies: [{ taskId: 'h-p3', type: 'FS' as const, lag: 0 }] },
  { id: 'h-p4-1', name: 'Инженерные сети', startDate: '2026-06-22', endDate: '2026-07-08', parentId: 'h-p4', progress: 0 },
  { id: 'h-p4-2', name: 'Внутренняя отделка', startDate: '2026-07-09', endDate: '2026-08-21', parentId: 'h-p4', progress: 0, dependencies: [{ taskId: 'h-p4-1', type: 'FS' as const, lag: 0 }] },
  { id: 'h-p5', name: 'Ландшафт', startDate: '2026-08-24', endDate: '2026-09-05', dependencies: [{ taskId: 'h-p4', type: 'FS' as const, lag: 0 }] },
  { id: 'h-p5-1', name: 'Благоустройство', startDate: '2026-08-24', endDate: '2026-09-01', parentId: 'h-p5', progress: 0 },
  { id: 'h-p5-2', name: 'Посадки', startDate: '2026-09-02', endDate: '2026-09-05', parentId: 'h-p5', progress: 0, dependencies: [{ taskId: 'h-p5-1', type: 'FS' as const, lag: 0 }] },
];

export const TEMPLATE_HOUSE = {
  label: 'Загородный дом',
  title: 'Строительство загородного дома',
  prompt: 'Создай график строительства загородного дома: фундамент, стены, кровля, отделка, ландшафт',
  tasks: TASKS_HOUSE,
};
