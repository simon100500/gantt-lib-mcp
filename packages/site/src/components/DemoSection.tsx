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

const TASKS_IT: Task[] = [
  { id: 'it-p1', name: 'Аналитика', startDate: '2026-03-11', endDate: '2026-03-25' },
  { id: 'it-p1-1', name: 'Сбор требований', startDate: '2026-03-11', endDate: '2026-03-17', parentId: 'it-p1', progress: 100, accepted: true },
  // OVERDUE: закончилось 21 марта, выполнено только 45%
  { id: 'it-p1-2', name: 'Написание ТЗ', startDate: '2026-03-18', endDate: '2026-03-21', parentId: 'it-p1', progress: 45, dependencies: [{ taskId: 'it-p1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'it-p1-3', name: 'Утверждение ТЗ', startDate: '2026-03-22', endDate: '2026-03-25', parentId: 'it-p1', progress: 10, dependencies: [{ taskId: 'it-p1-2', type: 'FS' as const, lag: 0 }] },
  { id: 'it-p2', name: 'Дизайн', startDate: '2026-03-26', endDate: '2026-04-10', dependencies: [{ taskId: 'it-p1', type: 'FS' as const, lag: 0 }] },
  { id: 'it-p2-1', name: 'UI/UX дизайн', startDate: '2026-03-26', endDate: '2026-04-06', parentId: 'it-p2', progress: 0 },
  { id: 'it-p2-2', name: 'Согласование макетов', startDate: '2026-04-07', endDate: '2026-04-10', parentId: 'it-p2', progress: 0, dependencies: [{ taskId: 'it-p2-1', type: 'FS' as const, lag: 0 }] },
  { id: 'it-p3', name: 'Разработка', startDate: '2026-04-13', endDate: '2026-05-28', dependencies: [{ taskId: 'it-p2', type: 'FS' as const, lag: 0 }] },
  { id: 'it-p3-1', name: 'Frontend', startDate: '2026-04-13', endDate: '2026-05-14', parentId: 'it-p3', progress: 0 },
  { id: 'it-p3-2', name: 'Backend API', startDate: '2026-04-20', endDate: '2026-05-21', parentId: 'it-p3', progress: 0 },
  { id: 'it-p3-3', name: 'Интеграция', startDate: '2026-05-22', endDate: '2026-05-28', parentId: 'it-p3', progress: 0, dependencies: [{ taskId: 'it-p3-1', type: 'FS' as const, lag: 0 }, { taskId: 'it-p3-2', type: 'FS' as const, lag: 0 }] },
  { id: 'it-p4', name: 'Тестирование', startDate: '2026-06-01', endDate: '2026-06-12', dependencies: [{ taskId: 'it-p3', type: 'FS' as const, lag: 0 }] },
  { id: 'it-p4-1', name: 'QA тестирование', startDate: '2026-06-01', endDate: '2026-06-06', parentId: 'it-p4', progress: 0 },
  { id: 'it-p4-2', name: 'Исправление багов', startDate: '2026-06-07', endDate: '2026-06-12', parentId: 'it-p4', progress: 0, dependencies: [{ taskId: 'it-p4-1', type: 'FS' as const, lag: 0 }] },
  { id: 'it-p5', name: 'Релиз', startDate: '2026-06-15', endDate: '2026-06-17', dependencies: [{ taskId: 'it-p4', type: 'FS' as const, lag: 0 }] },
  { id: 'it-p5-1', name: 'Деплой на прод', startDate: '2026-06-15', endDate: '2026-06-15', parentId: 'it-p5', progress: 0 },
  { id: 'it-p5-2', name: 'Документация', startDate: '2026-06-16', endDate: '2026-06-17', parentId: 'it-p5', progress: 0 },
];

const TASKS_EVENT: Task[] = [
  { id: 'ev-p1', name: 'Площадка', startDate: '2026-03-10', endDate: '2026-03-20' },
  { id: 'ev-p1-1', name: 'Выбор и просмотр площадок', startDate: '2026-03-10', endDate: '2026-03-14', parentId: 'ev-p1', progress: 100, accepted: true },
  { id: 'ev-p1-2', name: 'Бронирование и договор', startDate: '2026-03-15', endDate: '2026-03-20', parentId: 'ev-p1', progress: 100, accepted: true, dependencies: [{ taskId: 'ev-p1-1', type: 'FS' as const, lag: 0 }] },
  { id: 'ev-p2', name: 'Программа', startDate: '2026-03-16', endDate: '2026-04-03' },
  { id: 'ev-p2-1', name: 'Разработка программы', startDate: '2026-03-16', endDate: '2026-03-25', parentId: 'ev-p2', progress: 55 },
  // OVERDUE: закончилось 21 марта, выполнено только 30%
  { id: 'ev-p2-2', name: 'Подтверждение спикеров', startDate: '2026-03-16', endDate: '2026-03-21', parentId: 'ev-p2', progress: 30 },
  { id: 'ev-p2-3', name: 'Приглашение гостей', startDate: '2026-03-22', endDate: '2026-04-03', parentId: 'ev-p2', progress: 15, dependencies: [{ taskId: 'ev-p2-1', type: 'SS' as const, lag: 5 }] },
  { id: 'ev-p3', name: 'Кейтеринг', startDate: '2026-03-23', endDate: '2026-04-10' },
  { id: 'ev-p3-1', name: 'Выбор кейтеринга', startDate: '2026-03-23', endDate: '2026-03-28', parentId: 'ev-p3', progress: 10 },
  { id: 'ev-p3-2', name: 'Согласование меню', startDate: '2026-03-29', endDate: '2026-04-10', parentId: 'ev-p3', progress: 0, dependencies: [{ taskId: 'ev-p3-1', type: 'FS' as const, lag: 0 }] },
  { id: 'ev-p4', name: 'Продвижение', startDate: '2026-03-14', endDate: '2026-04-25' },
  { id: 'ev-p4-1', name: 'Соцсети и реклама', startDate: '2026-03-14', endDate: '2026-04-14', parentId: 'ev-p4', progress: 40 },
  { id: 'ev-p4-2', name: 'PR и пресс-релизы', startDate: '2026-04-01', endDate: '2026-04-25', parentId: 'ev-p4', progress: 0 },
  { id: 'ev-p5', name: 'Проведение', startDate: '2026-04-28', endDate: '2026-04-30', dependencies: [{ taskId: 'ev-p2', type: 'FS' as const, lag: 0 }, { taskId: 'ev-p3', type: 'FS' as const, lag: 0 }, { taskId: 'ev-p4', type: 'FS' as const, lag: 0 }] },
  { id: 'ev-p5-1', name: 'Репетиция', startDate: '2026-04-28', endDate: '2026-04-28', parentId: 'ev-p5', progress: 0 },
  { id: 'ev-p5-2', name: 'День мероприятия', startDate: '2026-04-29', endDate: '2026-04-30', parentId: 'ev-p5', progress: 0, dependencies: [{ taskId: 'ev-p5-1', type: 'FS' as const, lag: 0 }] },
];

export const TEMPLATES = [
  {
    label: 'Загородный дом',
    prompt: 'Создай график строительства загородного дома: фундамент, стены, кровля, отделка, ландшафт',
    tasks: TASKS_HOUSE,
  },
  {
    label: 'Ремонт офиса',
    prompt: 'Создай график ремонта офиса: демонтаж, электрика, отделка стен, пол, мебель',
    tasks: TASKS_OFFICE,
  },
  {
    label: 'ИТ-проект',
    prompt: 'Создай график разработки ИТ-проекта: аналитика, дизайн, разработка, тестирование, релиз',
    tasks: TASKS_IT,
  },
  {
    label: 'Мероприятие',
    prompt: 'Создай график подготовки мероприятия: площадка, кейтеринг, программа, продвижение, проведение',
    tasks: TASKS_EVENT,
  },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function DemoSection() {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [ganttKey, setGanttKey] = useState(0);
  const [activeTasks, setActiveTasks] = useState<Task[] | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const triggered = useRef(false);

  // Auto-trigger "Загородный дом" when section scrolls into view
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !triggered.current) {
          triggered.current = true;
          setSelectedIndex(0);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handleSubmit() {
    if (selectedIndex === null) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setActiveTasks(TEMPLATES[selectedIndex].tasks);
      setGanttKey(k => k + 1);
      setIsSubmitting(false);
    }, 700);
  }

  const selectedPrompt = selectedIndex !== null ? TEMPLATES[selectedIndex].prompt : null;

  return (
    <div ref={sectionRef}>
      <InputDemo
        chips={TEMPLATES.map(t => ({ label: t.label, prompt: t.prompt }))}
        selectedIndex={selectedIndex}
        selectedPrompt={selectedPrompt}
        onChipSelect={setSelectedIndex}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Spacer + Arrow */}
      <div className="h-8" />
      <div className="mb-6 flex justify-center text-muted-foreground animate-bob">
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Gantt — remounts on each submit via key */}
      <GanttPreview key={ganttKey} initialTasks={activeTasks} />

      {/* CTA */}
      <div className="mt-10 flex flex-col items-center gap-3">
        <a
          href="https://ai.getgantt.ru"
          className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-3.5 text-[15px] font-bold text-primary-foreground transition-all hover:opacity-90 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
        >
          Создать свой проект →
        </a>
        <p className="text-sm text-slate-500">Бесплатно · Без регистрации · Результат за 30 секунд</p>
      </div>
    </div>
  );
}
