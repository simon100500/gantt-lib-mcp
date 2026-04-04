interface TrialOfferModalProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
  triggerFeature?: string;
}

export function TrialOfferModal({ open, onAccept, onDecline, triggerFeature }: TrialOfferModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-slate-900">Попробуйте 14 дней тарифа Старт</h2>
        <p className="mt-3 text-sm text-slate-600">
          Сделайте ещё объекты, экспортируйте график и работайте без ручных пересчётов
        </p>
        {triggerFeature && (
          <p className="mt-2 text-xs text-slate-500">
            Вы пытаетесь использовать: {triggerFeature}
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary/90"
          >
            Включить 14 дней бесплатно
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
          >
            Пока не нужно
          </button>
        </div>
      </div>
    </div>
  );
}
