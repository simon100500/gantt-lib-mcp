import { useEffect, useMemo, useState } from 'react';
import { Button, CellHeader, CellInput, CellList, Container, Counter, Flex, Panel, Spinner, Typography } from '@maxhub/max-ui';
import { closeFactDay, loadFactSession, type FactDayCloseEntry, type FactMarkState, type FactSession, type FactTask } from './api/factApi';
import { readLaunchToken, todayKey } from './session/token';
import { TaskCard } from './components/ui/TaskCard';

type Draft = {
  state: FactMarkState;
  inputMode: 'volume' | 'percent';
  value: string;
  reason: string;
  comment: string;
};

function createDraft(task: FactTask): Draft {
  const inputMode = task.closeInputMode ?? (task.workVolume && task.workVolume > 0 ? 'volume' : 'percent');
  const value = task.closeValue ?? (inputMode === 'volume' ? task.dayFact : task.progress);
  return {
    state: task.closeState ?? (task.dayFact > 0 ? 'fact' : 'fact'),
    inputMode,
    value: value ? String(value) : '',
    reason: task.closeReason ?? '',
    comment: task.closeComment ?? '',
  };
}

function buildDepthMap(tasks: FactTask[]): Map<string, number> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const depthById = new Map<string, number>();
  for (const task of tasks) {
    let depth = 0;
    let current = task.parentId ? byId.get(task.parentId) : undefined;
    while (current) {
      depth += 1;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    depthById.set(task.id, depth);
  }
  return depthById;
}

export function App() {
  const [token] = useState(() => readLaunchToken());
  const [date, setDate] = useState(() => todayKey());
  const [session, setSession] = useState<FactSession | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Откройте ссылку с token.');
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);
    loadFactSession({ token, date })
      .then((nextSession) => {
        if (!alive) {
          return;
        }
        setSession(nextSession);
        setDrafts(Object.fromEntries(nextSession.tasks.filter((task) => task.writable).map((task) => [task.id, createDraft(task)])));
      })
      .catch((err: unknown) => {
        if (alive) {
          setError(err instanceof Error ? err.message : 'Не удалось загрузить день.');
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [date, token]);

  const depthById = useMemo(() => buildDepthMap(session?.tasks ?? []), [session?.tasks]);
  const writableTasks = session?.tasks.filter((task) => task.writable) ?? [];
  const markedCount = writableTasks.filter((task) => {
    const draft = drafts[task.id];
    return draft && (draft.state === 'not_worked' || draft.state === 'done' || draft.state === 'problem' || draft.value.trim());
  }).length;

  const submit = async () => {
    if (!token || !session) {
      return;
    }

    const entries: FactDayCloseEntry[] = writableTasks.map((task) => {
      const draft = drafts[task.id] ?? createDraft(task);
      const parsedValue = Number(draft.value.replace(',', '.'));
      return {
        taskId: task.id,
        state: draft.state,
        value: Number.isFinite(parsedValue) ? parsedValue : 0,
        inputMode: draft.inputMode,
        reason: draft.reason,
        comment: draft.comment,
      };
    });

    setSubmitting(true);
    setError(null);
    try {
      await closeFactDay({ token, date, entries });
      const refreshed = await loadFactSession({ token, date });
      setSession(refreshed);
      setDrafts(Object.fromEntries(refreshed.tasks.filter((task) => task.writable).map((task) => [task.id, createDraft(task)])));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить закрытие дня.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Panel mode="secondary" className="app-shell">
        <Container className="state-box">
          <Spinner />
          <Typography.Body variant="medium">Загружаем работы</Typography.Body>
        </Container>
      </Panel>
    );
  }

  if (error && !session) {
    return (
      <Panel mode="secondary" className="app-shell">
        <Container className="state-box">
          <Typography.Title>Закрытие дня</Typography.Title>
          <Typography.Body variant="medium">{error}</Typography.Body>
        </Container>
      </Panel>
    );
  }

  return (
    <Panel mode="secondary" className="app-shell">
      <Container className="page" fullWidth>
        <Flex direction="column" gap={18}>
          <Container className="hero" fullWidth>
            <Flex direction="column" gap={8}>
              <Typography.Headline variant="large-strong" className="hero__title">
                Закрытие дня
              </Typography.Headline>
              <Typography.Body variant="small" className="hero__project">
                {session?.project.name}
              </Typography.Body>
              <Flex align="center" justify="space-between" gap={12} className="hero__summary">
                <Typography.Body variant="small">
                  {markedCount} из {writableTasks.length} работ отмечено
                </Typography.Body>
                <Counter value={writableTasks.length} rounded appearance="neutral-themed" />
              </Flex>
            </Flex>
          </Container>

          <CellList mode="island" header={<CellHeader titleStyle="normal">Дата закрытия</CellHeader>}>
            <CellInput
              height="compact"
              before="День"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </CellList>

        {error && <div className="notice notice--error">{error}</div>}
        {saved && <div className="notice">День сохранен.</div>}

        <Flex direction="column" gap={12}>
          {session?.tasks.length === 0 && (
            <Container className="state-box">
              <Typography.Body variant="medium">Нет доступных работ на выбранный день.</Typography.Body>
            </Container>
          )}
          {session?.tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              depth={depthById.get(task.id) ?? 0}
              draft={drafts[task.id] ?? createDraft(task)}
              onDraftChange={(taskId, draft) => {
                setSaved(false);
                setDrafts((current) => ({ ...current, [taskId]: draft }));
              }}
            />
          ))}
        </Flex>
        </Flex>
      </Container>

      <Container className="bottom-sheet" fullWidth>
        <Flex direction="column" gap={2}>
          <Typography.Label variant="large-strong">{markedCount} из {writableTasks.length}</Typography.Label>
          <Typography.Body variant="small" className="bottom-sheet__label">работ отмечено</Typography.Body>
        </Flex>
        <Button mode="primary" disabled={submitting || writableTasks.length === 0} onClick={submit}>
          {submitting ? 'Отправляем' : 'Закрыть день'}
        </Button>
      </Container>
    </Panel>
  );
}
