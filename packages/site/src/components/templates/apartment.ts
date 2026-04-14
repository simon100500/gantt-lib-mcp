import type { Task } from 'gantt-lib';

export const TASKS_APARTMENT: Task[] = [
  { id: 'ap-p1', name: 'Демонтаж', startDate: '2026-03-10', endDate: '2026-03-17' },
  { id: 'ap-p1-1', name: 'Снос перегородок', startDate: '2026-03-10', endDate: '2026-03-14', parentId: 'ap-p1', progress: 100, accepted: true },
  { id: 'ap-p1-2', name: 'Вывоз мусора', startDate: '2026-03-15', endDate: '2026-03-17', parentId: 'ap-p1', progress: 100, accepted: true, dependencies: [{ taskId: 'ap-p1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'ap-p2', name: 'Электрика и сантехника', startDate: '2026-03-18', endDate: '2026-04-08' },
  // OVERDUE: закончилось 22 марта, выполнено только 30%
  { id: 'ap-p2-1', name: 'Штробление стен', startDate: '2026-03-18', endDate: '2026-03-22', parentId: 'ap-p2', progress: 30 },
  { id: 'ap-p2-2', name: 'Разводка электрики и труб', startDate: '2026-03-23', endDate: '2026-04-05', parentId: 'ap-p2', progress: 0, dependencies: [{ taskId: 'ap-p2-1', type: 'FS' as const, lag: 0 }] },
  { id: 'ap-p2-3', name: 'Заделка штроб', startDate: '2026-04-06', endDate: '2026-04-08', parentId: 'ap-p2', progress: 0, dependencies: [{ taskId: 'ap-p2-2', type: 'FS' as const, lag: 0 }] },
  { id: 'ap-p3', name: 'Стяжка и штукатурка', startDate: '2026-04-09', endDate: '2026-05-02', dependencies: [{ taskId: 'ap-p2', type: 'FS' as const, lag: 0 }] },
  { id: 'ap-p3-1', name: 'Стяжка пола', startDate: '2026-04-09', endDate: '2026-04-22', parentId: 'ap-p3', progress: 0 },
  { id: 'ap-p3-2', name: 'Штукатурка стен', startDate: '2026-04-15', endDate: '2026-05-02', parentId: 'ap-p3', progress: 0, dependencies: [{ taskId: 'ap-p3-1', type: 'SS' as const, lag: 3 }] },
  { id: 'ap-p4', name: 'Плитка и сантехника', startDate: '2026-05-05', endDate: '2026-05-23', dependencies: [{ taskId: 'ap-p3', type: 'FS' as const, lag: 0 }] },
  { id: 'ap-p4-1', name: 'Плитка в санузлах', startDate: '2026-05-05', endDate: '2026-05-16', parentId: 'ap-p4', progress: 0 },
  { id: 'ap-p4-2', name: 'Установка сантехники', startDate: '2026-05-17', endDate: '2026-05-23', parentId: 'ap-p4', progress: 0, dependencies: [{ taskId: 'ap-p4-1', type: 'FS' as const, lag: 0 }] },
  { id: 'ap-p5', name: 'Чистовая отделка', startDate: '2026-05-26', endDate: '2026-06-20', dependencies: [{ taskId: 'ap-p4', type: 'FS' as const, lag: 0 }] },
  { id: 'ap-p5-1', name: 'Напольное покрытие', startDate: '2026-05-26', endDate: '2026-06-06', parentId: 'ap-p5', progress: 0 },
  { id: 'ap-p5-2', name: 'Покраска и обои', startDate: '2026-06-02', endDate: '2026-06-13', parentId: 'ap-p5', progress: 0 },
  { id: 'ap-p5-3', name: 'Двери и плинтусы', startDate: '2026-06-14', endDate: '2026-06-20', parentId: 'ap-p5', progress: 0, dependencies: [{ taskId: 'ap-p5-1', type: 'FS' as const, lag: 0 }, { taskId: 'ap-p5-2', type: 'FS' as const, lag: 0 }] },
  { id: 'ap-p6', name: 'Мебель и техника', startDate: '2026-06-23', endDate: '2026-06-30', dependencies: [{ taskId: 'ap-p5', type: 'FS' as const, lag: 0 }] },
  { id: 'ap-p6-1', name: 'Сборка мебели', startDate: '2026-06-23', endDate: '2026-06-27', parentId: 'ap-p6', progress: 0 },
  { id: 'ap-p6-2', name: 'Подключение техники', startDate: '2026-06-28', endDate: '2026-06-30', parentId: 'ap-p6', progress: 0, dependencies: [{ taskId: 'ap-p6-1', type: 'FS' as const, lag: 0 }] },
];

export const TEMPLATE_APARTMENT = {
  label: 'Ремонт квартиры',
  title: 'Ремонт квартиры',
  prompt: 'Создай график ремонта двушки 60м²: демонтаж, электрика и сантехника параллельно, стяжка, штукатурка, плитка в санузле, чистовая отделка, мебель',
  tasks: TASKS_APARTMENT,
};
