import { useState, useRef, useEffect } from 'react';
import { ArrowDown } from 'lucide-react';

interface Chip {
  label: string;
  prompt: string;
}

interface Props {
  chips: Chip[];
  selectedIndex: number | null;
  selectedPrompt: string | null;
  onChipSelect: (index: number) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  containerClassName?: string;
}

export default function InputDemo({
  chips,
  selectedIndex,
  selectedPrompt,
  onChipSelect,
  onSubmit,
  isSubmitting,
  containerClassName = '',
}: Props) {
  const [displayText, setDisplayText] = useState('');
  const timerId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea when text changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [displayText]);

  // Typing animation when selected prompt changes
  useEffect(() => {
    if (timerId.current) clearTimeout(timerId.current);
    if (!selectedPrompt) {
      setDisplayText('');
      return;
    }
    setDisplayText('');
    let i = 0;
    const type = () => {
      i++;
      setDisplayText(selectedPrompt.slice(0, i));
      if (i < selectedPrompt.length) {
        timerId.current = setTimeout(type, 10);
      } else {
        onSubmit();
      }
    };
    timerId.current = setTimeout(type, 30);
    return () => { if (timerId.current) clearTimeout(timerId.current); };
  }, [selectedPrompt]);

  const canSubmit = selectedIndex !== null && !isSubmitting;

  return (
    <div
      className={`relative mx-auto max-w-[640px] animate-fade-up ${containerClassName}`}
      style={{ animationDelay: '350ms' }}
    >
      <div className="flex flex-col gap-3">
        {/* Prompt label */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Промпт</span>
        </div>

        {/* Readonly textarea */}
        <textarea
          ref={textareaRef}
          readOnly
          rows={4}
          value={displayText}
          placeholder="Например: Ремонт двушки 60м², сначала демонтаж, потом электрика и сантехника параллельно, затем стяжка, штукатурка, плитка в санузле, чистовая отделка"
          aria-label="Описание проекта"
          name="project"
          style={{ overflowY: 'hidden', cursor: 'default' }}
          className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6 text-slate-700 select-none focus:outline-none transition-[height] duration-150"
        />

        {/* Chips */}
        <div className="flex flex-wrap gap-2">
          {chips.map((chip, i) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => onChipSelect(i)}
              disabled={isSubmitting}
              className={`text-sm px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 disabled:pointer-events-none ${
                selectedIndex === i
                  ? 'border-primary bg-primary/5 text-primary font-medium'
                  : 'border-slate-200 text-slate-600 hover:border-primary hover:text-primary'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Submit button */}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none disabled:translate-y-0 disabled:shadow-none"
        >
          {isSubmitting ? 'Загрузка…' : <><ArrowDown className="inline-block mr-1.5 h-4 w-4 align-[-2px]" />Показать график</>}
        </button>
      </div>
    </div>
  );
}
