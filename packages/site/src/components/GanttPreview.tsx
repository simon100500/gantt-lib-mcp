import { useEffect, useState } from 'react';

const BARS = [
  { label: 'Исследование', text: 'Анализ', left: 0, width: 22, color: '#1d4ed8', delay: 0.5 },
  { label: 'Дизайн', text: 'UI/UX', left: 20, width: 28, color: '#7c3aed', delay: 0.65 },
  { label: 'Разработка', text: 'Frontend + API', left: 36, width: 38, color: '#0891b2', delay: 0.8 },
  { label: 'Тестирование', text: 'QA', left: 68, width: 18, color: '#ea580c', delay: 0.95 },
  { label: 'Релиз', text: 'Deploy', left: 84, width: 12, color: '#16a34a', delay: 1.1 },
];

export default function GanttPreview() {
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => {
        const next = prev + 0.1;
        if (next >= 1.4) {
          clearInterval(interval);
          return 1.4;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative mx-auto mb-20 max-w-[700px] animate-fade-up px-4 md:px-8" style={{ animationDelay: '500ms' }}>
      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-3 text-[12px] font-bold text-secondary-foreground">
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
          <span className="flex-1">График сгенерирован</span>
          <span className="font-medium text-muted-foreground tabular-nums">{timer.toFixed(1)} с</span>
        </div>

        {/* Rows */}
        <div className="py-2">
          {BARS.map((bar, index) => (
            <div key={index} className="grid grid-cols-[140px_1fr] items-center gap-3 px-4" style={{ height: 32 }}>
              <span className="whitespace-nowrap text-[11px] font-semibold text-secondary-foreground">
                {bar.label}
              </span>
              <div className="relative h-3.5">
                <div
                  className="absolute left-0 top-0 flex h-3.5 items-center overflow-hidden rounded-[4px] px-1.5 text-[9px] font-extrabold text-white/90 whitespace-nowrap animate-grow-in"
                  style={{
                    left: `${bar.left}%`,
                    width: `${bar.width}%`,
                    backgroundColor: bar.color,
                    animationDelay: `${bar.delay}s`,
                  }}
                >
                  {bar.text}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer badge */}
        <div className="flex items-center gap-1.5 border-t border-border bg-accent-bg px-4 py-2 text-[11px] font-semibold text-primary">
          <span>&#10022;</span>
          Сгенерировано автоматически &middot; 5 этапов &middot; 12 задач &middot; 3 исполнителя
        </div>
      </div>
    </div>
  );
}
