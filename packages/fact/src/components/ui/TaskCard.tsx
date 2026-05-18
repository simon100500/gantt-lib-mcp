import { CellSimple, Counter } from '@maxhub/max-ui';
import { Fragment, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { FactMarkState, FactTask } from '../../api/factApi';
import { getPlannedProgressByDate } from '../../utils/plannedProgress';

type Draft = {
  state: FactMarkState;
  inputMode: 'volume' | 'percent';
  value: string;
  explicitValue: boolean;
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
  breadcrumb?: string | null;
  forceVisible?: boolean;
  hideOnPlanSwipe: boolean;
  swipeDisabled: boolean;
  onOpenFact: (task: FactTask) => void;
  onSwipePlan: (task: FactTask) => boolean | Promise<boolean>;
  onSwipeReset: (task: FactTask) => boolean | Promise<boolean>;
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
const DISMISS_ANIMATION_MS = 260;

function getDateKeyIndex(dateKey: string): number {
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
  const overdueDays = getDateKeyIndex(todayDateKey) - getDateKeyIndex(dateKey);
  const baseDate = formatDeadlineDate(dateKey);

  if (overdueDays > 0) {
    return {
      text: `${baseDate} (+${overdueDays} д.)`,
      isOverdue: true,
    };
  }

  return {
    text: baseDate,
    isOverdue: false,
  };
}

function formatVolumeValue(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.?0+$/, '');
}

function getPlannedVolume(task: FactTask, plannedProgress: number): number | null {
  if (!task.workVolume || task.workVolume <= 0) {
    return null;
  }

  return (task.workVolume * plannedProgress) / 100;
}

function formatPlanSubtitle(task: FactTask, dateKey: string, allowOverdueHighlight: boolean, actualProgress: number) {
  const plannedProgress = getPlannedProgressByDate(task, dateKey);
  const plannedVolume = getPlannedVolume(task, plannedProgress);
  const deadline = task.endDate ? formatDeadlineLabel(task.endDate) : { text: 'дата не задана', isOverdue: false };
  const highlightDeadline = allowOverdueHighlight && deadline.isOverdue;
  const highlightPlan = plannedProgress > actualProgress;
  const hasPlannedVolume = Boolean(plannedVolume !== null && task.workUnit);
  const startDateText = task.startDate ? formatDeadlineDate(task.startDate) : null;
  const deadlineText = startDateText && startDateText !== deadline.text
    ? `${startDateText}-${deadline.text}`
    : deadline.text;
  const subtitlePrefix = hasPlannedVolume
    ? `План +${formatVolumeValue(plannedVolume!)} ${task.workUnit} · `
    : `План ${plannedProgress}% · `;

  return (
    <Fragment>
      <span className={highlightPlan ? 'task-card-plan task-card-plan--behind-fact' : 'task-card-plan'}>{subtitlePrefix}</span>
      <span className={highlightDeadline ? 'task-card-deadline task-card-deadline--overdue' : 'task-card-deadline'}>{`⚑ ${deadlineText}`}</span>
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
  breadcrumb,
  forceVisible = false,
  hideOnPlanSwipe,
  swipeDisabled,
  onOpenFact,
  onSwipePlan,
  onSwipeReset,
}: TaskCardProps) {
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeModeRef = useRef<'pending' | 'horizontal' | 'vertical' | null>(null);
  const swipeOffsetRef = useRef(0);
  const suppressClickRef = useRef(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDismissing, setIsDismissing] = useState(false);

  if (!task.writable && !forceVisible) {
    return null;
  }

  const progress = Math.max(0, Math.min(100, Math.round(task.progress || 0)));
  const plannedProgress = getPlannedProgressByDate(task, dateKey);
  const plannedVolume = getPlannedVolume(task, plannedProgress);
  const hasProblemText = Boolean(draft.reason.trim() || draft.comment.trim());
  const hasExplicitMark = draft.state === 'not_worked' || draft.state === 'done' || draft.state === 'problem' || (draft.explicitValue && Boolean(draft.value.trim()));
  const isProblem = draft.state === 'problem' || draft.state === 'not_worked' || hasProblemText;
  const markedProgress = draft.explicitValue ? Math.max(0, Math.min(100, Math.round(Number(draft.value || 0) || 0))) : progress;
  const isCompleted = !isProblem && hasExplicitMark && (draft.state === 'done' || markedProgress >= 100);
  const subtitle = isProblem
    ? formatProblemSubtitle(draft, formatPlanSubtitle(task, dateKey, false, markedProgress))
    : formatPlanSubtitle(task, dateKey, !isCompleted, markedProgress);
  const counterStyle = isProblem ? problemCounterStyle : isCompleted ? markedCounterStyle : undefined;

  useEffect(() => {
    setIsDismissing(false);
  }, [hasExplicitMark]);

  const resetSwipe = () => {
    pointerStartRef.current = null;
    swipeModeRef.current = null;
    swipeOffsetRef.current = 0;
    setSwipeOffset(0);
  };

  const updateSwipeOffset = (nextOffset: number) => {
    swipeOffsetRef.current = nextOffset;
    setSwipeOffset(nextOffset);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (swipeDisabled || isDismissing) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    swipeModeRef.current = 'pending';
    suppressClickRef.current = false;
    swipeOffsetRef.current = 0;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    if (swipeModeRef.current === 'pending') {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      const isAllowedDirection = hasExplicitMark ? deltaX > 0 : deltaX < 0;
      swipeModeRef.current = Math.abs(deltaX) > Math.abs(deltaY) && isAllowedDirection ? 'horizontal' : 'vertical';
    }

    if (swipeModeRef.current !== 'horizontal') {
      return;
    }

    event.preventDefault();
    updateSwipeOffset(hasExplicitMark
      ? Math.min(104, Math.max(0, deltaX))
      : Math.max(-104, Math.min(0, deltaX)));
  };

  const handlePointerEnd = async (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStartRef.current) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    if (swipeModeRef.current === 'horizontal' && hasExplicitMark && swipeOffsetRef.current >= 72) {
      suppressClickRef.current = true;
      resetSwipe();
      const didReset = await onSwipeReset(task);
      if (!didReset) {
        setIsDismissing(false);
      }
      return;
    }

    if (swipeModeRef.current === 'horizontal' && !hasExplicitMark && swipeOffsetRef.current <= -72) {
      suppressClickRef.current = true;
      resetSwipe();
      if (hideOnPlanSwipe) {
        setIsDismissing(true);
        await new Promise((resolve) => window.setTimeout(resolve, DISMISS_ANIMATION_MS));
      }
      const didMark = await onSwipePlan(task);
      if (!didMark) {
        setIsDismissing(false);
      }
      return;
    }

    resetSwipe();
  };

  return (
    <div
      className={`task-card-swipe ${isDismissing ? 'task-card-swipe--dismissing' : ''}`.trim()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => { void handlePointerEnd(event); }}
      onPointerCancel={resetSwipe}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onOpenFact(task);
      }}
    >
      <div
        className={`task-card-swipe-action ${hasExplicitMark ? 'task-card-swipe-action--reset' : ''} ${swipeOffset !== 0 ? 'task-card-swipe-action--visible' : ''}`.trim()}
        aria-hidden="true"
      >
        {hasExplicitMark ? 'Вернуть' : (
          <>
            <span>По плану</span>
            <span>{plannedVolume !== null && task.workUnit ? `+${formatVolumeValue(plannedVolume)} ${task.workUnit}` : `${plannedProgress}%`}</span>
          </>
        )}
      </div>
      <div
        className="task-card-swipe-content"
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset !== 0 ? 'none' : undefined,
        }}
      >
        <CellSimple
          height="normal"
          title={breadcrumb ? (
            <span className="task-card-title-stack">
              <span className="task-card-inline-breadcrumbs">{breadcrumb}</span>
              <span>{task.name}</span>
            </span>
          ) : task.name}
          subtitle={subtitle}
          after={
            swipeDisabled
              ? <span className="percent-counter-skeleton" aria-label="Сохраняем отметку" />
              : (
                <Counter
                  value={markedProgress}
                  appearance={isProblem ? 'negative' : hasExplicitMark ? 'themed' : 'neutral'}
                  mode={isProblem || hasExplicitMark ? 'filled' : 'inverse'}
                  muted={!isProblem && !hasExplicitMark}
                  className="percent-counter"
                  style={counterStyle}
                />
              )
          }
          innerClassNames={isProblem ? { subtitle: 'task-card-subtitle--problem' } : undefined}
          showChevron
        />
      </div>
    </div>
  );
}
