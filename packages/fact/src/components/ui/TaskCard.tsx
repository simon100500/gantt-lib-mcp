import { CellAction, CellHeader, CellInput, CellList, CellSimple, Grid, Textarea, Typography } from '@maxhub/max-ui';
import type { ChangeEvent } from 'react';
import type { FactMarkState, FactTask } from '../../api/factApi';

type Draft = {
  state: FactMarkState;
  inputMode: 'volume' | 'percent';
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

const stateLabels: Record<FactMarkState, string> = {
  fact: 'Факт',
  done: 'Выполнено',
  not_worked: 'Не работали',
  problem: 'Проблема',
};

function formatAmount(value: number, unit: string | null): string {
  const formatted = value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function normalizeDoneValue(task: FactTask, currentValue: string): string {
  if (!task.workVolume || task.workVolume <= 0) {
    return '100';
  }
  if (task.workVolume && task.workVolume > 0) {
    return String(task.workVolume);
  }
  return currentValue.trim() || String(task.dayFact || task.dayPlan || 0);
}

export function TaskCard({ task, draft, depth, onDraftChange }: TaskCardProps) {
  if (!task.writable) {
    return (
      <CellList
        mode="island"
        className="section-list"
        header={<CellHeader titleStyle="normal">{task.name}</CellHeader>}
      />
    );
  }

  const setState = (state: FactMarkState) => {
    onDraftChange(task.id, {
      ...draft,
      state,
      value: state === 'done' ? normalizeDoneValue(task, draft.value) : state === 'not_worked' ? '0' : draft.value,
    });
  };

  return (
    <CellList
      mode="island"
      className="work-list"
      style={{ marginLeft: Math.min(depth * 8, 24) }}
      header={(
        <CellHeader
          titleStyle="normal"
          after={(
            <Typography.Label variant="small-strong" className={`state-label state-label--${draft.state}`}>
              {stateLabels[draft.state]}
            </Typography.Label>
          )}
        >
          {task.name}
        </CellHeader>
      )}
    >
      <CellSimple
        height="compact"
        title={`План: ${formatAmount(task.dayPlan, task.workUnit)}`}
        subtitle={
          draft.inputMode === 'percent'
            ? `Прогресс задачи: ${Math.round(task.progress)}%`
            : `Сохранено за день: ${formatAmount(task.dayFact, task.workUnit)}`
        }
        after={task.progress > 0 ? (
          <Typography.Label variant="small-strong" className="progress-label">
            {Math.round(task.progress)}%
          </Typography.Label>
        ) : undefined}
      />

      <Grid cols={2} gap={8} className="state-grid">
        <CellAction height="compact" mode={draft.state === 'fact' ? 'primary' : 'custom'} onClick={() => setState('fact')}>
          Факт
        </CellAction>
        <CellAction height="compact" mode={draft.state === 'done' ? 'primary' : 'custom'} onClick={() => setState('done')}>
          Выполнено
        </CellAction>
        <CellAction height="compact" mode={draft.state === 'not_worked' ? 'primary' : 'custom'} onClick={() => setState('not_worked')}>
          Не работали
        </CellAction>
        <CellAction height="compact" mode={draft.state === 'problem' ? 'primary' : 'custom'} onClick={() => setState('problem')}>
          Проблема
        </CellAction>
      </Grid>

      <Grid cols={2} gap={8} className="input-mode-grid">
        <CellAction
          height="compact"
          mode={draft.inputMode === 'volume' ? 'primary' : 'custom'}
          disabled={!task.workVolume || task.workVolume <= 0}
          onClick={() => onDraftChange(task.id, { ...draft, inputMode: 'volume', value: task.dayFact ? String(task.dayFact) : '' })}
        >
          Объем
        </CellAction>
        <CellAction
          height="compact"
          mode={draft.inputMode === 'percent' ? 'primary' : 'custom'}
          onClick={() => onDraftChange(task.id, { ...draft, inputMode: 'percent', value: task.closeValue ? String(task.closeValue) : String(Math.round(task.progress || 0)) })}
        >
          Процент
        </CellAction>
      </Grid>

      <CellInput
        height="compact"
        before={draft.inputMode === 'percent' ? 'Факт, %' : task.workUnit ? `Факт, ${task.workUnit}` : 'Факт'}
        type="number"
        inputMode="decimal"
        min="0"
        max={draft.inputMode === 'percent' ? 100 : undefined}
        step={draft.inputMode === 'percent' ? 1 : 0.01}
        value={draft.value}
        disabled={draft.state === 'not_worked'}
        placeholder="0"
        onChange={(event: ChangeEvent<HTMLInputElement>) => onDraftChange(task.id, { ...draft, state: 'fact', value: event.target.value })}
      />

      {(draft.state === 'not_worked' || draft.state === 'problem') && (
        <div className="notes-stack">
          <Textarea
            mode="secondary"
            rows={2}
            value={draft.reason}
            placeholder="Причина"
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onDraftChange(task.id, { ...draft, reason: event.target.value })}
          />
          <Textarea
            mode="secondary"
            rows={3}
            value={draft.comment}
            placeholder="Комментарий"
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onDraftChange(task.id, { ...draft, comment: event.target.value })}
          />
        </div>
      )}
    </CellList>
  );
}
