import { useEffect, useMemo, useState } from 'react';
import { Button, CellAction, CellHeader, CellInput, CellList, CellSimple, Container, Counter, Flex, Grid, Panel, Spinner, Textarea, Typography } from '@maxhub/max-ui';
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

type SheetMode = 'fact' | 'problem' | 'close-day' | null;

const reasonTags = ['Нет материала', 'Нет людей', 'Не готов фронт', 'Ждем смежников', 'Изменение проекта', 'Погода'];

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
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

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

  useEffect(() => {
    document.body.style.overflow = sheetMode ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sheetMode]);

  const depthById = useMemo(() => buildDepthMap(session?.tasks ?? []), [session?.tasks]);
  const writableTasks = session?.tasks.filter((task) => task.writable) ?? [];
  const activeTask = activeTaskId ? writableTasks.find((task) => task.id === activeTaskId) ?? null : null;
  const activeDraft = activeTask ? drafts[activeTask.id] ?? createDraft(activeTask) : null;
  const markedCount = writableTasks.filter((task) => {
    const draft = drafts[task.id];
    return draft && (draft.state === 'not_worked' || draft.state === 'done' || draft.state === 'problem' || draft.value.trim());
  }).length;
  const unmarkedTasks = writableTasks.filter((task) => {
    const draft = drafts[task.id];
    return !draft || !(draft.state === 'not_worked' || draft.state === 'done' || draft.state === 'problem' || draft.value.trim());
  });

  const updateDraft = (taskId: string, nextDraft: Draft) => {
    setSaved(false);
    setDrafts((current) => ({ ...current, [taskId]: nextDraft }));
  };

  const openTaskSheet = (task: FactTask, mode: 'fact' | 'problem') => {
    const draft = drafts[task.id] ?? createDraft(task);
    updateDraft(task.id, {
      ...draft,
      state: mode === 'problem' ? 'problem' : draft.state === 'problem' ? 'fact' : draft.state,
    });
    setActiveTaskId(task.id);
    setSheetMode(mode);
  };

  const closeSheet = () => {
    setSheetMode(null);
    setActiveTaskId(null);
  };

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
      closeSheet();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить закрытие дня.');
    } finally {
      setSubmitting(false);
    }
  };

  const shiftDate = (offset: number) => {
    const nextDate = new Date(`${date}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + offset);
    setDate(nextDate.toISOString().slice(0, 10));
  };

  const setActiveState = (state: FactMarkState) => {
    if (!activeTask || !activeDraft) return;
    updateDraft(activeTask.id, {
      ...activeDraft,
      state,
      value: state === 'done'
        ? activeDraft.inputMode === 'percent' ? '100' : String(activeTask.workVolume ?? activeTask.dayPlan ?? activeDraft.value)
        : state === 'not_worked' ? '0' : activeDraft.value,
    });
  };

  const toggleReason = (reason: string) => {
    if (!activeTask || !activeDraft) return;
    const parts = activeDraft.reason.split(',').map((part) => part.trim()).filter(Boolean);
    const nextParts = parts.includes(reason) ? parts.filter((part) => part !== reason) : [...parts, reason];
    updateDraft(activeTask.id, { ...activeDraft, reason: nextParts.join(', ') });
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
      <Container className="app-frame" fullWidth>
        <Container className="app-header" fullWidth>
          <Flex align="center" justify="space-between" gap={12}>
            <Flex align="center" gap={10}>
              <span className="header-logo">Fact<span>GetGantt</span></span>
              <Flex direction="column">
                <Typography.Label variant="medium-strong">{session?.project.name}</Typography.Label>
                <Typography.Body variant="small" className="muted-text">Факт с площадки</Typography.Body>
              </Flex>
            </Flex>
            <Typography.Label variant="small-strong" className="date-pill">{date.split('-').reverse().join('.')}</Typography.Label>
          </Flex>
        </Container>

        <Container className="content" fullWidth>
          <Flex className="day-switcher" gap={8}>
            {[-1, 0, 1].map((offset) => {
              const itemDate = new Date(`${date}T00:00:00.000Z`);
              itemDate.setUTCDate(itemDate.getUTCDate() + offset);
              const itemKey = itemDate.toISOString().slice(0, 10);
              return (
                <Button
                  key={offset}
                  mode={offset === 0 ? 'primary' : 'secondary'}
                  appearance={offset === 0 ? 'themed' : 'neutral'}
                  size="small"
                  onClick={() => setDate(itemKey)}
                >
                  {offset === 0 ? 'Сегодня' : offset < 0 ? 'Вчера' : 'Завтра'} · {itemKey.slice(8, 10)}
                </Button>
              );
            })}
          </Flex>

          <CellList mode="island" header={<CellHeader titleStyle="normal">Дата закрытия</CellHeader>}>
            <CellInput
              height="compact"
              before="День"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </CellList>

          {error && <Container className="notice notice--error">{error}</Container>}
          {saved && <Container className="notice">День сохранен.</Container>}

          <Container className="section-header" fullWidth>
            <Typography.Label variant="small-caps">Работы на сегодня</Typography.Label>
            <Counter value={writableTasks.length} rounded appearance="neutral" />
          </Container>

          <Flex direction="column" gap={10}>
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
              onOpenFact={(nextTask) => openTaskSheet(nextTask, 'fact')}
              onOpenProblem={(nextTask) => openTaskSheet(nextTask, 'problem')}
            />
          ))}
          </Flex>

          <Container className="close-day-banner" fullWidth onClick={() => setSheetMode('close-day')}>
            <Typography.Label variant="large-strong">Закрыть день</Typography.Label>
            <Typography.Body variant="small">Проверить неотмеченные работы и отправить отчет</Typography.Body>
            <Flex gap={16} className="close-day-stats">
              <Flex direction="column">
                <Typography.Headline variant="medium-strong">{markedCount}</Typography.Headline>
                <Typography.Body variant="small">отмечено</Typography.Body>
              </Flex>
              <Flex direction="column">
                <Typography.Headline variant="medium-strong">{unmarkedTasks.length}</Typography.Headline>
                <Typography.Body variant="small">осталось</Typography.Body>
              </Flex>
            </Flex>
          </Container>
        </Container>
      </Container>

      <Container className="bottom-nav" fullWidth>
        <Button mode="link" appearance="neutral" size="small" onClick={() => shiftDate(-1)}>← День</Button>
        <Button mode="link" size="small">Работы</Button>
        <Button mode="primary" size="small" onClick={() => setSheetMode('close-day')}>Закрыть</Button>
      </Container>

      {sheetMode && (
        <Container
          className="modal-overlay visible"
          fullWidth
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSheet();
          }}
        >
          <Container className="modal-sheet" fullWidth>
            <Flex className="modal-header" align="center" justify="space-between">
              <Typography.Headline variant="small-strong">
                {sheetMode === 'close-day' ? 'Закрытие дня' : activeTask?.name}
              </Typography.Headline>
              <Button mode="secondary" appearance="neutral" size="small" onClick={closeSheet}>×</Button>
            </Flex>

            {activeTask && activeDraft && sheetMode !== 'close-day' && (
              <Flex direction="column" gap={16} className="modal-body">
                <CellList mode="island">
                  <CellSimple
                    height="compact"
                    title={activeTask.name}
                    subtitle={`План: ${activeTask.dayPlan || 0}${activeTask.workUnit ? ` ${activeTask.workUnit}` : ''} · Прогресс: ${Math.round(activeTask.progress || 0)}%`}
                  />
                </CellList>

                <Grid cols={2} gap={8} className="status-selector">
                  <CellAction height="normal" mode={activeDraft.state === 'fact' ? 'primary' : 'custom'} onClick={() => setActiveState('fact')}>В работе</CellAction>
                  <CellAction height="normal" mode={activeDraft.state === 'done' ? 'primary' : 'custom'} onClick={() => setActiveState('done')}>Готово</CellAction>
                  <CellAction height="normal" mode={activeDraft.state === 'not_worked' ? 'primary' : 'custom'} onClick={() => setActiveState('not_worked')}>Не работали</CellAction>
                  <CellAction height="normal" mode={activeDraft.state === 'problem' ? 'primary' : 'custom'} onClick={() => setActiveState('problem')}>Проблема</CellAction>
                </Grid>

                {(activeDraft.state === 'fact' || activeDraft.state === 'done') && (
                  <CellList mode="island" header={<CellHeader titleStyle="normal">Факт</CellHeader>}>
                    <Grid cols={2} gap={8} className="input-mode-grid">
                      <CellAction
                        height="compact"
                        mode={activeDraft.inputMode === 'volume' ? 'primary' : 'custom'}
                        disabled={!activeTask.workVolume || activeTask.workVolume <= 0}
                        onClick={() => updateDraft(activeTask.id, { ...activeDraft, inputMode: 'volume', value: activeTask.dayFact ? String(activeTask.dayFact) : '' })}
                      >
                        Объем
                      </CellAction>
                      <CellAction
                        height="compact"
                        mode={activeDraft.inputMode === 'percent' ? 'primary' : 'custom'}
                        onClick={() => updateDraft(activeTask.id, { ...activeDraft, inputMode: 'percent', value: activeDraft.value || String(Math.round(activeTask.progress || 0)) })}
                      >
                        Процент
                      </CellAction>
                    </Grid>
                    <CellInput
                      height="compact"
                      before={activeDraft.inputMode === 'percent' ? 'Значение, %' : activeTask.workUnit ? `Значение, ${activeTask.workUnit}` : 'Значение'}
                      type="number"
                      min="0"
                      max={activeDraft.inputMode === 'percent' ? 100 : undefined}
                      step={activeDraft.inputMode === 'percent' ? 1 : 0.01}
                      value={activeDraft.value}
                      onChange={(event) => updateDraft(activeTask.id, { ...activeDraft, value: event.target.value })}
                    />
                  </CellList>
                )}

                {(activeDraft.state === 'not_worked' || activeDraft.state === 'problem') && (
                  <CellList mode="island" header={<CellHeader titleStyle="normal">Причина</CellHeader>}>
                    <Flex wrap="wrap" gap={8} className="reason-tags">
                      {reasonTags.map((reason) => (
                        <Button
                          key={reason}
                          mode={activeDraft.reason.includes(reason) ? 'primary' : 'secondary'}
                          appearance={activeDraft.reason.includes(reason) ? 'themed' : 'neutral'}
                          size="small"
                          onClick={() => toggleReason(reason)}
                        >
                          {reason}
                        </Button>
                      ))}
                    </Flex>
                    <Container className="textarea-wrap" fullWidth>
                      <Textarea
                        mode="secondary"
                        rows={3}
                        value={activeDraft.comment}
                        placeholder="Комментарий"
                        onChange={(event) => updateDraft(activeTask.id, { ...activeDraft, comment: event.target.value })}
                      />
                    </Container>
                  </CellList>
                )}

                <Button mode="primary" size="large" stretched onClick={closeSheet}>
                  Сохранить отметку
                </Button>
              </Flex>
            )}

            {sheetMode === 'close-day' && (
              <Flex direction="column" gap={16} className="modal-body">
                <Container className="close-day-summary" fullWidth>
                  <Typography.Headline variant="large-strong">{markedCount} / {writableTasks.length}</Typography.Headline>
                  <Typography.Body variant="small">работ отмечено</Typography.Body>
                </Container>
                <CellList mode="island" header={<CellHeader titleStyle="normal">Неотмеченные работы</CellHeader>}>
                  {unmarkedTasks.length === 0 ? (
                    <CellSimple height="compact" title="Все работы отмечены" />
                  ) : unmarkedTasks.map((task) => (
                    <CellSimple
                      key={task.id}
                      height="normal"
                      title={task.name}
                      subtitle="Что было сегодня?"
                      after={(
                        <Button size="small" mode="secondary" onClick={() => openTaskSheet(task, 'fact')}>Факт</Button>
                      )}
                    />
                  ))}
                </CellList>
                <Button mode="primary" size="large" stretched loading={submitting} disabled={submitting || writableTasks.length === 0} onClick={submit}>
                  Закрыть день
                </Button>
              </Flex>
            )}
          </Container>
        </Container>
      )}
    </Panel>
  );
}
