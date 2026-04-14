import type { Task } from 'gantt-lib';

// ── Строительство жилого дома 17 этажей ────────────────────────────────────
// Структура: Фаза → Подфаза → Задача (3 уровня)
// Вехи: РНС, Нулевой цикл, Здание под кровлей, Инженерные системы, Ввод
// Сегодня ≈ 2026-04-14. Старт — сентябрь 2025, завершение — июнь 2029.

export const TASKS_RESIDENTIAL: Task[] = [

  // ── Фаза 1: Предстроительная подготовка ─────────────────────────────────
  { id: 'rh-p1', name: 'Предстроительная подготовка', startDate: '2025-09-01', endDate: '2026-03-31' },

  { id: 'rh-p1-1', name: 'Земля, права и согласования', startDate: '2025-09-01', endDate: '2025-11-28', parentId: 'rh-p1' },
  { id: 'rh-p1-1-1', name: 'Оформление прав на земельный участок', startDate: '2025-09-01', endDate: '2025-09-30', parentId: 'rh-p1-1', progress: 100, accepted: true },
  { id: 'rh-p1-1-2', name: 'Получение ГПЗУ', startDate: '2025-10-01', endDate: '2025-10-31', parentId: 'rh-p1-1', progress: 100, accepted: true, dependencies: [{ taskId: 'rh-p1-1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p1-1-3', name: 'Согласование архитектурно-градостроительного облика (АГО)', startDate: '2025-11-03', endDate: '2025-11-28', parentId: 'rh-p1-1', progress: 100, accepted: true, dependencies: [{ taskId: 'rh-p1-1-2', type: 'FS' as const, lag: 0 }] },

  { id: 'rh-p1-2', name: 'Проектирование, экспертиза, РНС', startDate: '2025-10-01', endDate: '2026-03-31', parentId: 'rh-p1' },
  { id: 'rh-p1-2-1', name: 'Инженерные изыскания', startDate: '2025-10-01', endDate: '2025-11-14', parentId: 'rh-p1-2', progress: 100, accepted: true },
  { id: 'rh-p1-2-2', name: 'Разработка проектной документации', startDate: '2025-11-17', endDate: '2026-01-23', parentId: 'rh-p1-2', progress: 100, accepted: true, dependencies: [{ taskId: 'rh-p1-2-1', type: 'FS' as const, lag: 0 }, { taskId: 'rh-p1-1-3', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p1-2-3', name: 'Государственная экспертиза проектной документации', startDate: '2026-01-26', endDate: '2026-03-06', parentId: 'rh-p1-2', progress: 100, accepted: true, dependencies: [{ taskId: 'rh-p1-2-2', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p1-2-4', name: 'Получение разрешения на строительство (РНС)', startDate: '2026-03-09', endDate: '2026-03-31', parentId: 'rh-p1-2', progress: 100, accepted: true, dependencies: [{ taskId: 'rh-p1-2-3', type: 'FS' as const, lag: 0 }] },

  // Веха: РНС получено
  { id: 'rh-m1', name: 'РНС получено', type: 'milestone' as const, startDate: '2026-03-31', endDate: '2026-03-31', parentId: 'rh-p1', dependencies: [{ taskId: 'rh-p1-2-4', type: 'FS' as const, lag: 0 }] },

  // ── Фаза 2: Подготовка территории ───────────────────────────────────────
  { id: 'rh-p2', name: 'Подготовка территории', startDate: '2026-02-02', endDate: '2026-06-05' },

  { id: 'rh-p2-1', name: 'Снос и расчистка', startDate: '2026-02-02', endDate: '2026-03-13', parentId: 'rh-p2' },
  { id: 'rh-p2-1-1', name: 'Снос существующих строений', startDate: '2026-02-02', endDate: '2026-02-27', parentId: 'rh-p2-1', progress: 100, accepted: true },
  { id: 'rh-p2-1-2', name: 'Расчистка и планировка площадки', startDate: '2026-03-02', endDate: '2026-03-13', parentId: 'rh-p2-1', progress: 100, accepted: true, dependencies: [{ taskId: 'rh-p2-1-1', type: 'FS' as const, lag: 0 }] },

  { id: 'rh-p2-2', name: 'Организация строительной площадки', startDate: '2026-02-09', endDate: '2026-04-10', parentId: 'rh-p2' },
  { id: 'rh-p2-2-1', name: 'Устройство ограждения', startDate: '2026-02-09', endDate: '2026-02-20', parentId: 'rh-p2-2', progress: 100, accepted: true },
  { id: 'rh-p2-2-2', name: 'Бытовой городок и временные сооружения', startDate: '2026-02-23', endDate: '2026-03-20', parentId: 'rh-p2-2', progress: 100, accepted: true, dependencies: [{ taskId: 'rh-p2-2-1', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p2-2-3', name: 'Временные дороги и мойка колёс', startDate: '2026-03-23', endDate: '2026-04-10', parentId: 'rh-p2-2', progress: 80, dependencies: [{ taskId: 'rh-p2-2-2', type: 'FS' as const, lag: 0 }] },

  { id: 'rh-p2-3', name: 'Вынос сетей из пятна застройки', startDate: '2026-03-02', endDate: '2026-06-05', parentId: 'rh-p2' },
  { id: 'rh-p2-3-1', name: 'Вынос электрических сетей', startDate: '2026-03-02', endDate: '2026-03-27', parentId: 'rh-p2-3', progress: 100, accepted: true, dependencies: [{ taskId: 'rh-p2-1-2', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p2-3-2', name: 'Вынос тепловых сетей', startDate: '2026-03-30', endDate: '2026-05-01', parentId: 'rh-p2-3', progress: 60, dependencies: [{ taskId: 'rh-p2-3-1', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p2-3-3', name: 'Перекладка водопровода и канализации', startDate: '2026-04-20', endDate: '2026-06-05', parentId: 'rh-p2-3', progress: 0, dependencies: [{ taskId: 'rh-p2-3-2', type: 'SS' as const, lag: 15 }] },

  // ── Фаза 3: Нулевой цикл ────────────────────────────────────────────────
  { id: 'rh-p3', name: 'Нулевой цикл', startDate: '2026-04-13', endDate: '2027-01-22' },

  { id: 'rh-p3-1', name: 'Геотехника и котлован', startDate: '2026-04-13', endDate: '2026-07-17', parentId: 'rh-p3' },
  { id: 'rh-p3-1-1', name: 'Устройство шпунтового ограждения котлована', startDate: '2026-04-13', endDate: '2026-05-08', parentId: 'rh-p3-1', progress: 0, dependencies: [{ taskId: 'rh-p1-2-4', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p3-1-2', name: 'Разработка котлована', startDate: '2026-05-11', endDate: '2026-06-26', parentId: 'rh-p3-1', progress: 0, dependencies: [{ taskId: 'rh-p3-1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p3-1-3', name: 'Вывоз грунта', startDate: '2026-05-18', endDate: '2026-07-17', parentId: 'rh-p3-1', progress: 0, dependencies: [{ taskId: 'rh-p3-1-2', type: 'SS' as const, lag: 5 }] },

  { id: 'rh-p3-2', name: 'Фундамент', startDate: '2026-07-06', endDate: '2026-10-16', parentId: 'rh-p3' },
  { id: 'rh-p3-2-1', name: 'Устройство буронабивных свай', startDate: '2026-07-06', endDate: '2026-08-07', parentId: 'rh-p3-2', progress: 0, dependencies: [{ taskId: 'rh-p3-1-2', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p3-2-2', name: 'Устройство ростверка', startDate: '2026-08-10', endDate: '2026-09-04', parentId: 'rh-p3-2', progress: 0, dependencies: [{ taskId: 'rh-p3-2-1', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p3-2-3', name: 'Фундаментная плита', startDate: '2026-09-07', endDate: '2026-10-02', parentId: 'rh-p3-2', progress: 0, dependencies: [{ taskId: 'rh-p3-2-2', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p3-2-4', name: 'Гидроизоляция фундамента и стен подвала', startDate: '2026-10-05', endDate: '2026-10-16', parentId: 'rh-p3-2', progress: 0, dependencies: [{ taskId: 'rh-p3-2-3', type: 'FS' as const, lag: 0 }] },

  { id: 'rh-p3-3', name: 'Подземный паркинг (−1 этаж)', startDate: '2026-10-19', endDate: '2027-01-22', parentId: 'rh-p3' },
  { id: 'rh-p3-3-1', name: 'Стены и колонны подземного этажа', startDate: '2026-10-19', endDate: '2026-11-27', parentId: 'rh-p3-3', progress: 0, dependencies: [{ taskId: 'rh-p3-2-4', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p3-3-2', name: 'Перекрытие над подземным этажом', startDate: '2026-11-30', endDate: '2026-12-25', parentId: 'rh-p3-3', progress: 0, dependencies: [{ taskId: 'rh-p3-3-1', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p3-3-3', name: 'Гидроизоляция перекрытия и обратная засыпка', startDate: '2026-12-28', endDate: '2027-01-22', parentId: 'rh-p3-3', progress: 0, dependencies: [{ taskId: 'rh-p3-3-2', type: 'FS' as const, lag: 0 }] },

  // Веха: Нулевой цикл завершён
  { id: 'rh-m2', name: 'Нулевой цикл завершён', type: 'milestone' as const, startDate: '2027-01-22', endDate: '2027-01-22', parentId: 'rh-p3', dependencies: [{ taskId: 'rh-p3-3-3', type: 'FS' as const, lag: 0 }] },

  // ── Фаза 4: Надземная часть ──────────────────────────────────────────────
  { id: 'rh-p4', name: 'Надземная часть', startDate: '2027-01-25', endDate: '2028-05-16' },

  { id: 'rh-p4-1', name: 'Монолитный каркас', startDate: '2027-01-25', endDate: '2027-12-19', parentId: 'rh-p4' },
  { id: 'rh-p4-1-1', name: 'Монолит 1–4 этажей', startDate: '2027-01-25', endDate: '2027-04-11', parentId: 'rh-p4-1', progress: 0, dependencies: [{ taskId: 'rh-p3-3-3', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p4-1-2', name: 'Монолит 5–9 этажей', startDate: '2027-04-14', endDate: '2027-07-04', parentId: 'rh-p4-1', progress: 0, dependencies: [{ taskId: 'rh-p4-1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p4-1-3', name: 'Монолит 10–13 этажей', startDate: '2027-07-07', endDate: '2027-09-19', parentId: 'rh-p4-1', progress: 0, dependencies: [{ taskId: 'rh-p4-1-2', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p4-1-4', name: 'Монолит 14–17 этажей', startDate: '2027-09-22', endDate: '2027-11-21', parentId: 'rh-p4-1', progress: 0, dependencies: [{ taskId: 'rh-p4-1-3', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p4-1-5', name: 'Технический этаж и парапеты', startDate: '2027-11-24', endDate: '2027-12-19', parentId: 'rh-p4-1', progress: 0, dependencies: [{ taskId: 'rh-p4-1-4', type: 'FS' as const, lag: 0 }] },

  { id: 'rh-p4-2', name: 'Кладка наружных стен и перегородков', startDate: '2027-03-01', endDate: '2027-12-26', parentId: 'rh-p4' },
  { id: 'rh-p4-2-1', name: 'Кладка 1–4 этажей', startDate: '2027-03-01', endDate: '2027-05-28', parentId: 'rh-p4-2', progress: 0, dependencies: [{ taskId: 'rh-p4-1-1', type: 'SS' as const, lag: 25 }] },
  { id: 'rh-p4-2-2', name: 'Кладка 5–9 этажей', startDate: '2027-06-01', endDate: '2027-09-03', parentId: 'rh-p4-2', progress: 0, dependencies: [{ taskId: 'rh-p4-2-1', type: 'FS' as const, lag: 0 }, { taskId: 'rh-p4-1-2', type: 'SS' as const, lag: 20 }] },
  { id: 'rh-p4-2-3', name: 'Кладка 10–17 этажей', startDate: '2027-09-06', endDate: '2027-12-26', parentId: 'rh-p4-2', progress: 0, dependencies: [{ taskId: 'rh-p4-2-2', type: 'FS' as const, lag: 0 }] },

  { id: 'rh-p4-3', name: 'Кровля', startDate: '2027-12-22', endDate: '2028-01-30', parentId: 'rh-p4' },
  { id: 'rh-p4-3-1', name: 'Несущие конструкции кровли', startDate: '2027-12-22', endDate: '2028-01-09', parentId: 'rh-p4-3', progress: 0, dependencies: [{ taskId: 'rh-p4-1-5', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p4-3-2', name: 'Кровельный пирог и финишный слой', startDate: '2028-01-12', endDate: '2028-01-30', parentId: 'rh-p4-3', progress: 0, dependencies: [{ taskId: 'rh-p4-3-1', type: 'FS' as const, lag: 0 }] },

  { id: 'rh-p4-4', name: 'Фасад и остекление', startDate: '2028-01-14', endDate: '2028-05-16', parentId: 'rh-p4' },
  { id: 'rh-p4-4-1', name: 'Вентилируемый фасад', startDate: '2028-01-14', endDate: '2028-03-07', parentId: 'rh-p4-4', progress: 0, dependencies: [{ taskId: 'rh-p4-3-2', type: 'SS' as const, lag: 10 }] },
  { id: 'rh-p4-4-2', name: 'Монтаж оконных блоков', startDate: '2028-02-11', endDate: '2028-04-04', parentId: 'rh-p4-4', progress: 0, dependencies: [{ taskId: 'rh-p4-4-1', type: 'SS' as const, lag: 20 }] },
  { id: 'rh-p4-4-3', name: 'Остекление балконов и лоджий', startDate: '2028-03-18', endDate: '2028-05-16', parentId: 'rh-p4-4', progress: 0, dependencies: [{ taskId: 'rh-p4-4-2', type: 'SS' as const, lag: 25 }] },

  // Веха: Здание под кровлей
  { id: 'rh-m3', name: 'Здание под кровлей', type: 'milestone' as const, startDate: '2028-01-30', endDate: '2028-01-30', parentId: 'rh-p4', dependencies: [{ taskId: 'rh-p4-3-2', type: 'FS' as const, lag: 0 }] },

  // ── Фаза 5: Инженерные системы ──────────────────────────────────────────
  { id: 'rh-p5', name: 'Инженерные системы', startDate: '2027-05-12', endDate: '2028-10-31' },

  { id: 'rh-p5-1', name: 'Водоснабжение и канализация', startDate: '2027-05-12', endDate: '2028-03-15', parentId: 'rh-p5' },
  { id: 'rh-p5-1-1', name: 'Прокладка стояков ХВС/ГВС/КУ', startDate: '2027-05-12', endDate: '2027-09-12', parentId: 'rh-p5-1', progress: 0, dependencies: [{ taskId: 'rh-p4-1-1', type: 'SS' as const, lag: 60 }] },
  { id: 'rh-p5-1-2', name: 'Разводка ХВС/ГВС по квартирам', startDate: '2027-09-15', endDate: '2028-01-05', parentId: 'rh-p5-1', progress: 0, dependencies: [{ taskId: 'rh-p5-1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p5-1-3', name: 'Монтаж водомерного узла и оборудования ИТП', startDate: '2028-01-08', endDate: '2028-03-15', parentId: 'rh-p5-1', progress: 0, dependencies: [{ taskId: 'rh-p5-1-2', type: 'FS' as const, lag: 0 }] },

  { id: 'rh-p5-2', name: 'Отопление и вентиляция', startDate: '2027-05-12', endDate: '2028-06-07', parentId: 'rh-p5' },
  { id: 'rh-p5-2-1', name: 'Система отопления (стояки и радиаторы)', startDate: '2027-05-12', endDate: '2027-10-10', parentId: 'rh-p5-2', progress: 0, dependencies: [{ taskId: 'rh-p4-1-1', type: 'SS' as const, lag: 60 }] },
  { id: 'rh-p5-2-2', name: 'Приточно-вытяжная вентиляция', startDate: '2027-08-04', endDate: '2028-02-08', parentId: 'rh-p5-2', progress: 0, dependencies: [{ taskId: 'rh-p5-2-1', type: 'SS' as const, lag: 60 }] },
  { id: 'rh-p5-2-3', name: 'Система дымоудаления и противодымная защита', startDate: '2028-02-12', endDate: '2028-06-07', parentId: 'rh-p5-2', progress: 0, dependencies: [{ taskId: 'rh-p5-2-2', type: 'FS' as const, lag: 0 }] },

  { id: 'rh-p5-3', name: 'Электрика и слаботочные системы', startDate: '2027-05-12', endDate: '2028-07-05', parentId: 'rh-p5' },
  { id: 'rh-p5-3-1', name: 'Силовые щиты и кабельные трассы', startDate: '2027-05-12', endDate: '2027-10-17', parentId: 'rh-p5-3', progress: 0, dependencies: [{ taskId: 'rh-p4-1-1', type: 'SS' as const, lag: 60 }] },
  { id: 'rh-p5-3-2', name: 'Разводка освещения по этажам и квартирам', startDate: '2027-10-20', endDate: '2028-04-04', parentId: 'rh-p5-3', progress: 0, dependencies: [{ taskId: 'rh-p5-3-1', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p5-3-3', name: 'АППЗ, СКУД, видеонаблюдение, домофония', startDate: '2028-04-07', endDate: '2028-07-05', parentId: 'rh-p5-3', progress: 0, dependencies: [{ taskId: 'rh-p5-3-2', type: 'FS' as const, lag: 0 }] },

  { id: 'rh-p5-4', name: 'Лифты', startDate: '2027-10-06', endDate: '2028-05-03', parentId: 'rh-p5' },
  { id: 'rh-p5-4-1', name: 'Монтаж лифтового оборудования', startDate: '2027-10-06', endDate: '2028-03-08', parentId: 'rh-p5-4', progress: 0, dependencies: [{ taskId: 'rh-p4-1-3', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p5-4-2', name: 'ПНР лифтов и техническое освидетельствование', startDate: '2028-03-11', endDate: '2028-05-03', parentId: 'rh-p5-4', progress: 0, dependencies: [{ taskId: 'rh-p5-4-1', type: 'FS' as const, lag: 0 }] },

  { id: 'rh-p5-5', name: 'ПНР инженерных систем', startDate: '2028-07-08', endDate: '2028-10-31', parentId: 'rh-p5' },
  { id: 'rh-p5-5-1', name: 'ПНР систем ВК и ОВиК', startDate: '2028-07-08', endDate: '2028-09-05', parentId: 'rh-p5-5', progress: 0, dependencies: [{ taskId: 'rh-p5-1-3', type: 'FS' as const, lag: 0 }, { taskId: 'rh-p5-2-3', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p5-5-2', name: 'ПНР электрики, АППЗ и слаботочных систем', startDate: '2028-09-08', endDate: '2028-10-31', parentId: 'rh-p5-5', progress: 0, dependencies: [{ taskId: 'rh-p5-3-3', type: 'FS' as const, lag: 0 }, { taskId: 'rh-p5-5-1', type: 'SS' as const, lag: 15 }] },

  // Веха: Инженерные системы сданы
  { id: 'rh-m4', name: 'Инженерные системы сданы', type: 'milestone' as const, startDate: '2028-10-31', endDate: '2028-10-31', parentId: 'rh-p5', dependencies: [{ taskId: 'rh-p5-5-2', type: 'FS' as const, lag: 0 }] },

  // ── Фаза 6: Наружные инженерные сети ────────────────────────────────────
  { id: 'rh-p6', name: 'Наружные инженерные сети', startDate: '2027-06-07', endDate: '2028-06-28' },

  { id: 'rh-p6-1', name: 'Электроснабжение', startDate: '2027-06-07', endDate: '2028-01-23', parentId: 'rh-p6' },
  { id: 'rh-p6-1-1', name: 'КЛ 10 кВ и трансформаторная подстанция', startDate: '2027-06-07', endDate: '2027-09-12', parentId: 'rh-p6-1', progress: 0 },
  { id: 'rh-p6-1-2', name: 'КЛ 0,4 кВ и ввод в здание', startDate: '2027-09-15', endDate: '2028-01-23', parentId: 'rh-p6-1', progress: 0, dependencies: [{ taskId: 'rh-p6-1-1', type: 'FS' as const, lag: 0 }] },

  { id: 'rh-p6-2', name: 'Водопровод и канализация', startDate: '2027-06-07', endDate: '2028-03-28', parentId: 'rh-p6' },
  { id: 'rh-p6-2-1', name: 'Наружный водопровод и водомерный узел', startDate: '2027-06-07', endDate: '2027-10-03', parentId: 'rh-p6-2', progress: 0 },
  { id: 'rh-p6-2-2', name: 'Хозяйственно-бытовая канализация', startDate: '2027-08-02', endDate: '2027-12-19', parentId: 'rh-p6-2', progress: 0, dependencies: [{ taskId: 'rh-p6-2-1', type: 'SS' as const, lag: 40 }] },
  { id: 'rh-p6-2-3', name: 'Ливневая канализация и дренажная система', startDate: '2027-10-06', endDate: '2028-03-28', parentId: 'rh-p6-2', progress: 0, dependencies: [{ taskId: 'rh-p6-2-2', type: 'SS' as const, lag: 40 }] },

  { id: 'rh-p6-3', name: 'Теплоснабжение и газ', startDate: '2027-07-05', endDate: '2028-06-28', parentId: 'rh-p6' },
  { id: 'rh-p6-3-1', name: 'Наружная теплотрасса и индивидуальный тепловой пункт (ИТП)', startDate: '2027-07-05', endDate: '2028-02-07', parentId: 'rh-p6-3', progress: 0 },
  { id: 'rh-p6-3-2', name: 'Газопровод высокого и низкого давления', startDate: '2027-10-06', endDate: '2028-06-28', parentId: 'rh-p6-3', progress: 0, dependencies: [{ taskId: 'rh-p6-3-1', type: 'SS' as const, lag: 60 }] },

  // ── Фаза 7: Отделка ──────────────────────────────────────────────────────
  { id: 'rh-p7', name: 'Отделка', startDate: '2028-04-07', endDate: '2028-12-27' },

  { id: 'rh-p7-1', name: 'Черновая отделка', startDate: '2028-04-07', endDate: '2028-09-06', parentId: 'rh-p7' },
  { id: 'rh-p7-1-1', name: 'Стяжка полов МОП и квартир', startDate: '2028-04-07', endDate: '2028-06-07', parentId: 'rh-p7-1', progress: 0, dependencies: [{ taskId: 'rh-p5-3-2', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p7-1-2', name: 'Штукатурка стен МОП и квартир', startDate: '2028-05-06', endDate: '2028-08-02', parentId: 'rh-p7-1', progress: 0, dependencies: [{ taskId: 'rh-p7-1-1', type: 'SS' as const, lag: 20 }] },
  { id: 'rh-p7-1-3', name: 'Устройство подвесных потолков в МОП', startDate: '2028-07-08', endDate: '2028-09-06', parentId: 'rh-p7-1', progress: 0, dependencies: [{ taskId: 'rh-p7-1-2', type: 'SS' as const, lag: 45 }] },

  { id: 'rh-p7-2', name: 'Чистовая отделка', startDate: '2028-09-09', endDate: '2028-12-27', parentId: 'rh-p7' },
  { id: 'rh-p7-2-1', name: 'Отделка квартир (white-box)', startDate: '2028-09-09', endDate: '2028-11-15', parentId: 'rh-p7-2', progress: 0, dependencies: [{ taskId: 'rh-p7-1-2', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p7-2-2', name: 'Отделка МОП (коридоры, холлы, лестницы)', startDate: '2028-10-07', endDate: '2028-12-06', parentId: 'rh-p7-2', progress: 0, dependencies: [{ taskId: 'rh-p7-1-3', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p7-2-3', name: 'Отделка входных групп и вестибюлей', startDate: '2028-11-18', endDate: '2028-12-27', parentId: 'rh-p7-2', progress: 0, dependencies: [{ taskId: 'rh-p7-2-2', type: 'SS' as const, lag: 30 }] },

  // ── Фаза 8: Благоустройство ──────────────────────────────────────────────
  { id: 'rh-p8', name: 'Благоустройство', startDate: '2028-09-01', endDate: '2029-04-25' },

  { id: 'rh-p8-1', name: 'Дороги и парковка', startDate: '2028-09-01', endDate: '2028-12-06', parentId: 'rh-p8' },
  { id: 'rh-p8-1-1', name: 'Устройство основания дорог и парковки', startDate: '2028-09-01', endDate: '2028-10-04', parentId: 'rh-p8-1', progress: 0 },
  { id: 'rh-p8-1-2', name: 'Дорожное покрытие, тротуары и бордюры', startDate: '2028-10-07', endDate: '2028-12-06', parentId: 'rh-p8-1', progress: 0, dependencies: [{ taskId: 'rh-p8-1-1', type: 'FS' as const, lag: 0 }] },

  { id: 'rh-p8-2', name: 'Озеленение и МАФ', startDate: '2028-12-09', endDate: '2029-04-25', parentId: 'rh-p8' },
  { id: 'rh-p8-2-1', name: 'Детские и спортивные площадки', startDate: '2028-12-09', endDate: '2029-02-01', parentId: 'rh-p8-2', progress: 0, dependencies: [{ taskId: 'rh-p8-1-2', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p8-2-2', name: 'Газоны, цветники и посадка деревьев', startDate: '2029-02-03', endDate: '2029-03-28', parentId: 'rh-p8-2', progress: 0, dependencies: [{ taskId: 'rh-p8-2-1', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p8-2-3', name: 'МАФ: скамейки, урны, наружное освещение', startDate: '2029-03-03', endDate: '2029-04-25', parentId: 'rh-p8-2', progress: 0, dependencies: [{ taskId: 'rh-p8-2-2', type: 'SS' as const, lag: 20 }] },

  // ── Фаза 9: Сдача в эксплуатацию ────────────────────────────────────────
  { id: 'rh-p9', name: 'Сдача в эксплуатацию', startDate: '2028-11-04', endDate: '2029-06-13' },

  { id: 'rh-p9-1', name: 'Ввод в эксплуатацию', startDate: '2028-11-04', endDate: '2029-06-13', parentId: 'rh-p9' },
  { id: 'rh-p9-1-1', name: 'Комплексное опробование всех систем', startDate: '2028-11-04', endDate: '2028-12-13', parentId: 'rh-p9-1', progress: 0, dependencies: [{ taskId: 'rh-p7-2-1', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p9-1-2', name: 'Устранение замечаний ГСН и пожарного надзора', startDate: '2028-12-16', endDate: '2029-02-21', parentId: 'rh-p9-1', progress: 0, dependencies: [{ taskId: 'rh-p9-1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'rh-p9-1-3', name: 'Получение разрешения на ввод (РнВ)', startDate: '2029-03-03', endDate: '2029-06-13', parentId: 'rh-p9-1', progress: 0, dependencies: [{ taskId: 'rh-p9-1-2', type: 'FS' as const, lag: 0 }, { taskId: 'rh-p5-5-2', type: 'FS' as const, lag: 0 }] },

  // Веха: Ввод в эксплуатацию
  { id: 'rh-m5', name: 'Ввод в эксплуатацию', type: 'milestone' as const, startDate: '2029-06-13', endDate: '2029-06-13', parentId: 'rh-p9', dependencies: [{ taskId: 'rh-p9-1-3', type: 'FS' as const, lag: 0 }, { taskId: 'rh-p8-2-3', type: 'FS' as const, lag: 0 }] },
];

export const TEMPLATE_RESIDENTIAL = {
  label: 'Жилой дом',
  title: 'Строительство жилого дома 17 этажей',
  prompt: 'Создай график строительства 17-этажного жилого дома: ГПЗУ и согласования, проектирование и РНС, снос и подготовка площадки, нулевой цикл с подземным паркингом, монолитный каркас поэтажно, кровля и вентфасад, инженерные системы (ВК, ОВ, электрика, лифты), наружные сети, отделка МОП и квартир, благоустройство и ввод в эксплуатацию',
  tasks: TASKS_RESIDENTIAL,
};
