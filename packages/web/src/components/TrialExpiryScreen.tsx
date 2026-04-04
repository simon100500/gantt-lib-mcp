interface TrialExpiryScreenProps {
  open: boolean;
  onUpgrade: () => void;
  onClose: () => void;
}

export function TrialExpiryScreen({ open, onUpgrade, onClose }: TrialExpiryScreenProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-slate-900">Пробный доступ закончился</h2>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <p>Ваши графики сохранены.</p>
          <p>Один проект остаётся доступен на бесплатном тарифе.</p>
          <p>Чтобы продолжить работу со всеми объектами и экспортом, перейдите на Старт.</p>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onUpgrade}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary/90"
          >
            Перейти на Старт
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
