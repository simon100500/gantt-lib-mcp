import { useState, useCallback, useRef, useEffect } from 'react';
import { CalendarDays, Trash2, PanelLeft } from 'lucide-react';
import { GanttChart, type GanttChartRef } from './components/GanttChart.tsx';
import { ChatSidebar, type ChatMessage } from './components/ChatSidebar.tsx';
import { useTasks } from './hooks/useTasks.ts';
import { useWebSocket, type ServerMessage } from './hooks/useWebSocket.ts';
import { useAuth } from './hooks/useAuth.ts';
import { OtpModal } from './components/OtpModal.tsx';
import { ProjectSwitcher } from './components/ProjectSwitcher.tsx';
import { Button } from './components/ui/button.tsx';
import { cn } from '@/lib/utils';
import type { Task, ValidationResult, DependencyError } from './types.ts';

let msgCounter = 0;

// ── Reusable toolbar toggle ────────────────────────────────────────────────
interface ToolbarToggleProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  activeClass?: string;
  'aria-label'?: string;
}

function ToolbarToggle({
  active,
  onClick,
  children,
  activeClass = 'bg-primary text-primary-foreground border-primary',
  'aria-label': ariaLabel,
}: ToolbarToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        'h-7 px-2.5 text-xs rounded border font-medium transition-colors select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        active
          ? activeClass
          : 'bg-transparent text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-800',
      )}
    >
      {children}
    </button>
  );
}

// ── Toolbar separator ──────────────────────────────────────────────────────
function ToolbarSep() {
  return <span className="w-px h-4 bg-slate-200 shrink-0" />;
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const auth = useAuth();
  const { tasks, setTasks, loading, error } = useTasks(auth.accessToken, auth.refreshAccessToken);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [aiThinking, setAiThinking] = useState(false);

  // Gantt feature toggles
  const [validationErrors, setValidationErrors] = useState<DependencyError[]>([]);
  const [enableAutoSchedule, setEnableAutoSchedule] = useState(false);
  const [disableTaskNameEditing, setDisableTaskNameEditing] = useState(false);
  const [disableDependencyEditing, setDisableDependencyEditing] = useState(false);
  const [highlightExpiredTasks, setHighlightExpiredTasks] = useState(true);
  const [showTaskList, setShowTaskList] = useState(true);

  const ganttRef = useRef<GanttChartRef>(null);

  // ── WebSocket message handler ────────────────────────────────────────────
  const handleWsMessage = useCallback((msg: ServerMessage) => {
    if (msg.type === 'tasks') {
      setTasks(msg.tasks as Task[]);
    } else if (msg.type === 'token') {
      setStreaming(prev => prev + (msg.content ?? ''));
    } else if (msg.type === 'done') {
      setAiThinking(false);
      setStreaming(prev => {
        if (prev) {
          setMessages(ms => [...ms, { id: String(++msgCounter), role: 'assistant', content: prev }]);
        }
        return '';
      });
    } else if (msg.type === 'error') {
      setAiThinking(false);
      setStreaming('');
      setMessages(ms => [
        ...ms,
        { id: String(++msgCounter), role: 'assistant', content: `Error: ${msg.message ?? 'unknown error'}` },
      ]);
    }
  }, [setTasks]);

  const { send, connected } = useWebSocket(handleWsMessage, () => auth.accessToken, auth.accessToken);

  const handleSend = useCallback((text: string) => {
    setMessages(ms => [...ms, { id: String(++msgCounter), role: 'user', content: text }]);
    setAiThinking(true);
    send({ type: 'chat', message: text });
  }, [send]);

  const handleAuthSuccess = useCallback((result: {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string };
    project: { id: string; name: string };
  }) => {
    auth.login(result, result.user, result.project);
  }, [auth]);

  const handleValidation = useCallback((result: ValidationResult) => {
    setValidationErrors(result.isValid ? [] : result.errors);
  }, []);

  const handleCascade = useCallback((shiftedTasks: Task[]) => {
    setTasks(prev => {
      const map = new Map(shiftedTasks.map(t => [t.id, t]));
      return prev.map(t => map.get(t.id) ?? t);
    });
  }, [setTasks]);

  // Clear tasks when project changes
  useEffect(() => {
    setTasks([]);
  }, [auth.project?.id, setTasks]);

  // Load chat history on auth/project change
  useEffect(() => {
    if (!auth.isAuthenticated || !auth.accessToken || !auth.project?.id) return;
    setMessages([]);
    setStreaming('');
    setAiThinking(false);

    fetch('/api/messages', {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    })
      .then(res => (res.ok ? (res.json() as Promise<Array<{ role: string; content: string }>>) : Promise.resolve([])))
      .then(data => {
        setMessages(
          data.map(m => ({ id: String(++msgCounter), role: m.role as 'user' | 'assistant', content: m.content })),
        );
      })
      .catch(() => {});
  }, [auth.isAuthenticated, auth.accessToken, auth.project?.id]);

  const handleScrollToToday = useCallback(() => ganttRef.current?.scrollToToday(), []);

  const handleClearDatabase = useCallback(async () => {
    if (!confirm('Clear all tasks? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.accessToken ?? ''}` },
      });
      if (!res.ok) throw new Error('Failed to clear');
      setTasks([]);
    } catch (err) {
      alert(`Error: ${err}`);
    }
  }, [auth.accessToken, setTasks]);

  // ── Error state ──────────────────────────────────────────────────────────
  if (error && auth.isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 max-w-sm text-center">
          Failed to load tasks: {error}
        </div>
      </div>
    );
  }

  // ── Layout ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {!auth.isAuthenticated && <OtpModal onSuccess={handleAuthSuccess} />}

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 h-12 px-4 bg-white border-b border-slate-200 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight select-none">
          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
          <span className="text-slate-900">GanttAI</span>
        </div>

        <span className="w-px h-4 bg-slate-200" />

        {/* Project switcher */}
        {auth.isAuthenticated && auth.project && (
          <ProjectSwitcher
            currentProject={auth.project}
            projects={auth.projects}
            onSwitch={auth.switchProject}
            onCreateNew={auth.createProject}
          />
        )}

        <div className="flex-1" />

        {auth.isAuthenticated && (
          <Button
            variant="ghost"
            size="sm"
            onClick={auth.logout}
            className="text-slate-500 hover:text-slate-900 text-xs h-7"
          >
            Выйти
          </Button>
        )}
      </header>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Gantt panel */}
        <main className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* ── Gantt Toolbar ────────────────────────────────────────────── */}
          <div className="flex items-center gap-1.5 h-11 px-4 bg-white border-b border-slate-200 shrink-0 flex-wrap">
            {/* Show/hide task list */}
            <button
              type="button"
              onClick={() => setShowTaskList(!showTaskList)}
              aria-pressed={showTaskList}
              aria-label={showTaskList ? 'Hide task list' : 'Show task list'}
              className={cn(
                'h-7 w-7 flex items-center justify-center rounded border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                showTaskList
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-800',
              )}
              title={showTaskList ? 'Hide task list' : 'Show task list'}
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>

            <ToolbarSep />

            {/* Feature toggles */}
            <ToolbarToggle active={enableAutoSchedule} onClick={() => setEnableAutoSchedule(v => !v)}>
              Авто-планирование
            </ToolbarToggle>

            <ToolbarToggle active={highlightExpiredTasks} onClick={() => setHighlightExpiredTasks(v => !v)}>
              Просроченные
            </ToolbarToggle>

            <ToolbarToggle
              active={disableTaskNameEditing}
              onClick={() => setDisableTaskNameEditing(v => !v)}
              activeClass="bg-amber-500 text-white border-amber-500"
            >
              Блок. названия
            </ToolbarToggle>

            <ToolbarToggle
              active={disableDependencyEditing}
              onClick={() => setDisableDependencyEditing(v => !v)}
              activeClass="bg-amber-500 text-white border-amber-500"
            >
              Блок. связи
            </ToolbarToggle>

            <div className="flex-1" />

            {/* Validation errors badge */}
            {validationErrors.length > 0 && (
              <span className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-0.5 font-medium">
                {validationErrors.length} error{validationErrors.length > 1 ? 's' : ''}
              </span>
            )}

            <ToolbarSep />

            {/* Action buttons */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleScrollToToday}
              className="h-7 text-xs gap-1.5 border-slate-200 text-slate-600 hover:text-slate-900"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Сегодня
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleClearDatabase}
              className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Очистить
            </Button>
          </div>

          {/* ── Gantt Chart ─────────────────────────────────────────────── */}
          {loading ? (
            <div className="flex items-center justify-center flex-1 text-sm text-slate-400">
              Загрузка…
            </div>
          ) : (
            <GanttChart
              ref={ganttRef}
              tasks={tasks}
              onChange={setTasks}
              dayWidth={24}
              rowHeight={36}
              containerHeight="calc(100vh - 120px)"
              showTaskList={showTaskList}
              taskListWidth={650}
              onValidateDependencies={handleValidation}
              enableAutoSchedule={enableAutoSchedule}
              onCascade={handleCascade}
              disableTaskNameEditing={disableTaskNameEditing}
              disableDependencyEditing={disableDependencyEditing}
              highlightExpiredTasks={highlightExpiredTasks}
              headerHeight={40}
            />
          )}
        </main>

        {/* ── Chat sidebar ─────────────────────────────────────────────── */}
        <aside className="w-80 shrink-0 border-l border-slate-200 flex flex-col">
          <ChatSidebar
            messages={messages}
            streaming={streaming}
            onSend={handleSend}
            disabled={aiThinking}
            connected={connected}
            loading={aiThinking}
          />
        </aside>
      </div>

      {/* ── Status Bar ───────────────────────────────────────────────────── */}
      <footer className="flex items-center gap-4 h-7 px-4 bg-white border-t border-slate-200 shrink-0 select-none">
        <span className="font-mono text-[11px] text-slate-400">
          {tasks.length} задач{tasks.length === 1 ? 'а' : tasks.length > 1 && tasks.length < 5 ? 'и' : ''}
        </span>
        <span
          className={cn(
            'flex items-center gap-1.5 font-mono text-[11px] transition-colors',
            connected ? 'text-emerald-600' : 'text-amber-600',
          )}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', connected ? 'bg-emerald-500' : 'bg-amber-400')} />
          {connected ? 'Подключено' : 'Переподключение…'}
        </span>
      </footer>
    </div>
  );
}
