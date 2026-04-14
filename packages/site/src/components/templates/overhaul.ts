import type { Task } from 'gantt-lib';

export const TASKS_OVERHAUL: Task[] = [
  { id: 'ov-p1', name: 'Подготовка', startDate: '2026-03-10', endDate: '2026-03-20' },
  { id: 'ov-p1-1', name: 'Дефектовка и смета', startDate: '2026-03-10', endDate: '2026-03-14', parentId: 'ov-p1', progress: 100, accepted: true },
  { id: 'ov-p1-2', name: 'Отключение коммуникаций', startDate: '2026-03-15', endDate: '2026-03-17', parentId: 'ov-p1', progress: 100, accepted: true, dependencies: [{ taskId: 'ov-p1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'ov-p1-3', name: 'Демонтаж покрытий', startDate: '2026-03-18', endDate: '2026-03-20', parentId: 'ov-p1', progress: 100, accepted: true, dependencies: [{ taskId: 'ov-p1-2', type: 'FS' as const, lag: 0 }] },
  { id: 'ov-p2', name: 'Конструктив', startDate: '2026-03-23', endDate: '2026-04-18', dependencies: [{ taskId: 'ov-p1', type: 'FS' as const, lag: 0 }] },
  // OVERDUE: закончилось 27 марта, выполнено только 35%
  { id: 'ov-p2-1', name: 'Усиление перекрытий', startDate: '2026-03-23', endDate: '2026-03-27', parentId: 'ov-p2', progress: 35 },
  { id: 'ov-p2-2', name: 'Замена кровли', startDate: '2026-03-28', endDate: '2026-04-11', parentId: 'ov-p2', progress: 0, dependencies: [{ taskId: 'ov-p2-1', type: 'FS' as const, lag: 0 }] },
  { id: 'ov-p2-3', name: 'Ремонт фасада', startDate: '2026-03-28', endDate: '2026-04-18', parentId: 'ov-p2', progress: 0 },
  { id: 'ov-p3', name: 'Инженерные сети', startDate: '2026-04-21', endDate: '2026-05-22', dependencies: [{ taskId: 'ov-p2', type: 'FS' as const, lag: 0 }] },
  { id: 'ov-p3-1', name: 'Замена трубопроводов', startDate: '2026-04-21', endDate: '2026-05-02', parentId: 'ov-p3', progress: 0 },
  { id: 'ov-p3-2', name: 'Электроснабжение', startDate: '2026-04-21', endDate: '2026-05-09', parentId: 'ov-p3', progress: 0 },
  { id: 'ov-p3-3', name: 'Отопление', startDate: '2026-05-05', endDate: '2026-05-22', parentId: 'ov-p3', progress: 0, dependencies: [{ taskId: 'ov-p3-1', type: 'FS' as const, lag: 0 }] },
  { id: 'ov-p4', name: 'Отделка', startDate: '2026-05-25', endDate: '2026-07-03', dependencies: [{ taskId: 'ov-p3', type: 'FS' as const, lag: 0 }] },
  { id: 'ov-p4-1', name: 'Стяжка и штукатурка', startDate: '2026-05-25', endDate: '2026-06-19', parentId: 'ov-p4', progress: 0 },
  { id: 'ov-p4-2', name: 'Чистовая отделка', startDate: '2026-06-22', endDate: '2026-07-03', parentId: 'ov-p4', progress: 0, dependencies: [{ taskId: 'ov-p4-1', type: 'FS' as const, lag: 0 }] },
  { id: 'ov-p5', name: 'Сдача объекта', startDate: '2026-07-06', endDate: '2026-07-11', dependencies: [{ taskId: 'ov-p4', type: 'FS' as const, lag: 0 }] },
  { id: 'ov-p5-1', name: 'Приёмка и замечания', startDate: '2026-07-06', endDate: '2026-07-09', parentId: 'ov-p5', progress: 0 },
  { id: 'ov-p5-2', name: 'Устранение недостатков', startDate: '2026-07-10', endDate: '2026-07-11', parentId: 'ov-p5', progress: 0, dependencies: [{ taskId: 'ov-p5-1', type: 'FS' as const, lag: 0 }] },
];

export const TEMPLATE_OVERHAUL = {
  label: 'Капремонт',
  title: 'Капитальный ремонт здания',
  prompt: 'Создай график капремонта жилого дома: дефектовка, усиление конструкций, замена кровли, ремонт фасада, замена инженерных сетей, отделка',
  tasks: TASKS_OVERHAUL,
};
