import { useState, useRef } from 'react';

const CHIPS = [
  { label: 'Загородный дом', prompt: 'Создай график строительства загородного дома: фундамент, стены, кровля, отделка, ландшафт' },
  { label: 'Ремонт офиса', prompt: 'Создай график ремонта офиса: демонтаж, электрика, отделка стен, пол, мебель' },
  { label: 'ИТ-проект', prompt: 'Создай график разработки ИТ-проекта: аналитика, дизайн, разработка, тестирование, релиз' },
  { label: 'Мероприятие', prompt: 'Создай график подготовки мероприятия: площадка, кейтеринг, программа, продвижение, проведение' },
];

export default function InputDemo() {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleTextareaInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    el.style.height = 'auto';
    const newHeight = el.scrollHeight;
    el.style.height = newHeight + 'px';
    el.style.overflowY = newHeight > 192 ? 'auto' : 'hidden';
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = inputValue.trim();
    if (!text) return;
    // In demo mode, just redirect to the app
    window.location.href = 'https://ai.getgantt.ru';
  }

  function handleChipClick(prompt: string) {
    setInputValue(prompt);
    textareaRef.current?.focus();
  }

  return (
    <div className="relative mx-auto mt-12 max-w-[640px] px-4 md:px-8 animate-fade-up" style={{ animationDelay: '350ms' }}>
      {/* Headline */}
      <h2 className="text-xl font-semibold text-slate-900 mb-4 text-center">
        Какой график нужен?
      </h2>

      {/* Textarea form block */}
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={4}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onInput={handleTextareaInput}
            placeholder="Опишите ваш проект или выберите пример ниже"
            autoComplete="off"
            spellCheck={false}
            style={{ maxHeight: '12rem', overflowY: 'hidden' }}
            className="w-full px-4 py-3 pr-12 text-base leading-6 bg-white resize-none border border-slate-200 rounded-xl shadow-md focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:border-transparent focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            aria-label="Отправить"
            className="absolute bottom-2.5 right-2.5 h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Chips row */}
        <div className="flex flex-wrap gap-2 mt-3">
          {CHIPS.map((chip, index) => (
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
      </form>
    </div>
  );
}
