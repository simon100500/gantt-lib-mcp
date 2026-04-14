import { useState, useRef, useEffect } from 'react';
import type { Task } from 'gantt-lib';
import InputDemo from './InputDemo.js';
import GanttPreview from './GanttPreview.js';
import { TEMPLATE_HOUSE } from './templates/house.js';
import { TEMPLATE_APARTMENT } from './templates/apartment.js';
import { TEMPLATE_COMMERCIAL } from './templates/commercial.js';
import { TEMPLATE_OVERHAUL } from './templates/overhaul.js';
import { TEMPLATE_RESIDENTIAL } from './templates/residential.js';

export const TEMPLATES = [
  TEMPLATE_HOUSE,
  TEMPLATE_APARTMENT,
  TEMPLATE_COMMERCIAL,
  TEMPLATE_OVERHAUL,
  TEMPLATE_RESIDENTIAL,
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

  function scrollToGantt(duration = 1200) {
    const el = ganttRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - (window.innerHeight - rect.height) / 2;
    const startY = window.scrollY;
    const distance = targetY - startY;
    const start = performance.now();
    const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      window.scrollTo(0, startY + distance * ease(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Smooth-scroll to the chart after the delayed template switch.
  useEffect(() => {
    if (!shouldScrollAfterSubmit.current) return;
    shouldScrollAfterSubmit.current = false;
    scrollToGantt();
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
      scrollToGantt();
      return;
    }
    shouldScrollAfterSubmit.current = true;
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
              Опишите что нужно построить — ИИ создаст план работ с задачами, сроками и зависимостями. Редактируйте текстом или мышкой.
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
