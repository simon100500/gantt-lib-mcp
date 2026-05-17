import { Button, CellHeader, CellList, CellSimple, Container, Flex, Typography } from '@maxhub/max-ui';
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
  onOpenFact: (task: FactTask) => void;
  onOpenProblem: (task: FactTask) => void;
};

const stateLabels: Record<FactMarkState, string> = {
  fact: 'В работе',
  done: 'Готово',
  not_worked: 'Не работали',
  problem: 'Проблема',
};

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

function taskIcon(task: FactTask): string {
  const normalized = task.name.toLowerCase();
  if (normalized.includes('элект') || normalized.includes('кабел')) return '⚡';
  if (normalized.includes('сант') || normalized.includes('труб')) return '🔧';
  if (normalized.includes('бетон') || normalized.includes('стяж')) return '⬛';
  if (normalized.includes('маляр') || normalized.includes('краск')) return '🎨';
  if (normalized.includes('монтаж') || normalized.includes('перегород')) return '🔲';
  return '✓';
}

export function TaskCard({ task, draft, depth, onOpenFact, onOpenProblem }: TaskCardProps) {
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

  return (
    <CellList
      mode="island"
      className={`work-card ${statusClass(draft.state, draft.value)}`}
      style={{ marginLeft: Math.min(depth * 8, 24) }}
      header={(
        <CellHeader
          titleStyle="normal"
          after={(
            <Typography.Label variant="small-strong" className={`card-badge ${statusClass(draft.state, draft.value)}`}>
              {draft.value.trim() || draft.state !== 'fact' ? stateLabels[draft.state] : 'Не начато'}
            </Typography.Label>
          )}
        >
          <Flex align="center" gap={10}>
            <span className="card-icon">{taskIcon(task)}</span>
            <span>{task.name}</span>
          </Flex>
        </CellHeader>
      )}
    >
      <CellSimple
        height="compact"
        title={`План: ${formatAmount(task.dayPlan, task.workUnit)}`}
        subtitle={`Сегодня: ${dayValue}`}
        after={(
          <Typography.Label variant="small-strong" className="progress-label">
            {progress}%
          </Typography.Label>
        )}
      />

      <Container className="progress-block" fullWidth>
        <div className="progress-bar">
          <div className={`progress-fill ${statusClass(draft.state, draft.value)}`} style={{ width: `${progress}%` }} />
        </div>
        <Flex justify="space-between" className="progress-caption">
          <Typography.Body variant="small">Выполнено</Typography.Body>
          <Typography.Body variant="small">{formatAmount(task.completedVolume, task.workUnit)}</Typography.Body>
        </Flex>
      </Container>

      <Flex gap={8} className="card-actions">
        <Button mode="primary" size="small" stretched onClick={() => onOpenFact(task)}>
          Факт
        </Button>
        <Button mode="secondary" appearance="negative" size="small" stretched onClick={() => onOpenProblem(task)}>
          Проблема
        </Button>
      </Flex>
    </CellList>
  );
}
