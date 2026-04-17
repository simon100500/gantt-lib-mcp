import { useState } from 'react';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'gantt_pdf_helper_dismissed';

export function isPdfHelperDismissed(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function dismissPdfHelper(): void {
  localStorage.setItem(STORAGE_KEY, 'true');
}

interface PdfHelperModalProps {
  onContinue: () => void;
  onClose: () => void;
}

export function PdfHelperModal({ onContinue, onClose }: PdfHelperModalProps) {
  const [dontShow, setDontShow] = useState(false);

  const handleContinue = () => {
    if (dontShow) {
      dismissPdfHelper();
    }
    onContinue();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-6 text-[22px] font-semibold leading-tight text-slate-900">
          Как сохранить график в PDF
        </h2>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">1</span>
              <span className="text-[15px] font-semibold text-slate-900">
                Выберите «Сохранить как PDF»
              </span>
            </div>
            <p className="mb-3 text-sm leading-relaxed text-slate-600">
              В открывшемся окне печати выберите в качестве принтера <strong>«Сохранить как PDF»</strong>. В мобильном браузере функция может быть недоступна.
            </p>

            <img
              src="/print_pdf.png"
              alt="Выберите «Сохранить как PDF» в настройках принтера"
              className="mt-2 w-full rounded-lg border border-slate-200"
            />
          </div>

          {/* Step 2 */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">2</span>
              <span className="text-[15px] font-semibold text-slate-900">
                Настройте параметры
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">
              Выберите нужную <strong>ориентацию</strong> (альбомная для широких графиков), <strong>формат страницы</strong> и <strong>масштаб</strong>.
            </p>
          </div>

          {/* Step 3 */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">3</span>
              <span className="text-[15px] font-semibold text-slate-900">
                Нажмите «Сохранить»
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">
              Готово — файл PDF сохранится на ваш компьютер.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-slate-600">Не показывать подсказку</span>
          </label>

          <Button
            onClick={handleContinue}
            className="h-11 w-full rounded-2xl text-[15px] font-medium"
            size="lg"
          >
            Продолжить
          </Button>
        </div>
      </div>
    </div>
  );
}
