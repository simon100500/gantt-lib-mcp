import { Button, Textarea, Typography } from '@maxhub/max-ui';
import type { ChangeEvent } from 'react';
import type { FactMarkState, FactTask } from '../../api/factApi';
import { FactInput } from '../field/FactInput';
import { StatusChip } from './StatusChip';

type Draft = {
  state: FactMarkState;
  value: string;
  reason: string;
  comment: string;
};

type TaskCardProps = {
  task: FactTask;
  draft: Draft;
  depth: number;
  onDraftChange: (taskId: string, draft: Draft) => void;
};

function formatAmount(value: number, unit: string | null): string {
  if (!value) {
    return '0';
  }
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
}

export function TaskCard({ task, draft, depth, onDraftChange }: TaskCardProps) {
  if (!task.writable) {
    return (
      <div className="task-group" style={{ marginLeft: depth * 10 }}>
        <Typography.Body>{task.name}</Typography.Body>
      </div>
    );
  }

  const setState = (state: FactMarkState) => {
    onDraftChange(task.id, {
      ...draft,
      state,
      value: state === 'done' ? String(task.workVolume ?? draft.value) : state === 'not_worked' ? '0' : draft.value,
    });
  };

  return (
    <article className="task-card" style={{ marginLeft: depth * 10 }}>
      <div className="task-card__header">
        <div>
          <Typography.Body>{task.name}</Typography.Body>
          <div className="task-card__meta">
            План: {formatAmount(task.dayPlan, task.workUnit)} · Было: {formatAmount(task.dayFact, task.workUnit)}
          </div>
        </div>
        <StatusChip state={draft.state} />
      </div>

      <div className="task-card__actions" role="group" aria-label={`Статус работы ${task.name}`}>
        <Button mode={draft.state === 'fact' ? 'primary' : 'secondary'} size="small" onClick={() => setState('fact')}>
          Факт
        </Button>
        <Button mode={draft.state === 'done' ? 'primary' : 'secondary'} size="small" onClick={() => setState('done')}>
          Готово
        </Button>
        <Button mode={draft.state === 'not_worked' ? 'primary' : 'secondary'} size="small" onClick={() => setState('not_worked')}>
          Не работали
        </Button>
        <Button mode={draft.state === 'problem' ? 'primary' : 'secondary'} size="small" onClick={() => setState('problem')}>
          Проблема
        </Button>
      </div>

      <FactInput
        value={draft.value}
        unit={task.workUnit}
        disabled={draft.state === 'not_worked'}
        onChange={(value) => onDraftChange(task.id, { ...draft, state: 'fact', value })}
      />

      {(draft.state === 'not_worked' || draft.state === 'problem') && (
        <div className="task-card__notes">
          <Textarea
            value={draft.reason}
            placeholder="Причина"
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onDraftChange(task.id, { ...draft, reason: event.target.value })}
          />
          <Textarea
            value={draft.comment}
            placeholder="Комментарий"
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onDraftChange(task.id, { ...draft, comment: event.target.value })}
          />
        </div>
      )}
    </article>
  );
}
