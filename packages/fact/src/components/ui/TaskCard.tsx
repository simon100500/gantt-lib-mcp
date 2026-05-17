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
const problemCounterStyle: CSSProperties = {
  color: 'var(--text-contrast-static)',
  backgroundColor: '#b4232f',
};

function formatDateRange(task: FactTask): string {
  const start = task.startDate ? dateFormatter.format(new Date(`${task.startDate}T00:00:00.000Z`)) : 'дата не задана';
  const end = task.endDate ? dateFormatter.format(new Date(`${task.endDate}T00:00:00.000Z`)) : 'дата не задана';
  return `${start} - ${end}`;
}

function formatProblemSubtitle(draft: Draft, fallback: string): string {
  const reason = draft.reason
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ');
  const comment = draft.comment.trim();
  const parts = [reason, comment].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : fallback;
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
  const hasProblemText = Boolean(draft.reason.trim() || draft.comment.trim());
  const isMarked = draft.state === 'not_worked' || draft.state === 'done' || draft.state === 'problem' || Boolean(draft.value.trim());
  const isProblem = draft.state === 'problem' || draft.state === 'not_worked' || hasProblemText;
  const subtitle = isProblem ? formatProblemSubtitle(draft, formatDateRange(task)) : formatDateRange(task);
  const counterStyle = isProblem ? problemCounterStyle : isMarked ? markedCounterStyle : undefined;

  return (
    <CellSimple
      height="normal"
      title={task.name}
      subtitle={subtitle}
      after={<Counter value={progress} appearance={isProblem ? 'negative' : 'themed'} mode="filled" className="percent-counter" style={counterStyle} />}
      innerClassNames={isProblem ? { subtitle: 'task-card-subtitle--problem' } : undefined}
      showChevron
      onClick={() => onOpenFact(task)}
    />
  );
}
