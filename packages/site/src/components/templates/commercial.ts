import type { Task } from 'gantt-lib';

// ── Новое строительство коммерческого здания 6 этажей ────────────────────────
// Структура: Фаза → Подфаза → Задача (3 уровня)
// Вехи: РНС, Нулевой цикл, Здание под кровлей, Ввод в эксплуатацию
// Сегодня ≈ 2026-03-24. Проект стартовал в январе 2026, завершение — октябрь 2027.

export const TASKS_COMMERCIAL: Task[] = [

  // ── Фаза 1: Проектирование и согласования ───────────────────────────────
  { id: 'cb-p1', name: 'Проектирование и согласования', startDate: '2026-01-05', endDate: '2026-04-18' },

  { id: 'cb-p1-1', name: 'ПИР и согласования', startDate: '2026-01-05', endDate: '2026-04-18', parentId: 'cb-p1' },
  { id: 'cb-p1-1-1', name: 'Разработка проектной документации', startDate: '2026-01-05', endDate: '2026-02-13', parentId: 'cb-p1-1', progress: 100, accepted: true },
  // OVERDUE: экспертиза закончилась 20 марта, выполнено только 40%
  { id: 'cb-p1-1-2', name: 'Государственная экспертиза', startDate: '2026-02-16', endDate: '2026-03-20', parentId: 'cb-p1-1', progress: 40, dependencies: [{ taskId: 'cb-p1-1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p1-1-3', name: 'Согласование с надзорными органами', startDate: '2026-03-23', endDate: '2026-04-11', parentId: 'cb-p1-1', progress: 0, dependencies: [{ taskId: 'cb-p1-1-2', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p1-1-4', name: 'Получение разрешения на строительство', startDate: '2026-04-14', endDate: '2026-04-18', parentId: 'cb-p1-1', progress: 0, dependencies: [{ taskId: 'cb-p1-1-3', type: 'FS' as const, lag: 0 }] },

  { id: 'cb-p1-2', name: 'Организация площадки', startDate: '2026-03-09', endDate: '2026-04-18', parentId: 'cb-p1' },
  { id: 'cb-p1-2-1', name: 'Ограждение и временные сооружения', startDate: '2026-03-09', endDate: '2026-03-13', parentId: 'cb-p1-2', progress: 100, accepted: true },
  { id: 'cb-p1-2-2', name: 'Вынос коммуникаций из пятна застройки', startDate: '2026-03-16', endDate: '2026-04-18', parentId: 'cb-p1-2', progress: 10, dependencies: [{ taskId: 'cb-p1-2-1', type: 'FS' as const, lag: 0 }] },

  // Веха: Разрешение на строительство получено
  { id: 'cb-m1', name: 'РНС получено', type: 'milestone' as const, startDate: '2026-04-18', endDate: '2026-04-18', parentId: 'cb-p1', dependencies: [{ taskId: 'cb-p1-1-4', type: 'FS' as const, lag: 0 }] },

  // ── Фаза 2: Нулевой цикл ───────────────────────────────────────────────
  { id: 'cb-p2', name: 'Нулевой цикл', startDate: '2026-04-21', endDate: '2026-08-21' },

  { id: 'cb-p2-1', name: 'Котлован', startDate: '2026-04-21', endDate: '2026-06-05', parentId: 'cb-p2' },
  { id: 'cb-p2-1-1', name: 'Разработка котлована', startDate: '2026-04-21', endDate: '2026-05-09', parentId: 'cb-p2-1', progress: 0, dependencies: [{ taskId: 'cb-p1-1-4', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p2-1-2', name: 'Вывоз грунта', startDate: '2026-04-28', endDate: '2026-06-05', parentId: 'cb-p2-1', progress: 0, dependencies: [{ taskId: 'cb-p2-1-1', type: 'SS' as const, lag: 5 }] },

  { id: 'cb-p2-2', name: 'Фундамент', startDate: '2026-06-08', endDate: '2026-08-21', parentId: 'cb-p2' },
  { id: 'cb-p2-2-1', name: 'Забивка свай', startDate: '2026-06-08', endDate: '2026-06-20', parentId: 'cb-p2-2', progress: 0, dependencies: [{ taskId: 'cb-p2-1-2', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p2-2-2', name: 'Ростверк и фундаментная плита', startDate: '2026-06-23', endDate: '2026-07-31', parentId: 'cb-p2-2', progress: 0, dependencies: [{ taskId: 'cb-p2-2-1', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p2-2-3', name: 'Гидроизоляция и обратная засыпка', startDate: '2026-08-03', endDate: '2026-08-21', parentId: 'cb-p2-2', progress: 0, dependencies: [{ taskId: 'cb-p2-2-2', type: 'FS' as const, lag: 0 }] },

  // Веха: Нулевой цикл завершён
  { id: 'cb-m2', name: 'Нулевой цикл завершён', type: 'milestone' as const, startDate: '2026-08-21', endDate: '2026-08-21', parentId: 'cb-p2', dependencies: [{ taskId: 'cb-p2-2-3', type: 'FS' as const, lag: 0 }] },

  // ── Фаза 3: Надземная часть ─────────────────────────────────────────────
  { id: 'cb-p3', name: 'Надземная часть', startDate: '2026-08-24', endDate: '2027-03-13' },

  { id: 'cb-p3-1', name: 'Монолитный каркас', startDate: '2026-08-24', endDate: '2027-01-30', parentId: 'cb-p3' },
  { id: 'cb-p3-1-1', name: 'Монолит 1–2 этажей', startDate: '2026-08-24', endDate: '2026-10-16', parentId: 'cb-p3-1', progress: 0, dependencies: [{ taskId: 'cb-p2-2-3', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p3-1-2', name: 'Монолит 3–4 этажей', startDate: '2026-10-19', endDate: '2026-12-05', parentId: 'cb-p3-1', progress: 0, dependencies: [{ taskId: 'cb-p3-1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p3-1-3', name: 'Монолит 5–6 этажей и технический этаж', startDate: '2026-12-07', endDate: '2027-01-30', parentId: 'cb-p3-1', progress: 0, dependencies: [{ taskId: 'cb-p3-1-2', type: 'FS' as const, lag: 0 }] },

  { id: 'cb-p3-2', name: 'Кровля, фасад и остекление', startDate: '2027-02-02', endDate: '2027-03-13', parentId: 'cb-p3' },
  { id: 'cb-p3-2-1', name: 'Кровля', startDate: '2027-02-02', endDate: '2027-02-27', parentId: 'cb-p3-2', progress: 0, dependencies: [{ taskId: 'cb-p3-1-3', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p3-2-2', name: 'Фасадные системы', startDate: '2027-02-09', endDate: '2027-03-06', parentId: 'cb-p3-2', progress: 0, dependencies: [{ taskId: 'cb-p3-2-1', type: 'SS' as const, lag: 5 }] },
  { id: 'cb-p3-2-3', name: 'Витражное остекление', startDate: '2027-02-23', endDate: '2027-03-13', parentId: 'cb-p3-2', progress: 0, dependencies: [{ taskId: 'cb-p3-2-2', type: 'SS' as const, lag: 10 }] },

  // Веха: Здание под кровлей
  { id: 'cb-m3', name: 'Здание под кровлей', type: 'milestone' as const, startDate: '2027-02-27', endDate: '2027-02-27', parentId: 'cb-p3', dependencies: [{ taskId: 'cb-p3-2-1', type: 'FS' as const, lag: 0 }] },

  // ── Фаза 4: Инженерные системы ──────────────────────────────────────────
  // Стартует сразу после монолита 1-2 этажей — работы ведутся снизу вверх
  { id: 'cb-p4', name: 'Инженерные системы', startDate: '2026-10-19', endDate: '2027-04-04' },

  { id: 'cb-p4-1', name: 'Сантехника и вентиляция', startDate: '2026-10-19', endDate: '2027-02-28', parentId: 'cb-p4' },
  { id: 'cb-p4-1-1', name: 'Стояки и разводка ВК', startDate: '2026-10-19', endDate: '2026-12-05', parentId: 'cb-p4-1', progress: 0, dependencies: [{ taskId: 'cb-p3-1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p4-1-2', name: 'Вентиляция и кондиционирование', startDate: '2026-11-02', endDate: '2027-01-16', parentId: 'cb-p4-1', progress: 0, dependencies: [{ taskId: 'cb-p4-1-1', type: 'SS' as const, lag: 10 }] },
  { id: 'cb-p4-1-3', name: 'Система отопления', startDate: '2026-12-08', endDate: '2027-02-28', parentId: 'cb-p4-1', progress: 0, dependencies: [{ taskId: 'cb-p4-1-1', type: 'FS' as const, lag: 0 }] },

  { id: 'cb-p4-2', name: 'Электрика и слаботочные системы', startDate: '2026-10-19', endDate: '2027-04-04', parentId: 'cb-p4' },
  { id: 'cb-p4-2-1', name: 'Силовая электрика', startDate: '2026-10-19', endDate: '2027-01-16', parentId: 'cb-p4-2', progress: 0, dependencies: [{ taskId: 'cb-p3-1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p4-2-2', name: 'Слаботочные системы (АППЗ, СКУД, ДС)', startDate: '2027-01-19', endDate: '2027-03-06', parentId: 'cb-p4-2', progress: 0, dependencies: [{ taskId: 'cb-p4-2-1', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p4-2-3', name: 'ПНР инженерных систем', startDate: '2027-03-09', endDate: '2027-04-04', parentId: 'cb-p4-2', progress: 0, dependencies: [{ taskId: 'cb-p4-2-2', type: 'FS' as const, lag: 0 }, { taskId: 'cb-p4-1-3', type: 'FS' as const, lag: 0 }] },

  // ── Фаза 5: Отделка ─────────────────────────────────────────────────────
  { id: 'cb-p5', name: 'Отделка', startDate: '2027-04-07', endDate: '2027-07-25' },

  { id: 'cb-p5-1', name: 'Черновая отделка', startDate: '2027-04-07', endDate: '2027-06-06', parentId: 'cb-p5' },
  { id: 'cb-p5-1-1', name: 'Стяжка пола', startDate: '2027-04-07', endDate: '2027-04-30', parentId: 'cb-p5-1', progress: 0, dependencies: [{ taskId: 'cb-p4-2-3', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p5-1-2', name: 'Штукатурка стен', startDate: '2027-04-14', endDate: '2027-06-06', parentId: 'cb-p5-1', progress: 0, dependencies: [{ taskId: 'cb-p5-1-1', type: 'SS' as const, lag: 5 }] },

  { id: 'cb-p5-2', name: 'Чистовая отделка', startDate: '2027-06-09', endDate: '2027-07-25', parentId: 'cb-p5' },
  { id: 'cb-p5-2-1', name: 'Напольные покрытия', startDate: '2027-06-09', endDate: '2027-06-30', parentId: 'cb-p5-2', progress: 0, dependencies: [{ taskId: 'cb-p5-1-2', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p5-2-2', name: 'Финишная покраска и обшивка', startDate: '2027-06-16', endDate: '2027-07-11', parentId: 'cb-p5-2', progress: 0, dependencies: [{ taskId: 'cb-p5-2-1', type: 'SS' as const, lag: 5 }] },
  { id: 'cb-p5-2-3', name: 'Двери, перегородки и малярные работы', startDate: '2027-07-14', endDate: '2027-07-25', parentId: 'cb-p5-2', progress: 0, dependencies: [{ taskId: 'cb-p5-2-2', type: 'FS' as const, lag: 0 }] },

  // ── Фаза 6: Благоустройство и сдача ─────────────────────────────────────
  { id: 'cb-p6', name: 'Благоустройство и сдача', startDate: '2027-07-28', endDate: '2027-10-17' },

  { id: 'cb-p6-1', name: 'Благоустройство территории', startDate: '2027-07-28', endDate: '2027-09-05', parentId: 'cb-p6' },
  { id: 'cb-p6-1-1', name: 'Дорожки, мощение и дренаж', startDate: '2027-07-28', endDate: '2027-08-22', parentId: 'cb-p6-1', progress: 0 },
  { id: 'cb-p6-1-2', name: 'Озеленение и малые архитектурные формы', startDate: '2027-08-25', endDate: '2027-09-05', parentId: 'cb-p6-1', progress: 0, dependencies: [{ taskId: 'cb-p6-1-1', type: 'FS' as const, lag: 0 }] },

  { id: 'cb-p6-2', name: 'Ввод в эксплуатацию', startDate: '2027-09-08', endDate: '2027-10-10', parentId: 'cb-p6' },
  { id: 'cb-p6-2-1', name: 'Комплексное опробование', startDate: '2027-09-08', endDate: '2027-09-26', parentId: 'cb-p6-2', progress: 0, dependencies: [{ taskId: 'cb-p5-2-3', type: 'FS' as const, lag: 0 }] },
  { id: 'cb-p6-2-2', name: 'Устранение замечаний', startDate: '2027-09-29', endDate: '2027-10-10', parentId: 'cb-p6-2', progress: 0, dependencies: [{ taskId: 'cb-p6-2-1', type: 'FS' as const, lag: 0 }] },

  // Веха: Ввод в эксплуатацию
  { id: 'cb-m4', name: 'Ввод в эксплуатацию', type: 'milestone' as const, startDate: '2027-10-17', endDate: '2027-10-17', parentId: 'cb-p6', dependencies: [{ taskId: 'cb-p6-2-2', type: 'FS' as const, lag: 0 }, { taskId: 'cb-p6-1-2', type: 'FS' as const, lag: 0 }] },
];

export const TEMPLATE_COMMERCIAL = {
  label: 'Коммерческий объект',
  title: 'Строительство коммерческого здания',
  prompt: 'Создай график строительства шестиэтажного коммерческого здания: проектирование и РНС, нулевой цикл, монолитный каркас, кровля и фасад, инженерные системы, отделка, благоустройство',
  tasks: TASKS_COMMERCIAL,
};
