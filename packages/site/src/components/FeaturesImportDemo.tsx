import { useEffect, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';

type DemoStage = 'idle' | 'dragging' | 'dropped' | 'preview';

const STAGE_DURATIONS = {
  idle: 1200,
  dragging: 1400,
  dropped: 900,
  preview: 1800,
} as const;

export default function FeaturesImportDemo() {
  const [stage, setStage] = useState<DemoStage>('idle');
  const [fileKind, setFileKind] = useState<'xlsx' | 'gsfx'>('xlsx');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (stage === 'idle') {
        setFileKind((prev) => (prev === 'xlsx' ? 'gsfx' : 'xlsx'));
        setStage('dragging');
        return;
      }
      if (stage === 'dragging') {
        setStage('dropped');
        return;
      }
      if (stage === 'dropped') {
        setStage('preview');
        return;
      }
      setStage('idle');
    }, STAGE_DURATIONS[stage]);

    return () => window.clearTimeout(timer);
  }, [stage]);

  const fileName = fileKind === 'xlsx' ? 'Шаблон-монтажа.xlsx' : 'Раздел_кровля.gsfx';
  const fileBadge = fileKind === 'xlsx' ? '.xlsx' : '.gsfx';
  const ganttRows = fileKind === 'xlsx'
    ? [
        { name: 'Подготовка', left: '6%', width: '26%' },
        { name: 'Монтаж мембраны', left: '34%', width: '38%' },
        { name: 'Пролив швов', left: '62%', width: '22%' },
      ]
    : [
        { name: 'Основание', left: '8%', width: '24%' },
        { name: 'Гидроизоляция', left: '30%', width: '34%' },
        { name: 'Проверка', left: '60%', width: '18%' },
      ];

  return (
    <div className="relative h-[460px] overflow-hidden">
      <div
        className={`absolute left-1/2 top-[24px] z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_10px_30px_rgba(15,23,42,0.12)] transition-all duration-700 ${
          stage === 'idle'
            ? '-translate-y-10 opacity-0'
            : stage === 'dragging'
              ? 'translate-y-0 opacity-100'
              : stage === 'dropped'
                ? 'translate-y-[152px] scale-95 opacity-100'
                : 'translate-y-[118px] scale-90 opacity-0'
        }`}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <FileSpreadsheet className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="max-w-[160px] truncate text-[13px] font-medium text-slate-800">
            {fileName}
          </div>
          <div className="text-[11px] text-slate-500">{fileBadge}</div>
        </div>
      </div>

      <div className="mt-[132px] overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
          Предпросмотр графика
        </div>
        <div className="px-4 py-4">
          <div className="mb-3 grid grid-cols-[120px_repeat(6,minmax(0,1fr))] gap-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-400">
            <div>Задача</div>
            <div className="text-center">1</div>
            <div className="text-center">2</div>
            <div className="text-center">3</div>
            <div className="text-center">4</div>
            <div className="text-center">5</div>
            <div className="text-center">6</div>
          </div>
          <div className="space-y-3">
            {ganttRows.map((row, index) => (
              <div key={`${row.name}-${index}`} className="grid grid-cols-[120px_1fr] items-center gap-3">
                <div className="truncate text-[13px] font-medium text-slate-600">
                  {row.name}
                </div>
                <div className="relative h-8 overflow-hidden rounded-lg bg-slate-50">
                  <div className="absolute inset-0 grid grid-cols-6">
                    {Array.from({ length: 6 }).map((_, cellIndex) => (
                      <div
                        key={cellIndex}
                        className="border-l border-slate-200 first:border-l-0"
                      />
                    ))}
                  </div>
                  <div
                    className={`absolute top-1/2 h-4 -translate-y-1/2 rounded-full bg-primary shadow-[0_6px_18px_rgba(97,88,224,0.28)] transition-all duration-700 ${
                      stage === 'preview' ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{ left: row.left, width: row.width }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
