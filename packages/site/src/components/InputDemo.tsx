import { useState, useRef, useEffect } from 'react';

const CHIPS = [
  { label: 'Загородный дом', prompt: 'Создай график строительства загородного дома: фундамент, стены, кровля, отделка, ландшафт' },
  { label: 'Ремонт офиса', prompt: 'Создай график ремонта офиса: демонтаж, электрика, отделка стен, пол, мебель' },
  { label: 'ИТ-проект', prompt: 'Создай график разработки ИТ-проекта: аналитика, дизайн, разработка, тестирование, релиз' },
  { label: 'Мероприятие', prompt: 'Создай график подготовки мероприятия: площадка, кейтеринг, программа, продвижение, проведение' },
];

export default function InputDemo() {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = el.scrollHeight;
    el.style.height = newHeight + 'px';
    el.style.overflowY = newHeight > 192 ? 'auto' : 'hidden';
  }, [inputValue]);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = inputValue.trim();
    if (!text) return;
    window.location.href = 'https://ai.getgantt.ru';
  }

  function handleChipClick(prompt: string) {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    setInputValue('');
    textareaRef.current?.focus();

    let i = 0;
    const type = () => {
      i++;
      setInputValue(prompt.slice(0, i));
      if (i < prompt.length) {
        typingTimerRef.current = setTimeout(type, 22);
      }
    };
    typingTimerRef.current = setTimeout(type, 80);
  }

  return (
    <div className="relative mx-auto mt-6 max-w-[640px] px-4 md:px-8 animate-fade-up" style={{ animationDelay: '350ms' }}>
      {/* Headline */}
      <h2 className="text-xl font-semibold text-slate-900 mb-4 text-center">
        Какой график нужен?
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Chips row */}
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => handleChipClick(chip.prompt)}
              className="text-sm px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 flex items-center gap-1.5 transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          rows={4}
          name="project"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="Опишите ваш проект или выберите пример выше"
          autoComplete="off"
          aria-label="Описание проекта"
          style={{ maxHeight: '12rem', overflowY: 'hidden' }}
          className="w-full px-4 py-3 text-base leading-6 bg-white resize-none border border-slate-200 rounded-xl shadow-md focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:border-transparent focus-visible:outline-none"
        />

        {/* Submit button */}
        <button
          type="submit"
          disabled={!inputValue.trim()}
          className="w-full py-3 rounded-xl text-white font-semibold text-base btn-gradient-shimmer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
        >
          Отправить
        </button>
      </form>
    </div>
  );
}
