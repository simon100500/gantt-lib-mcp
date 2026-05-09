import { useEffect, useRef, useState } from 'react';

const PROMPTS = [
  'Построить дом из газобетона с фундаментом, коробкой, кровлей и отделкой',
  'Ремонт офиса 350 м2: демонтаж, инженерия, перегородки, потолки и запуск',
  'Строительство склада с бетонными полами, рампой и подключением коммуникаций',
  'Капремонт школы: фасад, кровля, окна, электрика и внутренние помещения',
  'Возвести баню с террасой, печью, инженерией и благоустройством участка',
  'Сделать фитнес-клуб: планировка, вентиляция, душевые, отделка и меблировка',
  'Построить коттеджный поселок: дороги, сети, дома первой очереди и освещение',
  'Реконструкция ресторана: кухня, зал, сантехника, вентиляция и декор',
  'Монтаж производственной линии: подготовка цеха, фундамент, оборудование и пусконаладка',
  'Сделать жилой дом на 24 квартиры: земляные работы, монолит, кладка и инженерные сети',
];

const TYPE_DELAY_MS = 26;
const DELETE_DELAY_MS = 7;
const HOLD_AFTER_TYPE_MS = 1400;
const HOLD_AFTER_DELETE_MS = 260;

export default function FeaturesPromptDemo() {
  const [promptIndex, setPromptIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 132)}px`;
  }, [displayText]);

  useEffect(() => {
    const currentPrompt = PROMPTS[promptIndex] ?? '';

    if (!isDeleting && displayText === currentPrompt) {
      const timer = window.setTimeout(() => setIsDeleting(true), HOLD_AFTER_TYPE_MS);
      return () => window.clearTimeout(timer);
    }

    if (isDeleting && displayText.length === 0) {
      const timer = window.setTimeout(() => {
        setIsDeleting(false);
        setPromptIndex((prev) => (prev + 1) % PROMPTS.length);
      }, HOLD_AFTER_DELETE_MS);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      setDisplayText((prev) => {
        if (isDeleting) {
          return prev.slice(0, -1);
        }
        return currentPrompt.slice(0, prev.length + 1);
      });
    }, isDeleting ? DELETE_DELAY_MS : TYPE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [displayText, isDeleting, promptIndex]);

  return (
    <div className="w-full rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-6">
      <div className="flex flex-col gap-4">
        <textarea
          ref={textareaRef}
          readOnly
          rows={4}
          value={displayText}
          aria-label="Описание проекта"
          name="project-demo"
          style={{ overflowY: 'hidden', cursor: 'text' }}
          className="min-h-[132px] w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6 text-slate-700 focus:outline-none"
        />

        <a
          href="https://ai.getgantt.ru/?auth=otp"
          className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:opacity-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
        >
          Создать свой проект
        </a>
      </div>
    </div>
  );
}
