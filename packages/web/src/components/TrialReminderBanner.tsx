interface TrialReminderBannerProps {
  daysRemaining: number;
  onDismiss: () => void;
}

const REMINDER_DAYS = new Set([7, 3, 1]);

export function TrialReminderBanner({ daysRemaining, onDismiss }: TrialReminderBannerProps) {
  if (!REMINDER_DAYS.has(daysRemaining)) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
      <div className="text-sm text-blue-800">
        До конца пробного периода <strong>{daysRemaining} дн.</strong> После этого один проект останется доступен на бесплатном тарифе.
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-xs text-blue-600 hover:text-blue-800"
      >
        Закрыть
      </button>
    </div>
  );
}
