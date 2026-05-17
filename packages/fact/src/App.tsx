import { useEffect, useMemo, useState } from 'react';
import { Button, Container, Flex, Panel, Spinner, Typography } from '@maxhub/max-ui';
import { closeFactDay, loadFactSession, type FactDayCloseEntry, type FactMarkState, type FactSession, type FactTask } from './api/factApi';
import { readLaunchToken, todayKey } from './session/token';
import { TaskCard } from './components/ui/TaskCard';

type Draft = {
  state: FactMarkState;
  value: string;
  reason: string;
  comment: string;
};

function createDraft(task: FactTask): Draft {
  return {
    state: task.closeState ?? (task.dayFact > 0 ? 'fact' : 'fact'),
    value: task.dayFact ? String(task.dayFact) : '',
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
        inputMode: 'volume',
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
          <Typography.Body>Загружаем работы</Typography.Body>
        </Container>
      </Panel>
    );
  }

  if (error && !session) {
    return (
      <Panel mode="secondary" className="app-shell">
        <Container className="state-box">
          <Typography.Title>Закрытие дня</Typography.Title>
          <Typography.Body>{error}</Typography.Body>
        </Container>
      </Panel>
    );
  }

  return (
    <Panel mode="secondary" className="app-shell">
      <Container className="page">
        <header className="page-header">
          <div>
            <Typography.Title>Закрытие дня</Typography.Title>
            <Typography.Body>{session?.project.name}</Typography.Body>
          </div>
          <input className="date-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </header>

        {error && <div className="notice notice--error">{error}</div>}
        {saved && <div className="notice">День сохранен.</div>}

        <Flex direction="column" gap={10}>
          {session?.tasks.length === 0 && (
            <Container className="state-box">
              <Typography.Body>Нет доступных работ на выбранный день.</Typography.Body>
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
      </Container>

      <div className="bottom-sheet">
        <div>
          <div className="bottom-sheet__count">{markedCount} из {writableTasks.length}</div>
          <div className="bottom-sheet__label">работ отмечено</div>
        </div>
        <Button mode="primary" disabled={submitting || writableTasks.length === 0} onClick={submit}>
          {submitting ? 'Отправляем' : 'Закрыть день'}
        </Button>
      </div>
    </Panel>
  );
}
