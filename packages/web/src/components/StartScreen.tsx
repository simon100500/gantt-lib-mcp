import { useState, useRef } from 'react';
import { ArrowUp, GanttChart } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StartScreenSendResult {
  accepted: boolean;
  message?: string;
}

export interface StartScreenProps {
  onSend: (text: string) => StartScreenSendResult | Promise<StartScreenSendResult>;
  onEmptyChart: () => void;
  isAuthenticated?: boolean;
  onLoginRequired?: () => void;
}

const CHIPS: Array<{ label: string; prompt: string; icon?: React.ComponentType<{ className?: string }> }> = [
  {
    label: 'Загородный дом',
    prompt: 'Создай график строительства загородного дома: фундамент, стены, кровля, отделка, ландшафт',
  },
  {
    label: 'Ремонт офиса',
    prompt: 'Создай график ремонта офиса: демонтаж, электрика, отделка стен, пол, мебель',
  },
  {
    label: 'ИТ-проект',
    prompt: 'Создай график разработки ИТ-проекта: аналитика, дизайн, разработка, тестирование, релиз',
  },
  {
    label: 'Мероприятие',
    prompt: 'Создай график подготовки мероприятия: площадка, кейтеринг, программа, продвижение, проведение',
  },
  {
    label: 'Пустой график',
    prompt: '',
    icon: GanttChart,
  },
];

export function StartScreen({ onSend, onEmptyChart, isAuthenticated = true, onLoginRequired }: StartScreenProps) {
  const [inputValue, setInputValue] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleTextareaInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    el.style.height = 'auto';
    const newHeight = el.scrollHeight;
    el.style.height = newHeight + 'px';
    el.style.overflowY = newHeight > 192 ? 'auto' : 'hidden';
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = inputValue.trim();
    if (!text) return;
    if (!isAuthenticated) {
      onLoginRequired?.();
      return;
    }
    setSubmitError(null);
    const result = await onSend(text);
    if (!result.accepted) {
      setSubmitError(result.message ?? 'Не удалось отправить запрос.');
      return;
    }
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
  }

  function handleChipClick(prompt: string) {
    setSubmitError(null);
    setInputValue(prompt);
    textareaRef.current?.focus();
  }

  return (
    <div className="flex h-full flex-1 flex-col items-center bg-background pt-28 sm:pt-32">
      <div className="w-full max-w-[640px] px-6">
        {/* Headline */}
        <h1 className="text-2xl font-semibold text-slate-900 mb-6 text-center">
          Какой проект планируем?
        </h1>

        {/* Textarea form block */}
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="relative">
            <textarea
              ref={textareaRef}
              rows={6}
              value={inputValue}
              onChange={e => {
                if (submitError) {
                  setSubmitError(null);
                }
                setInputValue(e.target.value);
              }}
              onInput={handleTextareaInput}
              placeholder="Опишите ваш проект или выберите пример ниже"
              autoComplete="off"
              spellCheck={false}
              style={{ maxHeight: '12rem', overflowY: 'hidden' }}
              className={cn(
                'w-full px-4 py-3 pr-12 text-base leading-6 bg-white resize-none',
                'border border-slate-200 rounded-xl shadow-md',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent focus-visible:outline-none',
              )}
            />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              aria-label="Отправить"
              className={cn(
                'absolute bottom-4 right-2.5 h-8 w-8 rounded-lg',
                'bg-primary text-primary-foreground',
                'flex items-center justify-center',
                'transition-colors hover:bg-primary/90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
          {submitError && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
              {submitError}
            </div>
          )}

          {/* Chips row */}
          <div className="flex flex-wrap gap-2 mt-3">
            {CHIPS.map((chip, index) => (
              <button
                key={chip.label}
                type="button"
                onClick={index === CHIPS.length - 1 ? onEmptyChart : () => handleChipClick(chip.prompt)}
                className={cn(
                  'text-sm px-3 py-1.5 rounded-full border border-slate-200 text-slate-600',
                  'flex items-center gap-1.5',
                  'transition-colors hover:border-primary hover:text-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                )}
              >
                {chip.icon && <chip.icon className="w-3.5 h-3.5" />}
                {chip.label}
              </button>
            ))}
          </div>
        </form>
      </div>

      {!isAuthenticated && (
        <div className="mt-auto flex w-full max-w-[640px] flex-wrap justify-center gap-x-4 gap-y-1 px-6 pt-6 pb-6 text-sm text-slate-400">
          <a href="https://getgantt.ru/" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 transition-colors">О продукте</a>
          <a href="https://ai.getgantt.ru/purchase" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 transition-colors">Тарифы</a>
          <a href="https://getgantt.ru/privacy/" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 transition-colors">Политика конфиденциальности</a>
          <a href="https://getgantt.ru/terms/" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 transition-colors">Условия</a>
        </div>
      )}
    </div>
  );
}
