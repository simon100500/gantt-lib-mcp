import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  CellAction,
  CellHeader,
  CellInput,
  CellList,
  CellSimple,
  Container,
  Counter,
  Flex,
  Grid,
  IconButton,
  Panel,
  Spinner,
  Switch,
  Textarea,
  ToolButton,
  Typography,
} from '@maxhub/max-ui';
import { closeFactDay, loadFactSession, type FactDayCloseEntry, type FactMarkState, type FactSession, type FactTask } from './api/factApi';
import { readLaunchToken, todayKey } from './session/token';
import { TaskCard } from './components/ui/TaskCard';

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

type FreeProblem = {
  id: string;
  reason: string;
  comment: string;
  status: 'open' | 'waiting' | 'resolved';
};

type SheetMode = 'fact' | 'problem' | 'photo' | 'close-day' | null;
type Tab = 'today' | 'object' | 'problems' | 'journal';
type DayPreset = 'yesterday' | 'today' | 'tomorrow' | 'custom';

const reasonTags = ['Нет материала', 'Нет людей', 'Не готов фронт', 'Ждем смежников', 'Изменение проекта', 'Погода', 'Техника', 'Другое'];
const navItems: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Сегодня' },
  { id: 'object', label: 'Объект' },
  { id: 'problems', label: 'Проблемы' },
  { id: 'journal', label: 'Журнал' },
];

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });
const TypographyHeadline = Typography.Headline;

function formatAmount(value: number, unit: string | null): string {
  const formatted = value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatRuDate(key: string): string {
  return dateFormatter.format(new Date(`${key}T00:00:00.000Z`));
}

function formatShortRuDate(key: string): string {
  return shortDateFormatter.format(new Date(`${key}T00:00:00.000Z`));
}

function createDraft(task: FactTask): Draft {
  const inputMode = task.closeInputMode ?? (task.workVolume && task.workVolume > 0 ? 'volume' : 'percent');
  const value = task.closeValue ?? (inputMode === 'volume' ? task.dayFact : task.progress);
  return {
    state: task.closeState ?? (task.dayFact > 0 ? 'fact' : 'fact'),
    inputMode,
    value: value ? String(value) : '',
    reason: task.closeReason ?? '',
    comment: task.closeComment ?? '',
    worked: task.closeState !== 'not_worked',
    people: '',
    workTitle: task.name,
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

function getSectionTitle(task: FactTask, tasks: FactTask[]): string | null {
  if (!task.parentId) {
    return null;
  }
  return tasks.find((item) => item.id === task.parentId)?.name ?? null;
}

const dayOptions: Array<{ key: Exclude<DayPreset, 'custom'>; label: string }> = [
  { key: 'yesterday', label: 'Вчера' },
  { key: 'today', label: 'Сегодня' },
  { key: 'tomorrow', label: 'Завтра' },
];

function getPresetDateLabel(preset: Exclude<DayPreset, 'custom'>, baseDate: string): string {
  return formatShortRuDate(getPresetDateKey(preset, baseDate));
}

function getPresetDateKey(preset: Exclude<DayPreset, 'custom'>, baseDate: string): string {
  const offsetByPreset: Record<Exclude<DayPreset, 'custom'>, number> = {
    yesterday: -1,
    today: 0,
    tomorrow: 1,
  };
  const itemDate = new Date(`${baseDate}T00:00:00.000Z`);
  itemDate.setUTCDate(itemDate.getUTCDate() + offsetByPreset[preset]);
  return itemDate.toISOString().slice(0, 10);
}

export function App() {
  const [token] = useState(() => readLaunchToken());
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [baseToday] = useState(() => todayKey());
  const [date, setDate] = useState(() => todayKey());
  const [activeDayPreset, setActiveDayPreset] = useState<DayPreset>('today');
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [session, setSession] = useState<FactSession | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [freeProblems, setFreeProblems] = useState<FreeProblem[]>([]);
  const [freeProblemDraft, setFreeProblemDraft] = useState({ reason: '', comment: '' });
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
        if (!alive) return;
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
  const problemTasks = writableTasks.filter((task) => drafts[task.id]?.state === 'problem');
  const unmarkedTasks = writableTasks.filter((task) => {
    const draft = drafts[task.id];
    return !draft || !(draft.state === 'not_worked' || draft.state === 'done' || draft.state === 'problem' || draft.value.trim());
  });

  const updateDraft = (taskId: string, nextDraft: Draft) => {
    setSaved(false);
    setDrafts((current) => ({ ...current, [taskId]: nextDraft }));
  };

  const openTaskSheet = (task: FactTask, mode: Exclude<SheetMode, 'close-day' | null>) => {
    const draft = drafts[task.id] ?? createDraft(task);
    updateDraft(task.id, {
      ...draft,
      state: mode === 'problem' ? 'problem' : draft.state === 'problem' ? 'fact' : draft.state,
    });
    setActiveTaskId(task.id);
    setSheetMode(mode);
  };

  const openFreeProblem = () => {
    setActiveTaskId(null);
    setFreeProblemDraft({ reason: '', comment: '' });
    setSheetMode('problem');
  };

  const closeSheet = () => {
    setSheetMode(null);
    setActiveTaskId(null);
  };

  const submit = async () => {
    if (!token || !session) return;

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
      setActiveTab('journal');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить закрытие дня.');
    } finally {
      setSubmitting(false);
    }
  };

  const setActiveState = (state: FactMarkState) => {
    if (!activeTask || !activeDraft) return;
    updateDraft(activeTask.id, {
      ...activeDraft,
      state,
      worked: state !== 'not_worked',
      value: state === 'done'
        ? activeDraft.inputMode === 'percent' ? '100' : String(activeTask.workVolume ?? activeTask.dayPlan ?? activeDraft.value)
        : state === 'not_worked' ? '0' : activeDraft.value,
    });
  };

  const toggleReason = (reason: string) => {
    if (activeTask && activeDraft) {
      const parts = activeDraft.reason.split(',').map((part) => part.trim()).filter(Boolean);
      const nextParts = parts.includes(reason) ? parts.filter((part) => part !== reason) : [...parts, reason];
      updateDraft(activeTask.id, { ...activeDraft, reason: nextParts.join(', ') });
      return;
    }

    const parts = freeProblemDraft.reason.split(',').map((part) => part.trim()).filter(Boolean);
    const nextParts = parts.includes(reason) ? parts.filter((part) => part !== reason) : [...parts, reason];
    setFreeProblemDraft((current) => ({ ...current, reason: nextParts.join(', ') }));
  };

  const markNotWorked = (task: FactTask) => {
    const draft = drafts[task.id] ?? createDraft(task);
    updateDraft(task.id, { ...draft, state: 'not_worked', worked: false, value: '0' });
  };

  const submitFreeProblem = () => {
    setFreeProblems((current) => [
      {
        id: `${Date.now()}`,
        reason: freeProblemDraft.reason || 'Другое',
        comment: freeProblemDraft.comment || 'Описание будет добавлено позже',
        status: 'open',
      },
      ...current,
    ]);
    closeSheet();
    setActiveTab('problems');
  };

  if (loading) {
    return (
      <Panel mode="secondary" className="app-shell">
        <Container className="state-box">
          <Spinner />
          <Typography.Body variant="medium">Загружаем работы…</Typography.Body>
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
            <Flex direction="column" className="header-title">
              <Typography.Label variant="large-strong">Fact</Typography.Label>
              <Typography.Body variant="small" className="muted-text">{session?.project.name ?? 'Объект'}</Typography.Body>
            </Flex>
            <Typography.Label variant="small-strong" className="date-pill">{formatRuDate(date)}</Typography.Label>
          </Flex>
        </Container>

        <Container className="content" fullWidth>
          {error && <Container className="notice notice--error">{error}</Container>}
          {saved && <Container className="notice">День сохранен.</Container>}

          {activeTab === 'today' && (
            <>
              <Flex className="day-switcher" gap={8}>
                {dayOptions.map((item) => (
                  <ToolButton
                    key={item.key}
                    appearance={activeDayPreset === item.key ? 'default' : 'secondary'}
                    icon={<span className="date-tool-icon">{getPresetDateLabel(item.key, baseToday)}</span>}
                    onClick={() => {
                      setActiveDayPreset(item.key);
                      setDate(getPresetDateKey(item.key, baseToday));
                    }}
                  >
                    {item.label}
                  </ToolButton>
                ))}
                <ToolButton
                  appearance={activeDayPreset === 'custom' ? 'default' : 'secondary'}
                  className="date-picker-button"
                  icon={<span className="date-tool-icon">{formatShortRuDate(date)}</span>}
                  onClick={() => {
                    if (typeof dateInputRef.current?.showPicker === 'function') {
                      dateInputRef.current.showPicker();
                    } else {
                      dateInputRef.current?.click();
                    }
                  }}
                >
                  Дата
                </ToolButton>
                <input
                  ref={dateInputRef}
                  className="date-picker-input"
                  aria-label="Выбрать произвольную дату"
                  name="custom-date"
                  type="date"
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setActiveDayPreset('custom');
                  }}
                />
              </Flex>

              <CellList mode="island" filled>
                <CellSimple
                  height="compact"
                  title="Работы на сегодня"
                  after={<Counter value={writableTasks.length} rounded appearance="neutral" />}
                />
              </CellList>

              <Flex direction="column" gap={10}>
                {session?.tasks.length === 0 && (
                  <Container className="state-box state-box--compact">
                    <Typography.Body variant="medium">Нет доступных работ на выбранный день.</Typography.Body>
                  </Container>
                )}
                {session?.tasks.map((task, index, allTasks) => {
                  if (!task.writable) {
                    return null;
                  }
                  const sectionTitle = getSectionTitle(task, allTasks);
                  const previousWritableTask = allTasks.slice(0, index).reverse().find((item) => item.writable);
                  const previousSectionTitle = previousWritableTask ? getSectionTitle(previousWritableTask, allTasks) : null;

                  return (
                    <Fragment key={task.id}>
                      {sectionTitle && sectionTitle !== previousSectionTitle && (
                        <TypographyHeadline variant="small-strong" className="task-section-title" asChild>
                          <h2>{sectionTitle}</h2>
                        </TypographyHeadline>
                      )}
                      <TaskCard
                        task={task}
                        draft={drafts[task.id] ?? createDraft(task)}
                        onOpenFact={(nextTask) => openTaskSheet(nextTask, 'fact')}
                        onOpenProblem={(nextTask) => openTaskSheet(nextTask, 'problem')}
                        onOpenPhoto={(nextTask) => openTaskSheet(nextTask, 'photo')}
                        onMarkNotWorked={markNotWorked}
                      />
                    </Fragment>
                  );
                })}
              </Flex>
            </>
          )}

          {activeTab === 'object' && (
            <>
              <Container className="section-header" fullWidth>
                <Typography.Label variant="small-caps">Структура объекта</Typography.Label>
                <Counter value={writableTasks.length} rounded appearance="neutral" />
              </Container>
              <CellList mode="island" header={<CellHeader titleStyle="normal">{session?.project.name ?? 'Объект'}</CellHeader>}>
                {session?.tasks.map((task) => {
                  const depth = depthById.get(task.id) ?? 0;
                  return (
                    <CellSimple
                      key={task.id}
                      height="normal"
                      title={task.name}
                      subtitle={task.writable ? `План: ${formatAmount(task.dayPlan, task.workUnit)}` : 'Раздел работ'}
                      after={<Counter value={task.writable ? 1 : writableTasks.filter((item) => item.parentId === task.id).length} rounded appearance="neutral" />}
                      className="tree-cell"
                      style={{ paddingLeft: depth * 12 }}
                    />
                  );
                })}
              </CellList>
              <CellList mode="island" header={<CellHeader titleStyle="normal">Завтра по плану</CellHeader>}>
                {(writableTasks.slice(0, 3).length ? writableTasks.slice(0, 3) : []).map((task) => (
                  <CellSimple key={task.id} height="compact" title={task.name} subtitle="Работа по плану" />
                ))}
                {writableTasks.length === 0 && <CellSimple height="compact" title="План на завтра появится после синхронизации" />}
              </CellList>
            </>
          )}

          {activeTab === 'problems' && (
            <>
              <Flex className="section-header" align="center" justify="space-between">
                <Typography.Label variant="small-caps">Проблемы</Typography.Label>
                <Button mode="secondary" size="small" onClick={openFreeProblem}>Создать</Button>
              </Flex>
              <CellList mode="island" header={<CellHeader titleStyle="normal">Открытые</CellHeader>}>
                {problemTasks.map((task) => {
                  const draft = drafts[task.id] ?? createDraft(task);
                  return (
                    <CellSimple
                      key={task.id}
                      height="normal"
                      title={task.name}
                      subtitle={draft.reason || 'Причина не выбрана'}
                      after={<Button mode="secondary" appearance="neutral" size="small" onClick={() => openTaskSheet(task, 'problem')}>Открыть</Button>}
                    />
                  );
                })}
                {freeProblems.map((problem) => (
                  <CellSimple
                    key={problem.id}
                    height="normal"
                    title={problem.reason}
                    subtitle={problem.comment}
                    after={<Typography.Label variant="small-strong" className="text-pill">{problem.status === 'resolved' ? 'решено' : 'открыта'}</Typography.Label>}
                  />
                ))}
                {problemTasks.length === 0 && freeProblems.length === 0 && (
                  <CellSimple height="normal" title="Открытых проблем нет" subtitle="Можно создать проблему без привязки к работе." />
                )}
              </CellList>
            </>
          )}

          {activeTab === 'journal' && (
            <>
              <Container className="section-header" fullWidth>
                <Typography.Label variant="small-caps">Журнал факта</Typography.Label>
                <Counter value={markedCount} rounded appearance="neutral" />
              </Container>
              <CellList mode="island" header={<CellHeader titleStyle="normal">{formatRuDate(date)}</CellHeader>}>
                {writableTasks.filter((task) => drafts[task.id]?.value || drafts[task.id]?.state !== 'fact').map((task) => {
                  const draft = drafts[task.id] ?? createDraft(task);
                  return (
                    <CellSimple
                      key={task.id}
                      height="normal"
                      title={task.name}
                      subtitle={`${draft.inputMode === 'percent' ? `${draft.value || 0}%` : `${draft.value || 0}${task.workUnit ? ` ${task.workUnit}` : ''}`} · ${draft.workTitle} · Отправлено`}
                      after={<Typography.Label variant="small-strong" className={draft.state === 'problem' ? 'text-pill text-pill--negative' : 'text-pill'}>{draft.state === 'problem' ? 'проблема' : 'факт'}</Typography.Label>}
                    />
                  );
                })}
                {markedCount === 0 && <CellSimple height="normal" title="Записей пока нет" subtitle="Отправленные факты появятся после отметки работ." />}
              </CellList>
            </>
          )}
        </Container>
      </Container>

      <Container className="bottom-nav" fullWidth>
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-button ${activeTab === item.id ? 'nav-button--active' : ''}`}
            type="button"
            onClick={() => setActiveTab(item.id)}
          >
            <span>{item.label}</span>
            {item.id === 'problems' && problemTasks.length + freeProblems.length > 0 && <Counter value={problemTasks.length + freeProblems.length} rounded appearance="negative" />}
          </button>
        ))}
      </Container>

      {sheetMode && (
        <Container
          className="modal-overlay"
          fullWidth
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSheet();
          }}
        >
          <Container className="modal-sheet" fullWidth>
            <Flex className="modal-header" align="center" justify="space-between">
              <Typography.Headline variant="small-strong">
                {sheetMode === 'close-day' ? 'Закрытие дня' : sheetMode === 'photo' ? 'Фото' : activeTask?.name ?? 'Новая проблема'}
              </Typography.Headline>
              <IconButton mode="secondary" appearance="neutral" size="small" onClick={closeSheet} aria-label="Закрыть">x</IconButton>
            </Flex>

            {activeTask && activeDraft && sheetMode !== 'close-day' && (
              <Flex direction="column" gap={16} className="modal-body">
                <CellList mode="island">
                  <CellSimple
                    height="compact"
                    title={activeTask.name}
                    subtitle={`План ${formatAmount(activeTask.dayPlan, activeTask.workUnit)}`}
                  />
                </CellList>

                {sheetMode !== 'photo' && (
                  <>
                    <Grid cols={2} gap={8} className="status-selector">
                      <CellAction height="normal" mode={activeDraft.state === 'fact' ? 'primary' : 'custom'} onClick={() => setActiveState('fact')}>Выполнялась</CellAction>
                      <CellAction height="normal" mode={activeDraft.state === 'done' ? 'primary' : 'custom'} onClick={() => setActiveState('done')}>Завершена</CellAction>
                      <CellAction height="normal" mode={activeDraft.state === 'not_worked' ? 'primary' : 'custom'} onClick={() => setActiveState('not_worked')}>Не выполнялась</CellAction>
                      <CellAction height="normal" mode={activeDraft.state === 'problem' ? 'primary' : 'custom'} onClick={() => setActiveState('problem')}>Есть проблема</CellAction>
                    </Grid>

                    {(activeDraft.state === 'fact' || activeDraft.state === 'done') && (
                      <CellList mode="island" header={<CellHeader titleStyle="normal">Объем</CellHeader>}>
                        <Grid cols={2} gap={8} className="input-mode-grid">
                          <CellAction
                            height="compact"
                            mode={activeDraft.inputMode === 'volume' ? 'primary' : 'custom'}
                            disabled={!activeTask.workVolume || activeTask.workVolume <= 0}
                            onClick={() => updateDraft(activeTask.id, { ...activeDraft, inputMode: 'volume', value: activeTask.dayFact ? String(activeTask.dayFact) : '' })}
                          >
                            Сделано сегодня
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
                          name="fact-value"
                          aria-label={activeDraft.inputMode === 'percent' ? 'Значение факта в процентах' : 'Значение факта за день'}
                          autoComplete="off"
                          inputMode="decimal"
                          type="number"
                          min="0"
                          max={activeDraft.inputMode === 'percent' ? 100 : undefined}
                          step={activeDraft.inputMode === 'percent' ? 1 : 0.01}
                          value={activeDraft.value}
                          onChange={(event) => updateDraft(activeTask.id, { ...activeDraft, value: event.target.value })}
                        />
                        <Flex wrap="wrap" gap={8} className="quick-progress">
                          {[0, 25, 50, 75, 100].map((value) => (
                            <Button
                              key={value}
                              mode={activeDraft.inputMode === 'percent' && activeDraft.value === String(value) ? 'primary' : 'secondary'}
                              appearance="neutral"
                              size="small"
                              onClick={() => updateDraft(activeTask.id, { ...activeDraft, inputMode: 'percent', value: String(value) })}
                            >
                              {value}%
                            </Button>
                          ))}
                        </Flex>
                        <CellSimple
                          height="compact"
                          title="Всего выполнено"
                          subtitle={`${formatAmount(activeTask.completedVolume, activeTask.workUnit)} · ${Math.round(activeTask.progress || 0)}%`}
                        />
                      </CellList>
                    )}

                    <CellList mode="island" header={<CellHeader titleStyle="normal">Ресурсы</CellHeader>}>
                      <CellSimple
                        height="normal"
                        title={activeDraft.worked ? 'Работали' : 'Не работали'}
                        subtitle={activeDraft.workTitle}
                        after={<Switch checked={activeDraft.worked} onChange={(event) => updateDraft(activeTask.id, { ...activeDraft, worked: event.target.checked, state: event.target.checked ? 'fact' : 'not_worked', value: event.target.checked ? activeDraft.value : '0' })} />}
                      />
                      <CellInput
                        height="compact"
                        before="Кол-во человек"
                        name="fact-people"
                        aria-label="Количество человек"
                        autoComplete="off"
                        inputMode="numeric"
                        type="number"
                        min="0"
                        value={activeDraft.people}
                        placeholder="0"
                        onChange={(event) => updateDraft(activeTask.id, { ...activeDraft, people: event.target.value })}
                      />
                      <CellSimple height="compact" title="Работа" subtitle={activeDraft.workTitle} />
                    </CellList>

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
                      </CellList>
                    )}
                  </>
                )}

                <CellList mode="island" header={<CellHeader titleStyle="normal">Фото и комментарий</CellHeader>}>
                  <CellSimple height="normal" title="Фото" subtitle="Загрузка будет привязана к задаче, дате и объекту" after={<Button mode="secondary" size="small">Добавить</Button>} />
                  <Container className="textarea-wrap" fullWidth>
                    <Textarea
                      mode="secondary"
                      rows={3}
                      value={activeDraft.comment}
                      placeholder="Комментарий"
                      aria-label="Комментарий к факту"
                      name="fact-comment"
                      autoComplete="off"
                      onChange={(event) => updateDraft(activeTask.id, { ...activeDraft, comment: event.target.value })}
                    />
                  </Container>
                </CellList>

                <Button mode="primary" size="large" stretched onClick={closeSheet}>
                  Сохранить отметку
                </Button>
              </Flex>
            )}

            {!activeTask && sheetMode === 'problem' && (
              <Flex direction="column" gap={16} className="modal-body">
                <CellList mode="island" header={<CellHeader titleStyle="normal">Проблема без привязки</CellHeader>}>
                  <Flex wrap="wrap" gap={8} className="reason-tags">
                    {reasonTags.map((reason) => (
                      <Button
                        key={reason}
                        mode={freeProblemDraft.reason.includes(reason) ? 'primary' : 'secondary'}
                        appearance={freeProblemDraft.reason.includes(reason) ? 'themed' : 'neutral'}
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
                      rows={4}
                      value={freeProblemDraft.comment}
                      placeholder="Описание…"
                      aria-label="Описание проблемы"
                      name="problem-description"
                      autoComplete="off"
                      onChange={(event) => setFreeProblemDraft((current) => ({ ...current, comment: event.target.value }))}
                    />
                  </Container>
                </CellList>
                <Button mode="primary" size="large" stretched onClick={submitFreeProblem}>
                  Отправить проблему
                </Button>
              </Flex>
            )}

            {sheetMode === 'close-day' && (
              <Flex direction="column" gap={16} className="modal-body">
                <CellList mode="island">
                  <CellSimple
                    height="normal"
                    title={`${markedCount} / ${writableTasks.length} работ отмечено`}
                    subtitle={`${unmarkedTasks.length} требуют реакции перед закрытием`}
                  />
                </CellList>
                <CellList mode="island" header={<CellHeader titleStyle="normal">Неотмеченные работы</CellHeader>}>
                  {unmarkedTasks.length === 0 ? (
                    <CellSimple height="compact" title="Все работы отмечены" />
                  ) : unmarkedTasks.map((task) => (
                    <CellSimple
                      key={task.id}
                      height="normal"
                      title={task.name}
                      subtitle="Что было сегодня?"
                    >
                      <Grid cols={2} gap={8} className="close-actions">
                        <Button size="small" mode="secondary" onClick={() => openTaskSheet(task, 'fact')}>Внести факт</Button>
                        <Button size="small" mode="secondary" appearance="neutral" onClick={() => markNotWorked(task)}>Не работали</Button>
                        <Button size="small" mode="secondary" appearance="neutral" onClick={() => {
                          const draft = drafts[task.id] ?? createDraft(task);
                          updateDraft(task.id, { ...draft, state: 'problem', reason: 'Перенос', comment: 'Нужна корректировка сроков' });
                        }}>
                          Перенести
                        </Button>
                        <Button size="small" mode="link" appearance="neutral" onClick={() => markNotWorked(task)}>Пропустить</Button>
                      </Grid>
                    </CellSimple>
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
