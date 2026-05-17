import { Button, CellHeader, CellList, CellSimple, Container, Counter, Flex, Grid, Typography } from '@maxhub/max-ui';
import type { FactMarkState, FactTask } from '../../api/factApi';

type Draft = {
  state: FactMarkState;
  inputMode: 'volume' | 'percent';
  value: string;
  reason: string;
  comment: string;
  worked: boolean;
  people: string;
  team: string;
};

type TaskCardProps = {
  task: FactTask;
  draft: Draft;
  location: string;
  team: string;
  onOpenFact: (task: FactTask) => void;
  onOpenProblem: (task: FactTask) => void;
  onOpenPhoto: (task: FactTask) => void;
  onMarkNotWorked: (task: FactTask) => void;
};

const stateLabels: Record<FactMarkState, string> = {
  fact: 'В работе',
  done: 'Завершена',
  not_worked: 'Не работали',
  problem: 'Проблема',
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

function formatAmount(value: number, unit: string | null): string {
  const formatted = value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function statusClass(state: FactMarkState, value: string): string {
  if (state === 'done') return 'status-done';
  if (state === 'problem') return 'status-problem';
  if (state === 'not_worked') return 'status-risk';
  if (value.trim()) return 'status-progress';
  return 'status-not-started';
}

function formatDateRange(task: FactTask): string {
  const start = task.startDate ? dateFormatter.format(new Date(`${task.startDate}T00:00:00.000Z`)) : 'дата не задана';
  const end = task.endDate ? dateFormatter.format(new Date(`${task.endDate}T00:00:00.000Z`)) : 'дата не задана';
  return `${start} - ${end}`;
}

export function TaskCard({
  task,
  draft,
  location,
  team,
  onOpenFact,
  onOpenProblem,
  onOpenPhoto,
  onMarkNotWorked,
}: TaskCardProps) {
  if (!task.writable) {
    return (
      <CellList
        mode="island"
        className="section-list"
        header={<CellHeader titleStyle="normal">{task.name}</CellHeader>}
      />
    );
  }

  const progress = Math.max(0, Math.min(100, Math.round(task.progress || 0)));
  const dayValue = draft.inputMode === 'percent'
    ? `${draft.value || progress || 0}%`
    : formatAmount(task.dayFact, task.workUnit);
  const status = statusClass(draft.state, draft.value);

  return (
    <CellList
      mode="island"
      className={`work-card ${status}`}
      header={(
        <CellHeader
          titleStyle="normal"
          after={(
            <Typography.Label variant="small-strong" className={draft.state === 'problem' ? 'text-pill text-pill--negative' : 'text-pill'}>
              {draft.value.trim() || draft.state !== 'fact' ? stateLabels[draft.state] : 'Не начата'}
            </Typography.Label>
          )}
        >
          {task.name}
        </CellHeader>
      )}
    >
      <CellSimple
        height="normal"
        title={location}
        subtitle={`${team} · ${formatDateRange(task)}`}
        after={(
          <Typography.Label variant="small-strong" className="progress-label">
            {progress}%
          </Typography.Label>
        )}
      />

      <Grid cols={2} gap={8} className="task-facts-grid">
        <CellSimple height="compact" title="План" subtitle={task.dayPlan ? formatAmount(task.dayPlan, task.workUnit) : 'без единиц'} />
        <CellSimple height="compact" title="Сегодня" subtitle={dayValue} />
      </Grid>

      <Container className="progress-block" fullWidth>
        <div className="progress-bar" aria-label={`Прогресс ${progress}%`}>
          <div className={`progress-fill ${status}`} style={{ width: `${progress}%` }} />
        </div>
        <Flex justify="space-between" className="progress-caption">
          <Typography.Body variant="small">Всего выполнено</Typography.Body>
          <Typography.Body variant="small">{formatAmount(task.completedVolume, task.workUnit)}</Typography.Body>
        </Flex>
      </Container>

      <Grid cols={2} gap={8} className="card-actions">
        <Button mode="primary" size="small" stretched onClick={() => onOpenFact(task)}>
          Факт
        </Button>
        <Button mode="secondary" appearance="negative" size="small" stretched onClick={() => onOpenProblem(task)}>
          Проблема
        </Button>
        <Button mode="secondary" appearance="neutral" size="small" stretched onClick={() => onOpenPhoto(task)}>
          Фото
        </Button>
        <Button mode="secondary" appearance="neutral" size="small" stretched onClick={() => onMarkNotWorked(task)}>
          Не работали
        </Button>
      </Grid>
    </CellList>
  );
}
