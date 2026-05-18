import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Button,
  CellHeader,
  CellList,
  CellSimple,
  Container,
  Counter,
  Flex,
  Grid,
  IconButton,
  Input,
  Panel,
  Spinner,
  Switch,
  Textarea,
  ToolButton,
  Typography,
} from '@maxhub/max-ui';
import { Calendar, House } from 'lucide-react';
import { closeFactDay, loadFactSession, resetFactTaskMark, saveFactTaskMark, type FactDayCloseEntry, type FactMarkState, type FactSession, type FactTask } from './api/factApi';
import { readLaunchToken, todayKey } from './session/token';
import { TaskCard } from './components/ui/TaskCard';
import { getPlannedProgressByDate } from './utils/plannedProgress';

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

function isDraftMarked(draft: Draft | undefined): boolean {
  return Boolean(draft && (draft.state === 'not_worked' || draft.state === 'done' || draft.state === 'problem' || (draft.explicitValue && draft.value.trim())));
}

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
const weekdayDateFormatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' });
const weekdayFormatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const TypographyHeadline = Typography.Headline;

function formatRuDate(key: string): string {
  return dateFormatter.format(new Date(`${key}T00:00:00.000Z`));
}

function formatShortRuDate(key: string): string {
  return shortDateFormatter.format(new Date(`${key}T00:00:00.000Z`));
}

function formatWeekdayRu(key: string): string {
  const formatted = weekdayFormatter.format(new Date(`${key}T00:00:00.000Z`));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatWeekdayRuDate(key: string): string {
  const formatted = weekdayDateFormatter.format(new Date(`${key}T00:00:00.000Z`));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatHeaderDate(key: string, preset: DayPreset): string {
  const base = `${formatShortRuDate(key)}, ${formatWeekdayRu(key)}`;
  if (preset === 'today') return `Сегодня, ${base}`;
  if (preset === 'yesterday') return `Вчера, ${base}`;
  if (preset === 'tomorrow') return `Завтра, ${base}`;
  return base;
}

function getDateButtonIcon(dateKey: string, preset: DayPreset) {
  if (preset !== 'custom') {
    return <Calendar size={16} strokeWidth={2} aria-hidden="true" />;
  }
  return <span className="date-tool-icon">{formatWeekdayRuDate(dateKey)}</span>;
}

function createDraft(task: FactTask): Draft {
  const inputMode = task.closeInputMode ?? (task.workVolume && task.workVolume > 0 ? 'volume' : 'percent');
  const value = task.closeValue ?? (inputMode === 'volume' ? task.dayFact : task.progress);
  return {
    state: task.closeState ?? (task.dayFact > 0 ? 'fact' : 'fact'),
    inputMode,
    value: value ? String(value) : '',
    explicitValue: task.closeValue !== null || task.closeState === 'done',
    reason: task.closeReason ?? '',
    comment: task.closeComment ?? '',
    worked: task.closeState !== 'not_worked',
    people: '',
    workTitle: task.name,
  };
}

function getSectionTitle(task: FactTask, tasks: FactTask[]): string | null {
  if (!task.parentId) {
    return 'Без категории';
  }

  const tasksById = new Map(tasks.map((item) => [item.id, item]));
  const ancestors: string[] = [];
  const visitedIds = new Set<string>();
  let parentId: string | null = task.parentId;

  while (parentId && !visitedIds.has(parentId)) {
    visitedIds.add(parentId);
    const parent = tasksById.get(parentId);
    if (!parent) break;
    ancestors.unshift(parent.name);
    parentId = parent.parentId;
  }

  return ancestors.length > 0 ? ancestors.join(' › ') : null;
}

const dayOptions: Array<{ key: Exclude<DayPreset, 'custom'>; label: string }> = [
  { key: 'yesterday', label: 'Вчера' },
  { key: 'today', label: 'Сегодня' },
  { key: 'tomorrow', label: 'Завтра' },
];

function getPresetDateLabel(preset: Exclude<DayPreset, 'custom'>, baseDate: string): string {
  return formatWeekdayRuDate(getPresetDateKey(preset, baseDate));
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

function getRelativeDayLabel(dateKey: string, baseDate: string): string {
  const diffDays = Math.round(
    (new Date(`${dateKey}T00:00:00.000Z`).getTime() - new Date(`${baseDate}T00:00:00.000Z`).getTime()) / 86_400_000,
  );

  if (diffDays === 0) {
    return '0 дней';
  }

  const absDays = Math.abs(diffDays);
  const suffix = absDays % 10 === 1 && absDays % 100 !== 11
    ? 'день'
    : absDays % 10 >= 2 && absDays % 10 <= 4 && (absDays % 100 < 12 || absDays % 100 > 14)
      ? 'дня'
      : 'дней';

  return `${diffDays > 0 ? '+' : '-'}${absDays} ${suffix}`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getProgressRangeStyle(value: string): CSSProperties {
  const percent = clampPercent(Number(value || 0));
  const offset = 17 - percent * 0.34;
  const offsetSign = offset >= 0 ? '+' : '-';

  return {
    '--fact-progress-fill': `calc(${percent}% ${offsetSign} ${Math.abs(offset).toFixed(2)}px)`,
  } as CSSProperties;
}

function triggerLightHaptic(): void {
  void window.WebApp?.HapticFeedback?.impactOccurred?.('light').catch(() => undefined);
}

function triggerMediumHaptic(): void {
  void window.WebApp?.HapticFeedback?.impactOccurred?.('medium').catch(() => undefined);
}

export function App() {
  const [token] = useState(() => readLaunchToken());
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const sheetDragStartRef = useRef<number | null>(null);
  const hasLoadedSessionRef = useRef(false);
  const [baseToday] = useState(() => todayKey());
  const [date, setDate] = useState(() => todayKey());
  const [activeDayPreset, setActiveDayPreset] = useState<DayPreset>('today');
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [session, setSession] = useState<FactSession | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [freeProblems, setFreeProblems] = useState<FreeProblem[]>([]);
  const [freeProblemDraft, setFreeProblemDraft] = useState({ reason: '', comment: '' });
  const [loading, setLoading] = useState(true);
  const [dayRefreshing, setDayRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [sheetClosing, setSheetClosing] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [hideMarkedTasks, setHideMarkedTasks] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Для доступа к проекту нужна специальная ссылка. Запросите её у администратора.');
      return;
    }

    let alive = true;
    const initialLoad = !hasLoadedSessionRef.current;
    if (initialLoad) {
      setLoading(true);
    } else {
      setDayRefreshing(true);
    }
    setError(null);
    loadFactSession({ token, date })
      .then((nextSession) => {
        if (!alive) return;
        hasLoadedSessionRef.current = true;
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
          if (initialLoad) {
            setLoading(false);
          }
          setDayRefreshing(false);
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

  const writableTasks = session?.tasks.filter((task) => task.writable) ?? [];
  const activeTask = activeTaskId ? writableTasks.find((task) => task.id === activeTaskId) ?? null : null;
  const activeDraft = activeTask ? drafts[activeTask.id] ?? createDraft(activeTask) : null;
  const activeTaskHasSavedMark = Boolean(activeTask && (
    activeTask.closeState !== null
    || activeTask.closeValue !== null
    || Boolean(activeTask.closeReason)
    || Boolean(activeTask.closeComment)
  ));
  const markedTasks = writableTasks.filter((task) => isDraftMarked(drafts[task.id]));
  const markedCount = markedTasks.length;
  const problemTasks = writableTasks.filter((task) => drafts[task.id]?.state === 'problem');
  const unmarkedTasks = writableTasks.filter((task) => !isDraftMarked(drafts[task.id]));
  const taskSections = useMemo(() => {
    const sections: Array<{ title: string | null; tasks: FactTask[] }> = [];
    const allTasks = session?.tasks ?? [];

    for (const task of allTasks) {
      if (!task.writable) continue;

      const title = getSectionTitle(task, allTasks);
      const lastSection = sections[sections.length - 1];
      if (lastSection && lastSection.title === title) {
        lastSection.tasks.push(task);
      } else {
        sections.push({ title, tasks: [task] });
      }
    }

    return sections;
  }, [session?.tasks]);
  const visibleTaskSections = useMemo(() => {
    if (!hideMarkedTasks) {
      return taskSections;
    }

    return taskSections
      .map((section) => ({
        ...section,
        tasks: section.tasks.filter((task) => !isDraftMarked(drafts[task.id])),
      }))
      .filter((section) => section.tasks.length > 0);
  }, [drafts, hideMarkedTasks, taskSections]);
  const journalSections = useMemo(() => {
    const sections: Array<{ dateKey: string; title: string; tasks: FactTask[] }> = [];
    const allTasks = session?.tasks ?? [];

    for (const task of allTasks) {
      const draft = drafts[task.id];
      if (!task.writable || !isDraftMarked(draft)) continue;

      const dateKey = task.dayFactUpdatedAt?.slice(0, 10) || date;
      const title = formatRuDate(dateKey);
      const lastSection = sections[sections.length - 1];
      if (lastSection && lastSection.dateKey === dateKey) {
        lastSection.tasks.push(task);
      } else {
        sections.push({ dateKey, title, tasks: [task] });
      }
    }

    return sections;
  }, [date, drafts, session?.tasks]);

  const updateDraft = (taskId: string, nextDraft: Draft) => {
    setDrafts((current) => ({ ...current, [taskId]: nextDraft }));
  };

  const updatePercentDraft = (taskId: string, draft: Draft, nextValue: number | string, withHaptic = false) => {
    const nextPercent = clampPercent(Number(nextValue || 0));
    const currentPercent = clampPercent(Number(draft.value || 0));
    if (withHaptic && nextPercent !== currentPercent) {
      triggerLightHaptic();
    }
    updateDraft(taskId, { ...draft, inputMode: 'percent', value: String(nextPercent), explicitValue: true });
  };

  const openTaskSheet = (task: FactTask, mode: Exclude<SheetMode, 'close-day' | null>) => {
    const draft = drafts[task.id] ?? createDraft(task);
    updateDraft(task.id, {
      ...draft,
      state: mode === 'problem' ? 'problem' : draft.state === 'problem' ? 'fact' : draft.state,
    });
    setSheetClosing(false);
    setActiveTaskId(task.id);
    setSheetMode(mode);
  };

  const openFreeProblem = () => {
    setSheetClosing(false);
    setActiveTaskId(null);
    setFreeProblemDraft({ reason: '', comment: '' });
    setSheetMode('problem');
  };

  const closeSheet = () => {
    if (!sheetMode || sheetClosing) return;
    if (activeTask) {
      updateDraft(activeTask.id, createDraft(activeTask));
    }
    setSheetClosing(true);
    window.setTimeout(() => {
      setSheetMode(null);
      setActiveTaskId(null);
      setSheetClosing(false);
    }, 180);
  };

  const startSheetDrag = (clientY: number) => {
    sheetDragStartRef.current = clientY;
  };

  const finishSheetDrag = (clientY: number) => {
    const startY = sheetDragStartRef.current;
    sheetDragStartRef.current = null;
    if (startY !== null && clientY - startY > 56) {
      closeSheet();
    }
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
      closeSheet();
      setActiveTab('journal');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить закрытие дня.');
    } finally {
      setSubmitting(false);
    }
  };

  const saveActiveTaskMark = async () => {
    if (!token || !activeTask || !activeDraft) return;

    const parsedValue = Number(activeDraft.value.replace(',', '.'));
    setSubmitting(true);
    setError(null);
    try {
      await saveFactTaskMark({
        token,
        taskId: activeTask.id,
        date,
        state: activeDraft.state,
        value: Number.isFinite(parsedValue) ? parsedValue : 0,
        inputMode: activeDraft.inputMode,
        reason: activeDraft.reason,
        comment: activeDraft.comment,
      });
      const refreshed = await loadFactSession({ token, date });
      setSession(refreshed);
      setDrafts(Object.fromEntries(refreshed.tasks.filter((task) => task.writable).map((task) => [task.id, createDraft(task)])));
      closeSheet();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить отметку.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetTaskMark = async (task: FactTask, options: { closeDrawer?: boolean } = {}) => {
    if (!token || submitting) return;

    const previousDrafts = drafts;
    const previousSession = session;
    const resetInputMode = task.workVolume && task.workVolume > 0 ? 'volume' : 'percent';
    const resetValue = resetInputMode === 'volume' ? task.dayFact : task.progress;
    const resetDraft: Draft = {
      ...(drafts[task.id] ?? createDraft(task)),
      state: 'fact',
      inputMode: resetInputMode,
      value: resetValue ? String(resetValue) : '',
      explicitValue: false,
      reason: '',
      comment: '',
      worked: true,
    };

    setDrafts((current) => ({ ...current, [task.id]: resetDraft }));
    setSession((current) => current
      ? {
          ...current,
          tasks: current.tasks.map((item) => item.id === task.id
            ? {
                ...item,
                closeState: null,
                closeInputMode: null,
                closeValue: null,
                closeReason: null,
                closeComment: null,
              }
            : item),
        }
      : current);
    setSubmitting(true);
    setError(null);
    try {
      await resetFactTaskMark({
        token,
        taskId: task.id,
        date,
      });
      if (options.closeDrawer) {
        setSheetMode(null);
        setActiveTaskId(null);
        setSheetClosing(false);
      }
    } catch (err) {
      setDrafts(previousDrafts);
      setSession(previousSession);
      setError(err instanceof Error ? err.message : 'Не удалось сбросить отметку.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetActiveTaskMark = async () => {
    if (!activeTask) return;
    await resetTaskMark(activeTask, { closeDrawer: true });
  };

  const setActiveState = (state: FactMarkState) => {
    if (!activeTask || !activeDraft) return;
    updateDraft(activeTask.id, {
      ...activeDraft,
      state,
      worked: state !== 'not_worked',
      explicitValue: activeDraft.explicitValue || state === 'done',
      value: state === 'done'
        ? activeDraft.inputMode === 'percent' ? '100' : String(activeTask.workVolume ?? activeTask.dayPlan ?? activeDraft.value)
        : state === 'not_worked' ? '0' : activeDraft.value,
    });
  };

  const markTaskAsPlanned = async (task: FactTask) => {
    if (!token || submitting) return;

    const plannedProgress = getPlannedProgressByDate(task, date);
    const plannedState: FactMarkState = plannedProgress >= 100 ? 'done' : 'fact';
    const previousDrafts = drafts;
    const previousSession = session;
    const optimisticDraft: Draft = {
      ...(drafts[task.id] ?? createDraft(task)),
      state: plannedState,
      inputMode: 'percent',
      value: String(plannedProgress),
      explicitValue: true,
      reason: '',
      comment: '',
      worked: true,
    };

    setDrafts((current) => ({ ...current, [task.id]: optimisticDraft }));
    setSession((current) => current
      ? {
          ...current,
          tasks: current.tasks.map((item) => item.id === task.id
            ? {
                ...item,
                closeState: plannedState,
                closeInputMode: 'percent',
                closeValue: plannedProgress,
                closeReason: null,
                closeComment: null,
                dayFactUpdatedAt: new Date().toISOString(),
              }
            : item),
        }
      : current);
    setSubmitting(true);
    setError(null);
    try {
      triggerMediumHaptic();
      await saveFactTaskMark({
        token,
        taskId: task.id,
        date,
        state: plannedState,
        value: plannedProgress,
        inputMode: 'percent',
      });
      const refreshed = await loadFactSession({ token, date });
      setSession(refreshed);
      setDrafts(Object.fromEntries(refreshed.tasks.filter((item) => item.writable).map((item) => [item.id, createDraft(item)])));
    } catch (err) {
      setDrafts(previousDrafts);
      setSession(previousSession);
      setError(err instanceof Error ? err.message : 'Не удалось отметить работу по плану.');
    } finally {
      setSubmitting(false);
    }
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
          <Flex className="brand-lockup" align="center" justify="center" gap={10}>
            <img className="brand-logo" src="/favicon.svg" alt="" aria-hidden="true" />
            <Typography.Title className="brand-title">ГетГант</Typography.Title>
          </Flex>
          <Typography.Headline variant="small-strong">Отметка факта</Typography.Headline>
          <Typography.Body className="access-message" variant="medium">{error}</Typography.Body>
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
              <Flex align="center" gap={8} className="header-title-row">
                <House size={16} strokeWidth={2} aria-hidden="true" />
                <Typography.Label variant="large-strong">{session?.project.name ?? 'Объект'}</Typography.Label>
              </Flex>
            </Flex>
            <Typography.Label variant="small-strong" className="header-date-text">{formatHeaderDate(date, activeDayPreset)}</Typography.Label>
          </Flex>
        </Container>

        <Container className={`content ${dayRefreshing ? 'content--refreshing' : ''}`.trim()} fullWidth>
          {error && <Container className="notice notice--error">{error}</Container>}

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
                  className={`date-picker-button ${activeDayPreset === 'custom' ? '' : 'date-picker-button--icon-only'}`.trim()}
                  icon={getDateButtonIcon(date, activeDayPreset)}
                  aria-label="Выбрать произвольную дату"
                  onClick={() => {
                    if (typeof dateInputRef.current?.showPicker === 'function') {
                      dateInputRef.current.showPicker();
                    } else {
                      dateInputRef.current?.click();
                    }
                  }}
                >
                  {activeDayPreset === 'custom' ? getRelativeDayLabel(date, baseToday) : undefined}
                </ToolButton>
                <input
                  ref={dateInputRef}
                  className="date-picker-input"
                  aria-label="Выбрать произвольную дату"
                  name="custom-date"
                  type="date"
                  value={date}
                  onChange={(event) => {
                    const nextDate = event.target.value;
                    if (!nextDate) {
                      setDate(baseToday);
                      setActiveDayPreset('today');
                      return;
                    }
                    setDate(nextDate);
                    setActiveDayPreset('custom');
                  }}
                />
              </Flex>

              <CellList mode="island" filled>
                <CellSimple
                  as="label"
                  height="normal"
                  title="Скрыть отмеченные"
                  subtitle={`${markedCount} из ${writableTasks.length} работ отмечено`}
                  after={<Switch checked={hideMarkedTasks} onChange={(event) => setHideMarkedTasks(event.target.checked)} />}
                />
              </CellList>

              <Flex direction="column" gap={10}>
                {session?.tasks.length === 0 && (
                  <Container className="state-box state-box--compact">
                    <Typography.Body variant="medium">Нет доступных работ на выбранный день.</Typography.Body>
                  </Container>
                )}
                {session?.tasks.length !== 0 && visibleTaskSections.length === 0 && (
                  <Container className="state-box state-box--compact">
                    <Typography.Body variant="medium">Все работы уже отмечены.</Typography.Body>
                  </Container>
                )}
                {visibleTaskSections.map((section, sectionIndex) => {
                  return (
                    <Fragment key={`${section.title ?? 'root'}-${sectionIndex}`}>
                      {section.title && (
                        <TypographyHeadline variant="small-strong" className="task-section-title" asChild>
                          <h2>{section.title}</h2>
                        </TypographyHeadline>
                      )}
                      <CellList mode="island" filled className="work-list">
                        {section.tasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            draft={drafts[task.id] ?? createDraft(task)}
                            dateKey={date}
                            onOpenFact={(nextTask) => openTaskSheet(nextTask, 'fact')}
                            onSwipePlan={(nextTask) => markTaskAsPlanned(nextTask)}
                            onSwipeReset={(nextTask) => resetTaskMark(nextTask)}
                          />
                        ))}
                      </CellList>
                    </Fragment>
                  );
                })}
              </Flex>
            </>
          )}

          {activeTab === 'object' && (
            <>
              <CellList mode="island" filled>
                <CellSimple
                  height="compact"
                  title={session?.project.name ?? 'Объект'}
                  after={<Counter value={writableTasks.length} appearance="themed" mode="filled" />}
                />
              </CellList>

              <Flex direction="column" gap={10}>
                {taskSections.length === 0 && (
                  <Container className="state-box state-box--compact">
                    <Typography.Body variant="medium">Работы объекта появятся после синхронизации.</Typography.Body>
                  </Container>
                )}
                {taskSections.map((section, sectionIndex) => {
                  return (
                    <Fragment key={`object-${section.title ?? 'root'}-${sectionIndex}`}>
                      {section.title && (
                        <TypographyHeadline variant="small-strong" className="task-section-title" asChild>
                          <h2>{section.title}</h2>
                        </TypographyHeadline>
                      )}
                      <CellList mode="island" filled className="work-list">
                        {section.tasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            draft={drafts[task.id] ?? createDraft(task)}
                            dateKey={date}
                            onOpenFact={(nextTask) => openTaskSheet(nextTask, 'fact')}
                            onSwipePlan={(nextTask) => markTaskAsPlanned(nextTask)}
                            onSwipeReset={(nextTask) => resetTaskMark(nextTask)}
                          />
                        ))}
                      </CellList>
                    </Fragment>
                  );
                })}
              </Flex>
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
              <CellList mode="island" filled>
                <CellSimple
                  height="compact"
                  title="Журнал факта"
                  after={<Counter value={markedCount} appearance="themed" mode="filled" />}
                />
              </CellList>

              <Flex direction="column" gap={10}>
                {journalSections.length === 0 && (
                  <Container className="state-box state-box--compact">
                    <Typography.Body variant="medium">Отправленные факты появятся после отметки работ.</Typography.Body>
                  </Container>
                )}
                {journalSections.map((section, sectionIndex) => {
                  return (
                    <Fragment key={`journal-${section.dateKey}-${sectionIndex}`}>
                      <TypographyHeadline variant="small-strong" className="task-section-title" asChild>
                        <h2>{section.title}</h2>
                      </TypographyHeadline>
                      <CellList mode="island" filled className="work-list">
                        {section.tasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            draft={drafts[task.id] ?? createDraft(task)}
                            dateKey={date}
                            onOpenFact={(nextTask) => openTaskSheet(nextTask, 'fact')}
                            onSwipePlan={(nextTask) => markTaskAsPlanned(nextTask)}
                            onSwipeReset={(nextTask) => resetTaskMark(nextTask)}
                          />
                        ))}
                      </CellList>
                    </Fragment>
                  );
                })}
              </Flex>
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
          className={`modal-overlay ${sheetClosing ? 'modal-overlay--closing' : ''}`}
          fullWidth
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSheet();
          }}
        >
          <Container className={`modal-sheet ${sheetClosing ? 'modal-sheet--closing' : ''}`} fullWidth>
            <button
              className="modal-drag-handle"
              type="button"
              aria-label="Закрыть"
              onClick={closeSheet}
              onMouseDown={(event) => startSheetDrag(event.clientY)}
              onMouseUp={(event) => finishSheetDrag(event.clientY)}
              onTouchStart={(event) => startSheetDrag(event.touches[0]?.clientY ?? 0)}
              onTouchEnd={(event) => finishSheetDrag(event.changedTouches[0]?.clientY ?? 0)}
            />
            <Flex className="modal-header" align="center" justify="space-between">
              <Typography.Headline variant="small-strong">
                {sheetMode === 'close-day' ? 'Закрытие дня' : sheetMode === 'photo' ? 'Фото' : activeTask?.name ?? 'Новая проблема'}
              </Typography.Headline>
              <IconButton mode="link" appearance="neutral" size="small" onClick={closeSheet} aria-label="Закрыть">
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path
                    d="M5.23 5.23a.78.78 0 0 1 1.1 0L10 8.9l3.67-3.67a.78.78 0 1 1 1.1 1.1L11.1 10l3.67 3.67a.78.78 0 1 1-1.1 1.1L10 11.1l-3.67 3.67a.78.78 0 1 1-1.1-1.1L8.9 10 5.23 6.33a.78.78 0 0 1 0-1.1Z"
                    fill="currentColor"
                  />
                </svg>
              </IconButton>
            </Flex>

            {activeTask && activeDraft && sheetMode !== 'close-day' && (
              <Flex direction="column" gap={16} className="modal-body">
                {sheetMode !== 'photo' && (
                  <>
                    {activeDraft.state !== 'not_worked' && (
                      <CellList mode="island" header={<CellHeader titleStyle="normal">Объем</CellHeader>}>
                        <Container className="fact-progress-control" fullWidth>
                          <Flex align="center" gap={8} className="fact-progress-row">
                            <Button
                              mode="secondary"
                              appearance="neutral"
                              size="medium"
                              onClick={() => updatePercentDraft(activeTask.id, activeDraft, Number(activeDraft.value || 0) - 5, true)}
                              aria-label="Уменьшить процент выполнения"
                            >
                              -
                            </Button>
                            <Input
                              mode="secondary"
                              className="fact-progress-input"
                              innerClassNames={{
                                body: 'fact-progress-input-body',
                                input: 'fact-progress-input-control',
                                clearButton: 'fact-progress-clear',
                              }}
                              placeholder="0"
                              name="fact-value"
                              aria-label="Значение факта в процентах"
                              autoComplete="off"
                              inputMode="decimal"
                              type="number"
                              withClearButton
                              min="0"
                              max={100}
                              step={1}
                              value={activeDraft.value}
                              onChange={(event) => updateDraft(activeTask.id, { ...activeDraft, inputMode: 'percent', value: event.target.value, explicitValue: true })}
                            />
                            <Typography.Label variant="large-strong" className="fact-progress-sign">%</Typography.Label>
                            <Button
                              mode="secondary"
                              appearance="neutral"
                              size="medium"
                              onClick={() => updatePercentDraft(activeTask.id, activeDraft, Number(activeDraft.value || 0) + 5, true)}
                              aria-label="Увеличить процент выполнения"
                            >
                              +
                            </Button>
                          </Flex>
                          <input
                            className="fact-progress-range"
                            aria-label="Процент выполнения работы"
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={clampPercent(Number(activeDraft.value || 0))}
                            onChange={(event) => updatePercentDraft(activeTask.id, activeDraft, event.target.value, true)}
                            style={getProgressRangeStyle(activeDraft.value)}
                          />
                          <Flex justify="space-between" className="fact-progress-marks">
                            {[0, 25, 50, 75, 100].map((value) => (
                              <button
                                key={value}
                                className="fact-progress-mark"
                                type="button"
                                onClick={() => updatePercentDraft(activeTask.id, activeDraft, value, true)}
                              >
                                {value === 0 ? '0%' : value}
                              </button>
                            ))}
                          </Flex>
                        </Container>
                      </CellList>
                    )}

                    <CellList mode="island" filled>
                      <CellSimple
                        as="label"
                        height="normal"
                        title="Работы не велись"
                        after={(
                          <Switch
                            checked={activeDraft.state === 'not_worked'}
                            onChange={(event) => setActiveState(event.target.checked ? 'not_worked' : 'fact')}
                          />
                        )}
                      />

                      {activeDraft.state !== 'not_worked' && (
                        <CellSimple
                          as="label"
                          height="normal"
                          title="Есть проблема"
                          after={(
                            <Switch
                              checked={activeDraft.state === 'problem'}
                              onChange={(event) => setActiveState(event.target.checked ? 'problem' : 'fact')}
                            />
                          )}
                        />
                      )}
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

                    {activeDraft.state === 'not_worked' && (
                      <CellList mode="island" header={<CellHeader titleStyle="normal">Комментарий</CellHeader>}>
                        <Container className="textarea-wrap" fullWidth>
                          <Textarea
                            mode="secondary"
                            rows={4}
                            value={activeDraft.comment}
                            placeholder="Комментарий"
                            aria-label="Комментарий к невыполненной работе"
                            name="not-worked-comment"
                            autoComplete="off"
                            onChange={(event) => updateDraft(activeTask.id, { ...activeDraft, comment: event.target.value })}
                          />
                        </Container>
                      </CellList>
                    )}
                  </>
                )}

                <Container className="modal-actions">
                  <Flex align="center" gap={8} className="modal-actions-row">
                    {activeTaskHasSavedMark && (
                      <Button className="modal-reset-button" mode="secondary" appearance="neutral" size="large" loading={submitting} disabled={submitting} onClick={resetActiveTaskMark}>
                        Сбросить
                      </Button>
                    )}
                    <Button mode="primary" size="large" stretched loading={submitting} disabled={submitting} onClick={saveActiveTaskMark}>
                    Сохранить отметку
                    </Button>
                  </Flex>
                </Container>
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
                <Container className="modal-actions">
                  <Button mode="primary" size="large" stretched onClick={submitFreeProblem}>
                    Отправить проблему
                  </Button>
                </Container>
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
                <Container className="modal-actions">
                  <Button mode="primary" size="large" stretched loading={submitting} disabled={submitting || writableTasks.length === 0} onClick={submit}>
                    Закрыть день
                  </Button>
                </Container>
              </Flex>
            )}
          </Container>
        </Container>
      )}
    </Panel>
  );
}
