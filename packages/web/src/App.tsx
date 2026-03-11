import { useState, useCallback, useRef, useEffect } from 'react';
import { CalendarDays, ChevronDown, LogOut, Menu, PanelLeft, Sparkles } from 'lucide-react';
import { GanttChart, type GanttChartRef } from './components/GanttChart.tsx';
import { ChatSidebar, type ChatMessage } from './components/ChatSidebar.tsx';
import { StartScreen } from './components/StartScreen.tsx';
import { useTasks } from './hooks/useTasks.ts';
import { useLocalTasks } from './hooks/useLocalTasks.ts';
import { useWebSocket, type ServerMessage } from './hooks/useWebSocket.ts';
import { useAuth } from './hooks/useAuth.ts';
import { useAutoSave } from './hooks/useAutoSave.ts';
import { OtpModal } from './components/OtpModal.tsx';
import { EditProjectModal } from './components/EditProjectModal.tsx';
import { CreateProjectModal } from './components/CreateProjectModal.tsx';
import { ProjectSwitcher } from './components/ProjectSwitcher.tsx';
import { LoginButton } from './components/LoginButton.tsx';
import { Button } from './components/ui/button.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './components/ui/dropdown-menu.tsx';
import { cn } from '@/lib/utils';
import type { Task, ValidationResult, DependencyError } from './types.ts';

let msgCounter = 0;

// ── Switch control (track + thumb) ────────────────────────────────────────
interface SwitchControlProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

function SwitchControl({ checked, onChange, label }: SwitchControlProps) {
  return (
    <label
      className="flex items-center gap-1.5 cursor-pointer select-none group"
      onClick={() => onChange(!checked)}
    >
      {/* Track + thumb */}
      <span
        role="switch"
        aria-checked={checked}
        className={cn(
          'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          checked
            ? 'bg-primary border-primary'
            : 'bg-slate-200 border-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-3' : 'translate-x-0',
          )}
        />
      </span>
      {/* Label */}
      <span className={cn(
        'text-xs font-medium transition-colors',
        checked ? 'text-slate-800' : 'text-slate-500',
      )}>
        {label}
      </span>
    </label>
  );
}

// ── Toolbar separator ──────────────────────────────────────────────────────
function ToolbarSep() {
  return <span className="w-px h-4 bg-slate-200 shrink-0" />;
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const auth = useAuth();
  const authenticatedTasks = useTasks(auth.accessToken, auth.refreshAccessToken);
  const localTasks = useLocalTasks();
  const { tasks, setTasks, loading, error } = auth.isAuthenticated ? authenticatedTasks : localTasks;
  // Autosave to server on any chart change (guest mode persists in useLocalTasks)
  const { savingState } = useAutoSave(tasks, auth.isAuthenticated ? auth.accessToken : null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [chatSidebarVisible, setChatSidebarVisible] = useState(false);
  const [projectSidebarVisible, setProjectSidebarVisible] = useState(true);
  const [hasStartedChat, setHasStartedChat] = useState(false);

  // Gantt feature toggles
  const [validationErrors, setValidationErrors] = useState<DependencyError[]>([]);
  const [autoSchedule, setAutoSchedule] = useState(true);
  const [highlightExpiredTasks, setHighlightExpiredTasks] = useState(true);
  const [showTaskList, setShowTaskList] = useState(true);

  // Always allow editing (removed toggle buttons)
  const disableTaskNameEditing = false;
  const disableDependencyEditing = false;

  const ganttRef = useRef<GanttChartRef>(null);

  // ── WebSocket message handler ────────────────────────────────────────────
  const handleWsMessage = useCallback((msg: ServerMessage) => {
    if (msg.type === 'tasks') {
      console.log('[App] Received tasks via WebSocket, count:', msg.tasks?.length);
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
  const displayConnected = auth.isAuthenticated ? connected : true;

  const handleSend = useCallback((text: string) => {
    if (!auth.isAuthenticated) {
      setShowOtpModal(true);
      return;
    }
    setMessages(ms => [...ms, { id: String(++msgCounter), role: 'user', content: text }]);
    setAiThinking(true);
    send({ type: 'chat', message: text });
  }, [auth.isAuthenticated, send]);

  const handleStartScreenSend = useCallback((text: string) => {
    if (!auth.isAuthenticated) {
      setShowOtpModal(true);
      return;
    }
    setHasStartedChat(true);
    setChatSidebarVisible(true);
    handleSend(text);
  }, [auth.isAuthenticated, handleSend]);

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

  const handleAddTask = useCallback((newTask: Task) => {
    setTasks(prev => [...prev, newTask]);
  }, [setTasks]);

  const handleEmptyChart = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const placeholderTask: Task = {
      id: `task-${Date.now()}`,
      name: 'Новая задача',
      startDate: today,
      endDate: today,
    };
    handleAddTask(placeholderTask);
    setChatSidebarVisible(true);
  }, [handleAddTask]);

  const handleDeleteTask = useCallback((taskId: string) => {
    setTasks(prev => prev
      .filter(t => t.id !== taskId)
      .map(t => (t.parentId === taskId ? { ...t, parentId: undefined } : t)));
  }, [setTasks]);

  const handleInsertAfterTask = useCallback((taskId: string, newTask: Task) => {
    setTasks(prev => {
      const index = prev.findIndex(t => t.id === taskId);
      if (index === -1) return prev;
      const newTasks = [...prev];
      newTasks.splice(index + 1, 0, newTask);
      return newTasks;
    });
  }, [setTasks]);

  const handleReorderTasks = useCallback((reorderedTasks: Task[]) => {
    setTasks(reorderedTasks);
  }, [setTasks]);

  const handleEditProject = useCallback(async (projectId: string, currentName: string) => {
    if (!auth.accessToken) return;

    setShowEditProjectModal(true);
  }, [auth.accessToken]);

  const handleEditGuestProject = useCallback(async (projectId: string, currentName: string) => {
    setShowEditProjectModal(true);
  }, []);

  const handleCreateProject = useCallback(async () => {
    // Just reset to start screen - project will be created on actual activity
    setTasks([]);
    setMessages([]);
    setStreaming('');
    setAiThinking(false);
    setHasStartedChat(false);
    setChatSidebarVisible(false);
  }, [setTasks]);

  const handleSaveNewProject = useCallback(async (name: string) => {
    const newProject = await auth.createProject(name);
    if (newProject) {
      // Switch to the newly created project
      auth.switchProject(newProject.id);
    }
    return newProject;
  }, [auth.createProject, auth.switchProject]);

  const handleSaveProjectName = useCallback(async (newName: string) => {
    // For guest mode, save to localStorage
    if (!auth.isAuthenticated) {
      localTasks.setProjectName(newName);
      return;
    }

    // For authenticated users, save to server
    if (!auth.accessToken || !auth.project || !auth.user) {
      throw new Error('Not authenticated');
    }

    const res = await fetch(`/api/projects/${auth.project.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({ name: newName }),
    });

    if (!res.ok) {
      const data = await res.json() as { error?: string };
      throw new Error(data.error || 'Failed to update project name');
    }

    const data = await res.json() as { project: { id: string; name: string } };

    // Update local state
    auth.login(
      { accessToken: auth.accessToken, refreshToken: localStorage.getItem('gantt_refresh_token') || '' },
      auth.user,
      data.project
    );
  }, [auth, localTasks]);

  // Clear tasks when project changes (only for authenticated users)
  useEffect(() => {
    // Don't clear tasks for unauthenticated users
    if (!auth.isAuthenticated) return;
    setTasks([]);
    setHasStartedChat(false);
  }, [auth.project?.id, setTasks, auth.isAuthenticated]);

  // Reset to start screen state when all tasks are removed AND AI is not processing
  useEffect(() => {
    if (tasks.length === 0 && !loading && !aiThinking) {
      setHasStartedChat(false);
      setChatSidebarVisible(false);
    }
  }, [tasks.length, loading, aiThinking]);

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
      .catch(() => { });
  }, [auth.isAuthenticated, auth.accessToken, auth.project?.id]);

  const handleScrollToToday = useCallback(() => ganttRef.current?.scrollToToday(), []);

  // ── Error state ──────────────────────────────────────────────────────────
  if (error && auth.isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 max-w-sm text-center">
          Не удалось загрузить задачи: {error}
        </div>
      </div>
    );
  }

  // ── Layout ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ── Project sidebar (full height) ──────────────────────────────────── */}
      {projectSidebarVisible && (
        <aside className="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col h-full">
          <div className="flex-1 overflow-y-auto p-4">
            {auth.isAuthenticated && auth.project ? (
              <ProjectSwitcher
                currentProject={auth.project}
                projects={auth.projects}
                onSwitch={auth.switchProject}
                onCreateNew={handleCreateProject}
                onEdit={handleEditProject}
              />
            ) : !auth.isAuthenticated && (
              <ProjectSwitcher
                currentProject={{ id: 'demo', name: localTasks.projectName || 'Мой проект' }}
                projects={[]}
                onSwitch={() => { }}
                onCreateNew={handleCreateProject}
                onEdit={handleEditGuestProject}
              />
            )}
          </div>
        </aside>
      )}

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">

        {/* ── Top Bar ──────────────────────────────────────────────────────── */}
        <header className="flex items-center gap-3 h-12 px-4 bg-white border-b border-slate-200 shrink-0">
          {/* Burger menu button */}
          <button
            type="button"
            onClick={() => setProjectSidebarVisible(!projectSidebarVisible)}
            aria-pressed={projectSidebarVisible}
            aria-label={projectSidebarVisible ? 'Скрыть проекты' : 'Показать проекты'}
            className={cn(
              'h-8 w-8 flex items-center justify-center rounded transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              projectSidebarVisible
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
            )}
            title={projectSidebarVisible ? 'Скрыть проекты' : 'Показать проекты'}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight select-none">
            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
            <span className="text-slate-900">GetGantt</span>
          </div>

          <span className="text-slate-400">/</span>

          {/* Project name breadcrumb */}
          <span className="text-sm font-medium text-slate-700 truncate">
            {auth.isAuthenticated ? auth.project?.name : (localTasks.projectName || 'Мой проект')}
          </span>

          <div className="flex-1" />

          {!auth.isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-600">
                Войдите, чтобы сохранить график
              </span>
              <LoginButton onClick={() => setShowOtpModal(true)} />
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 max-w-[280px] gap-1.5 px-2.5 text-sm font-medium focus-visible:ring-0 focus-visible:ring-offset-0"
                >
                  <span className="truncate text-slate-600">{auth.user?.email ?? 'Account'}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="truncate text-slate-700">
                  {auth.user?.email ?? 'Account'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={auth.logout} className="text-red-600 focus:text-red-700">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Выйти</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">
          {tasks.length === 0 && !loading && !hasStartedChat ? (
            /* ── Start Screen ─────────────────────────────────────────────── */
            <StartScreen
              onSend={handleStartScreenSend}
              onEmptyChart={handleEmptyChart}
              isAuthenticated={auth.isAuthenticated}
              onLoginRequired={() => setShowOtpModal(true)}
            />
          ) : (
            <>
              {/* Gantt panel wrapper - includes chart and footer */}
              <div className="flex flex-col flex-1 overflow-hidden min-w-0">
              {/* ── Gantt Toolbar ──────────────────────────────────────────── */}
              <div className="flex items-center gap-1.5 h-11 px-4 bg-white border-b border-slate-200 shrink-0 flex-wrap">
                {/* Show/hide task list - outline style for both states */}
                <button
                  type="button"
                  onClick={() => setShowTaskList(!showTaskList)}
                  aria-pressed={showTaskList}
                  aria-label={showTaskList ? 'Скрыть задачи' : 'Показать задачи'}
                  className={cn(
                    'h-7 px-3 flex items-center gap-2 rounded border transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    'bg-transparent text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900',
                    'text-xs font-medium',
                  )}
                  title={showTaskList ? 'Скрыть задачи' : 'Показать задачи'}
                >
                  <PanelLeft className="w-3.5 h-3.5" />
                  {showTaskList ? 'Скрыть задачи' : 'Показать задачи'}
                </button>

                <ToolbarSep />

                {/* Action buttons - left side */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleScrollToToday}
                  className="h-7 text-xs gap-1.5 border-slate-200 text-slate-600 hover:text-slate-900"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Сегодня
                </Button>

                <div className="flex-1" />

                {/* Feature switches - right side */}
                <div className="flex items-center gap-2">
                  <SwitchControl
                    checked={autoSchedule}
                    onChange={setAutoSchedule}
                    label="Закрепить связи"
                  />
                  <ToolbarSep />
                  <SwitchControl
                    checked={highlightExpiredTasks}
                    onChange={setHighlightExpiredTasks}
                    label="Просроченные"
                  />
                </div>

                <ToolbarSep />

                {/* Chat toggle button - only show when chat is hidden, on the right */}
                {!chatSidebarVisible && (
                  <button
                    type="button"
                    onClick={() => setChatSidebarVisible(true)}
                    aria-label="Показать AI ассистента"
                    className={cn(
                      'h-7 px-2.5 flex items-center gap-1.5 rounded border transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                      'bg-primary text-primary-foreground border-primary shadow-sm hover:bg-primary/90',
                      'text-xs font-medium',
                    )}
                    title="Показать AI ассистента"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    AI ассистент
                  </button>
                )}

                {/* Validation errors badge */}
                {validationErrors.length > 0 && (
                  <span className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-0.5 font-medium">
                    {validationErrors.length} ошибк{validationErrors.length === 1 ? 'а' : validationErrors.length > 1 && validationErrors.length < 5 ? 'и' : ''}
                  </span>
                )}
              </div>

              {/* ── Gantt Chart ─────────────────────────────────────────── */}
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
                  disableConstraints={!autoSchedule}
                  onCascade={autoSchedule ? handleCascade : undefined}
                  disableTaskNameEditing={disableTaskNameEditing}
                  disableDependencyEditing={disableDependencyEditing}
                  highlightExpiredTasks={highlightExpiredTasks}
                  headerHeight={40}
                  onAdd={handleAddTask}
                  onDelete={handleDeleteTask}
                  onInsertAfter={handleInsertAfterTask}
                  onReorder={handleReorderTasks}
                />
              )}

              {/* ── Status Bar ───────────────────────────────────────────── */}
              {tasks.length > 0 && (
                <footer className="flex items-center gap-4 h-7 px-4 bg-white border-t border-slate-200 shrink-0 select-none">
                  <span className="font-mono text-[11px] text-slate-400">
                    {tasks.length} задач{tasks.length === 1 ? 'а' : tasks.length > 1 && tasks.length < 5 ? 'и' : ''}
                  </span>

                  {/* Saving status indicator */}
                  {auth.isAuthenticated && (
                    <span
                      className={cn(
                        'flex items-center gap-1.5 font-mono text-[11px] transition-colors',
                        savingState === 'saving' && 'text-amber-600',
                        savingState === 'saved' && 'text-emerald-600',
                        savingState === 'error' && 'text-destructive',
                      )}
                    >
                      {savingState === 'saving' && (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-400 animate-pulse" />
                          Сохранение…
                        </>
                      )}
                      {savingState === 'saved' && (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
                          Сохранено
                        </>
                      )}
                      {savingState === 'error' && (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-destructive" />
                          Ошибка сохранения
                        </>
                      )}
                    </span>
                  )}

                  <span
                    className={cn(
                      'flex items-center gap-1.5 font-mono text-[11px] transition-colors',
                      displayConnected ? 'text-emerald-600' : 'text-amber-600',
                    )}
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', displayConnected ? 'bg-emerald-500' : 'bg-amber-400')} />
                    {displayConnected ? 'Подключено' : 'Переподключение…'}
                  </span>
                </footer>
              )}
            </div>

            {/* ── Chat sidebar ───────────────────────────────────────────── */}
            {chatSidebarVisible && (
              <aside className="w-80 shrink-0 border-l border-slate-200 flex flex-col">
                <ChatSidebar
                  messages={messages}
                  streaming={streaming}
                  onSend={handleSend}
                  disabled={aiThinking}
                  connected={displayConnected}
                  loading={aiThinking}
                  onClose={() => setChatSidebarVisible(false)}
                  isAuthenticated={auth.isAuthenticated}
                  onLoginRequired={() => setShowOtpModal(true)}
                />
              </aside>
            )}
          </>
        )}
        </div>
      </div>

      {/* ── OTP Modal (controlled) ──────────────────────────────────────────── */}
      {showOtpModal && (
        <OtpModal
          onSuccess={async (result) => {
            auth.login(result, result.user, result.project);
            setShowOtpModal(false);

            // 1. Import local guest tasks (if the user created any)
            const hasLocalEdits = localTasks.tasks.length > 0;
            if (hasLocalEdits) {
              try {
                await fetch('/api/tasks', {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${result.accessToken}`,
                  },
                  body: JSON.stringify(localTasks.tasks),
                });
                localStorage.removeItem('gantt_local_tasks');
                localStorage.removeItem('gantt_demo_mode');
              } catch (err) {
                console.error('Failed to import local tasks after login:', err);
              }
            }

            // 2. Transfer project name if guest renamed it (separate from task import)
            const DEFAULT_PROJECT_NAME = 'Мой проект';
            if (localTasks.projectName && localTasks.projectName !== DEFAULT_PROJECT_NAME) {
              try {
                await fetch(`/api/projects/${result.project.id}`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${result.accessToken}`,
                  },
                  body: JSON.stringify({ name: localTasks.projectName }),
                });
                // Update auth state so header reflects the new name immediately
                auth.login(
                  result,
                  result.user,
                  { ...result.project, name: localTasks.projectName }
                );
              } catch (err) {
                console.error('Failed to transfer project name after login:', err);
              }
            }
          }}
          onClose={() => setShowOtpModal(false)}
        />
      )}

      {/* ── Edit Project Modal ───────────────────────────────────────────────── */}
      {showEditProjectModal && (
        <EditProjectModal
          projectName={auth.isAuthenticated && auth.project ? auth.project.name : localTasks.projectName}
          onSave={handleSaveProjectName}
          onClose={() => setShowEditProjectModal(false)}
        />
      )}

      {/* ── Create Project Modal ───────────────────────────────────────────────── */}
      {showCreateProjectModal && (
        <CreateProjectModal
          onSave={handleSaveNewProject}
          onClose={() => setShowCreateProjectModal(false)}
        />
      )}
    </div>
  );
}
