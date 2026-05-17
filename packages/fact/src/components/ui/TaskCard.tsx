import { CellSimple, Counter } from '@maxhub/max-ui';
import type { CSSProperties } from 'react';
import type { FactMarkState, FactTask } from '../../api/factApi';

type Draft = {
  state: FactMarkState;
  inputMode: 'volume' | 'percent';
  value: string;
  reason: string;
  comment: string;
  worked: boolean;
  people: string;
  workTitle: string;
};

type TaskCardProps = {
  task: FactTask;
  draft: Draft;
  onOpenFact: (task: FactTask) => void;
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const markedCounterStyle: CSSProperties = {
  color: 'var(--text-contrast-static)',
  backgroundColor: 'var(--background-accent-positive)',
};

function formatDateRange(task: FactTask): string {
  const start = task.startDate ? dateFormatter.format(new Date(`${task.startDate}T00:00:00.000Z`)) : 'дата не задана';
  const end = task.endDate ? dateFormatter.format(new Date(`${task.endDate}T00:00:00.000Z`)) : 'дата не задана';
  return `${start} - ${end}`;
}

export function TaskCard({
  task,
  draft,
  onOpenFact,
}: TaskCardProps) {
  if (!task.writable) {
    return null;
  }

  const progress = Math.max(0, Math.min(100, Math.round(task.progress || 0)));
  const isMarked = draft.state === 'not_worked' || draft.state === 'done' || draft.state === 'problem' || draft.value.trim();

  return (
    <CellSimple
      height="normal"
      title={task.name}
      subtitle={formatDateRange(task)}
      after={<Counter value={progress} appearance="themed" mode="filled" className="percent-counter" style={isMarked ? markedCounterStyle : undefined} />}
      showChevron
      onClick={() => onOpenFact(task)}
    />
  );
}
