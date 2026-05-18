import { CellSimple, Counter } from '@maxhub/max-ui';
import { Fragment, type CSSProperties, type ReactNode } from 'react';
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
  dateKey: string;
  onOpenFact: (task: FactTask) => void;
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });
const markedCounterStyle: CSSProperties = {
  color: 'var(--text-contrast-static)',
  backgroundColor: 'var(--background-accent-positive)',
};
const problemCounterStyle: CSSProperties = {
  color: 'var(--text-contrast-static)',
  backgroundColor: '#b4232f',
};

function getUtcDayIndex(dateKey: string): number {
  return Math.floor(new Date(`${dateKey}T00:00:00.000Z`).getTime() / 86_400_000);
}

function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDeadlineDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const currentYear = new Date().getFullYear();
  return date.getUTCFullYear() === currentYear ? shortDateFormatter.format(date) : dateFormatter.format(date);
}

function formatDeadlineLabel(dateKey: string): { text: string; isOverdue: boolean } {
  const todayDateKey = getTodayDateKey();
  const overdueDays = getUtcDayIndex(todayDateKey) - getUtcDayIndex(dateKey);
  const baseDate = formatDeadlineDate(dateKey);

  if (overdueDays > 0) {
    return {
      text: `${baseDate} (-${overdueDays} д.)`,
      isOverdue: true,
    };
  }

  return {
    text: baseDate,
    isOverdue: false,
  };
}

function getPlannedProgressByDate(task: FactTask, dateKey: string): number {
  const startIndex = getUtcDayIndex(task.startDate);
  const endIndex = getUtcDayIndex(task.endDate);
  const currentIndex = getUtcDayIndex(dateKey);

  if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex) || !Number.isFinite(currentIndex)) {
    return 0;
  }

  if (currentIndex < startIndex) {
    return 0;
  }

  if (currentIndex >= endIndex) {
    return 100;
  }

  const totalDays = Math.max(1, endIndex - startIndex + 1);
  const elapsedDays = Math.max(0, currentIndex - startIndex + 1);
  return Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)));
}

function formatPlanSubtitle(task: FactTask, dateKey: string, allowOverdueHighlight: boolean) {
  const plannedProgress = getPlannedProgressByDate(task, dateKey);
  const deadline = task.endDate ? formatDeadlineLabel(task.endDate) : { text: 'дата не задана', isOverdue: false };
  const highlightDeadline = allowOverdueHighlight && deadline.isOverdue;

  return (
    <Fragment>
      <span>{`План ${plannedProgress}% · `}</span>
      <span className={highlightDeadline ? 'task-card-deadline task-card-deadline--overdue' : 'task-card-deadline'}>{`⚑ ${deadline.text}`}</span>
    </Fragment>
  );
}

function formatProblemSubtitle(draft: Draft, fallback: ReactNode): ReactNode {
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
  dateKey,
  onOpenFact,
}: TaskCardProps) {
  if (!task.writable) {
    return null;
  }

  const progress = Math.max(0, Math.min(100, Math.round(task.progress || 0)));
  const hasProblemText = Boolean(draft.reason.trim() || draft.comment.trim());
  const isMarked = draft.state === 'not_worked' || draft.state === 'done' || draft.state === 'problem' || Boolean(draft.value.trim());
  const isProblem = draft.state === 'problem' || draft.state === 'not_worked' || hasProblemText;
  const draftProgress = Math.max(0, Math.min(100, Math.round(Number(draft.value || 0) || 0)));
  const isCompleted = !isProblem && isMarked && (draft.state === 'done' || draftProgress >= 100 || progress >= 100);
  const subtitle = isProblem
    ? formatProblemSubtitle(draft, formatPlanSubtitle(task, dateKey, false))
    : formatPlanSubtitle(task, dateKey, !isCompleted);
  const counterStyle = isProblem ? problemCounterStyle : isCompleted ? markedCounterStyle : undefined;

  return (
    <CellSimple
      height="normal"
      title={task.name}
      subtitle={subtitle}
      after={
        <Counter
          value={progress}
          appearance={isProblem ? 'negative' : isMarked ? 'themed' : 'neutral'}
          mode={isProblem || isMarked ? 'filled' : 'inverse'}
          muted={!isProblem && !isMarked}
          className="percent-counter"
          style={counterStyle}
        />
      }
      innerClassNames={isProblem ? { subtitle: 'task-card-subtitle--problem' } : undefined}
      showChevron
      onClick={() => onOpenFact(task)}
    />
  );
}
