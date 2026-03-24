import { useState, useRef, useEffect } from 'react';

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
}

export default function InputDemo({ chips, selectedIndex, selectedPrompt, onChipSelect, onSubmit, isSubmitting }: Props) {
  const [displayText, setDisplayText] = useState('');
  const timerId = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        timerId.current = setTimeout(type, 22);
      } else {
        onSubmit();
      }
    };
    timerId.current = setTimeout(type, 80);
    return () => { if (timerId.current) clearTimeout(timerId.current); };
  }, [selectedPrompt]);

  return (
    <div className="relative mx-auto mt-6 max-w-[640px] px-4 md:px-8 animate-fade-up" style={{ animationDelay: '350ms' }}>
      <div className="flex flex-col gap-3">
        {/* Readonly textarea */}
        <textarea
          readOnly
          rows={3}
          value={displayText}
          placeholder="Выберите шаблон ниже…"
          aria-label="Описание проекта"
          name="project"
          style={{ maxHeight: '8rem', overflowY: 'auto', cursor: 'default' }}
          className="w-full px-4 py-3 text-base leading-6 bg-white resize-none border border-slate-200 rounded-xl shadow-md focus:outline-none select-none text-slate-700"
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
      </div>
    </div>
  );
}
