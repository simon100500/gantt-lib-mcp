import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';

import type { ExcelDetailLevel } from '../lib/exportToExcel';
import type { Task } from '../types';

interface ExcelExportModalProps {
  tasks: Task[];
  projectName: string;
  onClose: () => void;
  onExport: (tasks: Task[], projectName: string, detailLevel: ExcelDetailLevel) => void;
}

const DETAIL_LEVELS: { value: ExcelDetailLevel; label: string; description: string }[] = [
  { value: 'brief', label: 'Краткая', description: 'Название, даты начала и окончания' },
  { value: 'standard', label: 'Стандартная', description: '+ Прогресс, тип задачи, родитель' },
  { value: 'full', label: 'Подробная', description: '+ Зависимости, порядок сортировки' },
];

export function ExcelExportModal({ tasks, projectName, onClose, onExport }: ExcelExportModalProps) {
  const [detailLevel, setDetailLevel] = useState<ExcelDetailLevel>('standard');

  const handleExport = () => {
    onExport(tasks, projectName, detailLevel);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Экспорт в Excel
          </h2>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          Выберите уровень детализации для экспорта {tasks.length} задач.
        </p>

        <div className="mb-5 space-y-2">
          {DETAIL_LEVELS.map((level) => (
            <label
              key={level.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                detailLevel === level.value
                  ? 'border-primary bg-primary/5'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="detail-level"
                value={level.value}
                checked={detailLevel === level.value}
                onChange={() => setDetailLevel(level.value)}
                className="mt-0.5 h-4 w-4 shrink-0 border-slate-300 text-primary focus:ring-primary"
              />
              <div>
                <div className="text-sm font-medium text-slate-900">{level.label}</div>
                <div className="text-xs text-slate-500">{level.description}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Скачать Excel
          </button>
        </div>
      </div>
    </div>
  );
}
