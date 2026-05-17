import type { FactMarkState } from '../../api/factApi';

const labels: Record<FactMarkState, string> = {
  fact: 'Факт',
  done: 'Выполнено',
  not_worked: 'Не работали',
  problem: 'Проблема',
};

export function StatusChip({ state }: { state: FactMarkState | null }) {
  if (!state) {
    return <span className="status-chip status-chip--empty">Не отмечено</span>;
  }
  return <span className={`status-chip status-chip--${state}`}>{labels[state]}</span>;
}
