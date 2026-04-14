import { useState, useRef, useEffect } from 'react';
import type { Task } from 'gantt-lib';
import InputDemo from './InputDemo.js';
import GanttPreview from './GanttPreview.js';

// ── Template task sets (today = 2026-03-24) ─────────────────────────────────
// Each template starts 1-2 weeks ago, has realistic progress and one overdue task.

const TASKS_HOUSE: Task[] = [
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

const TASKS_OFFICE: Task[] = [
  { id: 'o-p1', name: 'Демонтаж', startDate: '2026-03-12', endDate: '2026-03-20' },
  { id: 'o-p1-1', name: 'Снос перегородок', startDate: '2026-03-12', endDate: '2026-03-17', parentId: 'o-p1', progress: 100, accepted: true },
  { id: 'o-p1-2', name: 'Вывоз строительного мусора', startDate: '2026-03-18', endDate: '2026-03-20', parentId: 'o-p1', progress: 100, accepted: true, dependencies: [{ taskId: 'o-p1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'o-p2', name: 'Коммуникации', startDate: '2026-03-23', endDate: '2026-04-09', dependencies: [{ taskId: 'o-p1', type: 'FS' as const, lag: 0 }] },
  // OVERDUE: закончилось 23 марта, выполнено только 40%
  { id: 'o-p2-1', name: 'Подготовка поверхностей', startDate: '2026-03-23', endDate: '2026-03-23', parentId: 'o-p2', progress: 40 },
  { id: 'o-p2-2', name: 'Электрика', startDate: '2026-03-24', endDate: '2026-04-02', parentId: 'o-p2', progress: 15, dependencies: [{ taskId: 'o-p2-1', type: 'FS' as const, lag: 0 }] },
  { id: 'o-p2-3', name: 'Вентиляция и кондиционирование', startDate: '2026-04-03', endDate: '2026-04-09', parentId: 'o-p2', progress: 0, dependencies: [{ taskId: 'o-p2-2', type: 'FS' as const, lag: 0 }] },
  { id: 'o-p3', name: 'Отделка', startDate: '2026-04-12', endDate: '2026-05-08', dependencies: [{ taskId: 'o-p2', type: 'FS' as const, lag: 0 }] },
  { id: 'o-p3-1', name: 'Потолки', startDate: '2026-04-12', endDate: '2026-04-22', parentId: 'o-p3', progress: 0 },
  { id: 'o-p3-2', name: 'Стены', startDate: '2026-04-23', endDate: '2026-05-08', parentId: 'o-p3', progress: 0, dependencies: [{ taskId: 'o-p3-1', type: 'FS' as const, lag: 0 }] },
  { id: 'o-p4', name: 'Напольные покрытия', startDate: '2026-05-11', endDate: '2026-05-22', dependencies: [{ taskId: 'o-p3', type: 'FS' as const, lag: 0 }] },
  { id: 'o-p4-1', name: 'Стяжка', startDate: '2026-05-11', endDate: '2026-05-16', parentId: 'o-p4', progress: 0 },
  { id: 'o-p4-2', name: 'Напольное покрытие', startDate: '2026-05-19', endDate: '2026-05-22', parentId: 'o-p4', progress: 0, dependencies: [{ taskId: 'o-p4-1', type: 'FS' as const, lag: 0 }] },
  { id: 'o-p5', name: 'Мебель и техника', startDate: '2026-05-25', endDate: '2026-06-05', dependencies: [{ taskId: 'o-p4', type: 'FS' as const, lag: 0 }] },
  { id: 'o-p5-1', name: 'Мебель', startDate: '2026-05-25', endDate: '2026-05-29', parentId: 'o-p5', progress: 0 },
  { id: 'o-p5-2', name: 'Техника и AV-системы', startDate: '2026-06-01', endDate: '2026-06-05', parentId: 'o-p5', progress: 0, dependencies: [{ taskId: 'o-p5-1', type: 'FS' as const, lag: 0 }] },
];

const TASKS_APARTMENT: Task[] = [
  { id: 'ap-p1', name: 'Демонтаж', startDate: '2026-03-10', endDate: '2026-03-17' },
  { id: 'ap-p1-1', name: 'Снос перегородок', startDate: '2026-03-10', endDate: '2026-03-14', parentId: 'ap-p1', progress: 100, accepted: true },
  { id: 'ap-p1-2', name: 'Вывоз мусора', startDate: '2026-03-15', endDate: '2026-03-17', parentId: 'ap-p1', progress: 100, accepted: true, dependencies: [{ taskId: 'ap-p1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'ap-p2', name: 'Электрика и сантехника', startDate: '2026-03-18', endDate: '2026-04-08' },
  // OVERDUE: закончилось 22 марта, выполнено только 30%
  { id: 'ap-p2-1', name: 'Разводка электрики', startDate: '2026-03-18', endDate: '2026-03-22', parentId: 'ap-p2', progress: 30 },
  { id: 'ap-p2-2', name: 'Сантехника (скрытая)', startDate: '2026-03-18', endDate: '2026-03-28', parentId: 'ap-p2', progress: 20 },
  { id: 'ap-p2-3', name: 'Штробление и заделка', startDate: '2026-03-29', endDate: '2026-04-08', parentId: 'ap-p2', progress: 0, dependencies: [{ taskId: 'ap-p2-1', type: 'FS' as const, lag: 0 }, { taskId: 'ap-p2-2', type: 'FS' as const, lag: 0 }] },
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

const TASKS_OVERHAUL: Task[] = [
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

export const TEMPLATES = [
  {
    label: 'Загородный дом',
    title: 'Строительство загородного дома',
    prompt: 'Создай график строительства загородного дома: фундамент, стены, кровля, отделка, ландшафт',
    tasks: TASKS_HOUSE,
  },
  {
    label: 'Ремонт квартиры',
    title: 'Ремонт квартиры',
    prompt: 'Создай график ремонта двушки 60м²: демонтаж, электрика и сантехника параллельно, стяжка, штукатурка, плитка в санузле, чистовая отделка, мебель',
    tasks: TASKS_APARTMENT,
  },
  {
    label: 'Коммерческий объект',
    title: 'Ремонт коммерческого объекта',
    prompt: 'Создай график ремонта коммерческого помещения: демонтаж, электрика, вентиляция и кондиционирование, отделка стен и потолков, пол, мебель и оборудование',
    tasks: TASKS_OFFICE,
  },
  {
    label: 'Капремонт',
    title: 'Капитальный ремонт здания',
    prompt: 'Создай график капремонта жилого дома: дефектовка, усиление конструкций, замена кровли, ремонт фасада, замена инженерных сетей, отделка',
    tasks: TASKS_OVERHAUL,
  },
];

const DEFAULT_TEMPLATE_INDEX = 0;

// ── Component ───────────────────────────────────────────────────────────────

export default function DemoSection() {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(DEFAULT_TEMPLATE_INDEX);
  const [activeIndex, setActiveIndex] = useState<number>(DEFAULT_TEMPLATE_INDEX);
  const [activeTasks, setActiveTasks] = useState<Task[] | undefined>(TEMPLATES[DEFAULT_TEMPLATE_INDEX].tasks);
  const [activeTitle, setActiveTitle] = useState<string | undefined>(TEMPLATES[DEFAULT_TEMPLATE_INDEX].title);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [highlightDemo, setHighlightDemo] = useState(false);
  const ganttRef = useRef<HTMLDivElement>(null);
  const shouldScrollAfterSubmit = useRef(false);

  // Smooth-scroll to the chart after the delayed template switch.
  useEffect(() => {
    if (!shouldScrollAfterSubmit.current) {
      return;
    }
    shouldScrollAfterSubmit.current = false;
    const el = ganttRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - (window.innerHeight - rect.height) / 2;
    const startY = window.scrollY;
    const distance = targetY - startY;
    const duration = 1200;
    const start = performance.now();
    const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      window.scrollTo(0, startY + distance * easeInOutCubic(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [activeIndex]);

  // Handle #demo hash — highlight input, scroll only if not visible
  useEffect(() => {
    function checkDemo() {
      if (window.location.hash !== '#demo') return;
      setTimeout(() => {
        const el = document.getElementById('demo');
        if (el) {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.top >= -50 && rect.bottom <= window.innerHeight + 50;
          if (!isVisible) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        setHighlightDemo(true);
        setTimeout(() => setHighlightDemo(false), 6000);
      }, 100);
    }

    checkDemo();
    window.addEventListener('hashchange', checkDemo);
    return () => window.removeEventListener('hashchange', checkDemo);
  }, []);

  function handleSubmit() {
    if (selectedIndex === null) return;
    if (selectedIndex === activeIndex) {
      shouldScrollAfterSubmit.current = false;
      return;
    }
    shouldScrollAfterSubmit.current = selectedIndex !== activeIndex;
    setIsSubmitting(true);
    setTimeout(() => {
      setActiveTasks(TEMPLATES[selectedIndex].tasks);
      setActiveTitle(TEMPLATES[selectedIndex].title);
      setActiveIndex(selectedIndex);
      setIsSubmitting(false);
    }, 700);
  }

  const selectedPrompt = selectedIndex !== null ? TEMPLATES[selectedIndex].prompt : null;

  return (
    <div>
      <section className="relative mx-auto max-w-[1280px] px-4 pb-8 pt-10 md:px-6 md:pt-14 lg:px-8 lg:pt-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(460px,560px)] lg:items-center lg:gap-16">
          <div className="max-w-[620px] px-8 lg:px-0">
            <h1
              className="font-extrabold leading-[1.05] text-foreground animate-fade-up"
              style={{ animationDelay: '120ms', fontSize: '3.5rem' }}
            >
              Из описания проекта —{' '}
              <span className="text-primary">в&nbsp;диаграмму Ганта</span>{' '}
              за 30 секунд
            </h1>

            <p
              className="mt-8 max-w-[560px] text-lg leading-8 text-secondary-foreground animate-fade-up"
              style={{ animationDelay: '190ms' }}
            >
              Опишите что нужно построить — ИИ создаст план работ с задачами, сроками и зависимостями. Не картинку, а живой график
            </p>

            <div
              className="mt-8 flex flex-wrap gap-3 animate-fade-up"
              style={{ animationDelay: '260ms' }}
            >
              <a
                href="https://ai.getgantt.ru"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-3.5 text-[15px] font-bold text-primary-foreground transition-all hover:opacity-90 hover:shadow-lg hover:-translate-y-0.5"
              >
                Начать
              </a>
            </div>
          </div>

          <div id="demo" className="relative lg:-translate-y-8 lg:translate-x-6 lg:justify-self-end">
            {highlightDemo && (
              <div className="absolute -top-11 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg">
                Выберите пример проекта
                <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-primary" />
              </div>
            )}
            <div className={`relative rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-6 transition-shadow duration-500 ${highlightDemo ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}>
              <InputDemo
                chips={TEMPLATES.map(t => ({ label: t.label, prompt: t.prompt }))}
                selectedIndex={selectedIndex}
                selectedPrompt={selectedPrompt}
                onChipSelect={setSelectedIndex}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                containerClassName="mt-0 max-w-none px-0 md:px-0"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Spacer + Arrow */}
      <div className="h-8" />
      <div className="mb-6 flex justify-center text-muted-foreground animate-bob">
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Gantt preview */}
      <div id="gantt-preview" ref={ganttRef}>
        <GanttPreview initialTasks={activeTasks} title={activeTitle} />
      </div>

      {/* CTA */}
      <section className="relative mx-auto mt-20 max-w-7xl px-4 lg:px-6">
        <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,255,0.96)_100%)] px-6 py-12 text-center shadow-[0_24px_70px_rgba(148,163,184,0.12)] sm:px-10 sm:py-14 lg:px-12 lg:py-16">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full border border-slate-100" />
            <div className="absolute right-[-96px] top-1/2 h-72 w-72 -translate-y-1/2 rounded-full border border-slate-100" />
            <div className="absolute left-1/2 top-0 h-24 w-64 -translate-x-1/2 bg-[radial-gradient(circle,rgba(241,245,249,0.9)_0%,rgba(241,245,249,0)_72%)]" />
          </div>

          <div className="relative mx-auto max-w-3xl">
            <h2
              className="font-extrabold leading-[1.5] text-slate-950"
              style={{ fontSize: 'clamp(1.75rem, 4.2vw, 3.2rem)' }}
            >
              Быстро создать.
              <br className="hidden sm:block" /> Легко управлять
            </h2>
            <p className="mx-auto mt-8 max-w-2xl text-base leading-7 text-slate-500 sm:text-xl sm:leading-8">
              Новый стандарт графиков Ганта. Просто, красиво, онлайн.
            </p>

            <div className="mt-8">
              <a
                href="https://ai.getgantt.ru"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-3.5 text-[15px] font-bold text-primary-foreground transition-all hover:opacity-90 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              >
                Начать бесплатно
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
