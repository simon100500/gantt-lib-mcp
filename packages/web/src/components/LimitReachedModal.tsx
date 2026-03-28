import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface LimitReachedModalProps {
  scenario: 'free-ai' | 'paid-ai' | 'project-limit';
  onClose: () => void;
}

const SCENARIOS = {
  'free-ai': {
    title: 'Вы сделали много изменений сегодня',
    body: 'Снимите ограничения и продолжайте работу.',
    primaryButton: 'Перейти на тарифы',
    secondaryButton: 'Не сейчас',
    href: '/purchase',
  },
  'paid-ai': {
    title: 'Вы сделали много изменений сегодня',
    body: 'Лимит обновится завтра в 00:00.',
    primaryButton: 'Расширить тариф',
    secondaryButton: 'Понятно',
    href: '/purchase',
  },
  'project-limit': {
    title: 'Чтобы создать новый проект, освободите место или расширьте тариф.',
    body: 'Текущий лимит проектов достигнут.',
    primaryButton: 'Расширить тариф',
    secondaryButton: 'Закрыть',
    href: '/purchase',
  },
} as const;

export function LimitReachedModal({ scenario, onClose }: LimitReachedModalProps) {
  const content = SCENARIOS[scenario];
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      style={{ overscrollBehavior: 'contain' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="relative w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl border-0 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={content.title}
        tabIndex={-1}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <h3 className="mb-2 pr-8 text-xl font-semibold text-slate-900" style={{ textWrap: 'balance' }}>
          {content.title}
        </h3>

        <p className="mb-6 text-sm text-slate-600">
          {content.body}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { window.location.href = content.href; }}
            className="flex-1 h-11 rounded-xl bg-primary text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
          >
            {content.primaryButton}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl bg-slate-100 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            {content.secondaryButton}
          </button>
        </div>
      </div>
    </div>
  );
}
