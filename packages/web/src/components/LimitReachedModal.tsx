interface LimitReachedModalProps {
  scenario: 'free-ai' | 'paid-ai' | 'project-limit';
  onClose: () => void;
}

const SCENARIOS = {
  'free-ai': {
    title: 'Вы сделали много изменений сегодня',
    body: 'Снимите ограничения и продолжайте работу.',
    primaryButton: 'Обновить тариф',
    secondaryButton: 'Не сейчас',
  },
  'paid-ai': {
    title: 'Вы сделали много изменений сегодня',
    body: 'Лимит обновится завтра в 00:00.',
    primaryButton: 'Расширить тариф',
    secondaryButton: 'Понятно',
  },
  'project-limit': {
    title: 'Чтобы создать новый проект, освободите место или расширьте тариф.',
    body: 'Текущий лимит проектов достигнут.',
    primaryButton: 'Расширить тариф',
    secondaryButton: 'Закрыть',
  },
} as const;

export function LimitReachedModal({ scenario, onClose }: LimitReachedModalProps) {
  const content = SCENARIOS[scenario];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="relative w-[420px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border-0 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Закрыть"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h3 className="text-xl font-semibold text-slate-900 pr-8 mb-2">
          {content.title}
        </h3>

        <p className="text-slate-600 text-sm mb-6">
          {content.body}
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => { window.location.href = '/purchase'; }}
            className="flex-1 h-11 bg-primary text-white rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            {content.primaryButton}
          </button>
          <button
            onClick={onClose}
            className="flex-1 h-11 bg-slate-100 text-slate-700 rounded-xl font-medium text-sm hover:bg-slate-200 transition-colors"
          >
            {content.secondaryButton}
          </button>
        </div>
      </div>
    </div>
  );
}
