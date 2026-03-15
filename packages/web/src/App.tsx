import { useState, useCallback, useRef, useEffect } from 'react';
import { CalendarDays, CalendarRange, Check, ChevronDown, ChevronUp, Eye, Link, LogOut, Menu, PanelLeft, Sparkles, Sun } from 'lucide-react';
import { GanttChart, type GanttChartRef } from './components/GanttChart.tsx';
import { ChatSidebar, type ChatMessage } from './components/ChatSidebar.tsx';
import { StartScreen } from './components/StartScreen.tsx';
import { useTasks } from './hooks/useTasks.ts';
import { useLocalTasks } from './hooks/useLocalTasks.ts';
import { useWebSocket, type ServerMessage } from './hooks/useWebSocket.ts';
import { useAuth } from './hooks/useAuth.ts';
import { useBatchTaskUpdate } from './hooks/useBatchTaskUpdate.ts';
import { useSharedProject } from './hooks/useSharedProject.ts';
import { useTaskMutation } from './hooks/useTaskMutation.ts';
import { OtpModal } from './components/OtpModal.tsx';
import { EditProjectModal } from './components/EditProjectModal.tsx';
import { ProjectSwitcher } from './components/ProjectSwitcher.tsx';
import { LoginButton } from './components/LoginButton.tsx';
import { Button } from './components/ui/button.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './components/ui/dropdown-menu.tsx';
import { cn } from '@/lib/utils';
import type { Task, ValidationResult, DependencyError } from './types.ts';

let msgCounter = 0;
const ACCESS_TOKEN_KEY = 'gantt_access_token';

// ── Switch control (track + thumb) ────────────────────────────────────────
interface SwitchControlProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

type WorkspaceMode =
  | { kind: 'guest' }
  | { kind: 'shared' }
  | { kind: 'project'; projectId: string; chatOpen: boolean }
  | {
    kind: 'draft';
    draftName: string;
    queuedPrompt: string | null;
    activation: 'idle' | 'creating' | 'switching' | 'ready';
  };

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
  const sharedProject = useSharedProject();
  const hasShareToken = Boolean(sharedProject.shareToken);
  const authenticatedTasks = useTasks(hasShareToken ? null : auth.accessToken, auth.refreshAccessToken);
  const localTasks = useLocalTasks();
  const { tasks, setTasks, loading, error } = hasShareToken
    ? sharedProject
    : auth.isAuthenticated
      ? authenticatedTasks
      : localTasks;
  const [autoSaveSkipVersion, setAutoSaveSkipVersion] = useState(0);
  // Batch task updates for gantt-lib onChange events (handles individual mutations)
  const batchUpdate = useBatchTaskUpdate({
    tasks,
    setTasks,
    accessToken: hasShareToken ? null : auth.isAuthenticated ? auth.accessToken : null,
  });
  const { savingState } = batchUpdate;
  // Individual task mutations for direct AI agent operations
  const { mutateTask, createTask, deleteTask } = useTaskMutation(
    hasShareToken ? null : auth.isAuthenticated ? auth.accessToken : null,
  );
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [projectSidebarVisible, setProjectSidebarVisible] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceMode>(() => {
    if (hasShareToken) {
      return { kind: 'shared' };
    }
    if (auth.isAuthenticated && auth.project?.id) {
      return { kind: 'project', projectId: auth.project.id, chatOpen: false };
    }
    return { kind: 'guest' };
  });
  const [shareStatus, setShareStatus] = useState<'idle' | 'creating' | 'copied' | 'error'>('idle');

  // Gantt feature toggles
  const [validationErrors, setValidationErrors] = useState<DependencyError[]>([]);
  const [autoSchedule, setAutoSchedule] = useState(true);
  const [highlightExpiredTasks, setHighlightExpiredTasks] = useState(true);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [showTaskList, setShowTaskList] = useState(true);

  // Always allow editing (removed toggle buttons)
  const disableTaskNameEditing = false;
  const disableDependencyEditing = false;

  const ganttRef = useRef<GanttChartRef>(null);
  const activationInFlightRef = useRef(false);
  const createEmptyChartAfterActivationRef = useRef(false);
  const queuedPromptRef = useRef<string | null>(null);

  const replaceTasksFromSystem = useCallback((nextTasks: Task[]) => {
    setAutoSaveSkipVersion(version => version + 1);
    setTasks(nextTasks);
  }, [setTasks]);

  // ── WebSocket message handler ────────────────────────────────────────────
  const handleWsMessage = useCallback((msg: ServerMessage) => {
    if (msg.type === 'tasks') {
      // WebSocket is ONLY used for AI agent responses now, not for user edits.
      // User edits use optimistic updates with direct server save, no realtime sync.
      replaceTasksFromSystem(msg.tasks as Task[]);
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

  const { send, connected, connectedToken } = useWebSocket(
    handleWsMessage,
    () => (hasShareToken ? null : auth.accessToken),
    hasShareToken ? null : auth.accessToken,
    hasShareToken ? undefined : auth.refreshAccessToken,
  );
  const displayConnected = hasShareToken ? true : auth.isAuthenticated ? connected : true;

  const getDefaultProjectName = useCallback(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `Проект ${year}-${month}-${day}`;
  }, []);

  useEffect(() => {
    if (hasShareToken) {
      setWorkspace({ kind: 'shared' });
      return;
    }

    const projectId = auth.project?.id;
    if (!auth.isAuthenticated || !projectId) {
      setWorkspace({ kind: 'guest' });
      return;
    }

    setWorkspace(prev => {
      if (prev.kind === 'draft') {
        return prev;
      }

      if (prev.kind === 'project' && prev.projectId === projectId) {
        return prev;
      }

      return { kind: 'project', projectId, chatOpen: false };
    });
  }, [auth.isAuthenticated, auth.project?.id, hasShareToken]);

  const closeProjectChat = useCallback(() => {
    setWorkspace(prev => (
      prev.kind === 'project'
        ? { ...prev, chatOpen: false }
        : prev
    ));
  }, []);

  const openProjectChat = useCallback(() => {
    setWorkspace(prev => (
      prev.kind === 'project'
        ? { ...prev, chatOpen: true }
        : prev
    ));
  }, []);

  const resetWorkspacePresentation = useCallback(() => {
    replaceTasksFromSystem([]);
    setMessages([]);
    setStreaming('');
    setAiThinking(false);
  }, [replaceTasksFromSystem]);

  const createPlaceholderTask = useCallback((): Task => {
    const today = new Date().toISOString().split('T')[0];
    return {
      id: `task-${Date.now()}`,
      name: 'РќРѕРІР°СЏ Р·Р°РґР°С‡Р°',
      startDate: today,
      endDate: today,
    };
  }, []);

  const submitChatMessage = useCallback(async (message: string) => {
    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;

    let token = getLatestAccessToken();
    if (!token) {
      return false;
    }

    let response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
    });

    if (response.status === 401) {
      const refreshedToken = await auth.refreshAccessToken();
      if (!refreshedToken) {
        return false;
      }

      token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
      });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return true;
  }, [auth]);

  const handleSend = useCallback((text: string) => {
    if (hasShareToken) {
      return;
    }
    if (!auth.isAuthenticated) {
      setShowOtpModal(true);
      return;
    }
    setMessages(ms => [...ms, { id: String(++msgCounter), role: 'user', content: text }]);
    setAiThinking(true);
    openProjectChat();
    void submitChatMessage(text).catch((error) => {
      setAiThinking(false);
      setMessages(ms => [
        ...ms,
        { id: String(++msgCounter), role: 'assistant', content: `Error: ${String(error)}` },
      ]);
    });
  }, [auth.isAuthenticated, hasShareToken, openProjectChat, submitChatMessage]);

  const activateDraftWorkspace = useCallback(async ({
    firstPrompt,
    createEmptyChart = false,
  }: {
    firstPrompt?: string;
    createEmptyChart?: boolean;
  }): Promise<boolean> => {
    if (hasShareToken) {
      return false;
    }

    if (!auth.isAuthenticated) {
      setShowOtpModal(true);
      return false;
    }

    if (workspace.kind !== 'draft' || activationInFlightRef.current) {
      return false;
    }

    activationInFlightRef.current = true;
    createEmptyChartAfterActivationRef.current = createEmptyChart;
    queuedPromptRef.current = firstPrompt ?? null;
    resetWorkspacePresentation();

    if (firstPrompt) {
      setMessages([{ id: String(++msgCounter), role: 'user', content: firstPrompt }]);
      setAiThinking(true);
    }

    setWorkspace(prev => (
      prev.kind === 'draft'
        ? { ...prev, queuedPrompt: firstPrompt ?? null, activation: 'creating' }
        : prev
    ));

    const newProject = await auth.createProject(workspace.draftName);
    if (!newProject) {
      setAiThinking(false);
      queuedPromptRef.current = null;
      setWorkspace(prev => (
        prev.kind === 'draft'
          ? { ...prev, queuedPrompt: null, activation: 'idle' }
          : prev
      ));
      activationInFlightRef.current = false;
      createEmptyChartAfterActivationRef.current = false;
      return false;
    }

    setWorkspace(prev => (
      prev.kind === 'draft'
        ? { ...prev, activation: 'switching' }
        : prev
    ));

    await auth.switchProject(newProject.id);
    setProjectSidebarVisible(false);
    if (createEmptyChart) {
      setTasks([createPlaceholderTask()]);
    } else {
      replaceTasksFromSystem([]);
    }
    setWorkspace({
      kind: 'project',
      projectId: newProject.id,
      chatOpen: !createEmptyChart,
    });
    activationInFlightRef.current = false;
    return true;
  }, [auth, createPlaceholderTask, hasShareToken, replaceTasksFromSystem, resetWorkspacePresentation, setTasks, workspace]);

  const handleStartScreenSend = useCallback(async (text: string) => {
    if (hasShareToken) {
      return;
    }
    if (!auth.isAuthenticated) {
      setShowOtpModal(true);
      return;
    }
    if (workspace.kind === 'draft') {
      await activateDraftWorkspace({ firstPrompt: text });
      return;
    }
    handleSend(text);
  }, [activateDraftWorkspace, auth.isAuthenticated, handleSend, hasShareToken, workspace.kind]);

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
    // Use batchUpdate to handle both local state update and server persistence
    // This is called when a parent task is dragged and its children need to move with it
    batchUpdate.handleTasksChange(shiftedTasks);
  }, [batchUpdate]);

  const handleEmptyChart = useCallback(async () => {
    if (workspace.kind === 'draft') {
      await activateDraftWorkspace({ createEmptyChart: true });
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const placeholderTask: Task = {
      id: `task-${Date.now()}`,
      name: 'Новая задача',
      startDate: today,
      endDate: today,
    };
    // Use batch update handler for add
    batchUpdate.handleAdd(placeholderTask);
    openProjectChat();
  }, [activateDraftWorkspace, batchUpdate, openProjectChat, workspace.kind]);

  const handleEditProject = useCallback(async (projectId: string, currentName: string) => {
    if (!auth.accessToken) return;

    setShowEditProjectModal(true);
  }, [auth.accessToken]);

  const handleEditGuestProject = useCallback(async (projectId: string, currentName: string) => {
    setShowEditProjectModal(true);
  }, []);

  const handleSwitchProject = useCallback(async (projectId: string) => {
    createEmptyChartAfterActivationRef.current = false;
    queuedPromptRef.current = null;
    resetWorkspacePresentation();
    await auth.switchProject(projectId);
    setWorkspace({ kind: 'project', projectId, chatOpen: false });
  }, [auth, resetWorkspacePresentation]);

  const handleCreateProject = useCallback(async () => {
    if (auth.isAuthenticated) {
      createEmptyChartAfterActivationRef.current = false;
      queuedPromptRef.current = null;
      resetWorkspacePresentation();
      setWorkspace({
        kind: 'draft',
        draftName: getDefaultProjectName(),
        queuedPrompt: null,
        activation: 'idle',
      });
    } else {
      queuedPromptRef.current = null;
      resetWorkspacePresentation();
      setWorkspace({ kind: 'guest' });
    }
  }, [auth.isAuthenticated, getDefaultProjectName, resetWorkspacePresentation]);

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

  const handleCreateShareLink = useCallback(async () => {
    if (!auth.accessToken || !auth.project) {
      return;
    }

    try {
      setShareStatus('creating');
      const res = await fetch(`/api/projects/${auth.project.id}/share`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json() as { url: string };
      await navigator.clipboard.writeText(data.url);
      setShareStatus('copied');
      window.setTimeout(() => {
        setShareStatus((current) => (current === 'copied' ? 'idle' : current));
      }, 2500);
    } catch (err) {
      console.error('Failed to create share link:', err);
      setShareStatus('error');
      window.setTimeout(() => {
        setShareStatus((current) => (current === 'error' ? 'idle' : current));
      }, 2500);
    }
  }, [auth.accessToken, auth.project]);

  // Clear tasks when project changes (only for authenticated users)
  useEffect(() => {
    // Don't clear tasks for unauthenticated users
    if (!auth.isAuthenticated || hasShareToken) return;
    replaceTasksFromSystem([]);
  }, [auth.project?.id, replaceTasksFromSystem, auth.isAuthenticated, hasShareToken]);

  // Load chat history on auth/project change
  useEffect(() => {
    if (!auth.isAuthenticated || !auth.accessToken || !auth.project?.id || hasShareToken || workspace.kind !== 'project') {
      return;
    }

    const hasQueuedFirstPrompt = Boolean(queuedPromptRef.current);
    setStreaming('');
    if (!hasQueuedFirstPrompt) {
      setMessages([]);
      setAiThinking(false);
    }

    fetch('/api/messages', {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    })
      .then(res => (res.ok ? (res.json() as Promise<Array<{ role: string; content: string }>>) : Promise.resolve([])))
      .then(data => {
        if (createEmptyChartAfterActivationRef.current || hasQueuedFirstPrompt) {
          return;
        }
        setMessages(
          data.map(m => ({ id: String(++msgCounter), role: m.role as 'user' | 'assistant', content: m.content })),
        );
      })
      .catch(() => { });
  }, [auth.isAuthenticated, auth.accessToken, auth.project?.id, hasShareToken, workspace.kind]);

  useEffect(() => {
    if (!auth.isAuthenticated || !connected || workspace.kind !== 'project') {
      return;
    }

    if (!auth.accessToken || connectedToken !== auth.accessToken) {
      return;
    }

    const promptToSend = queuedPromptRef.current;
    if (!promptToSend) {
      return;
    }

    queuedPromptRef.current = null;
    void submitChatMessage(promptToSend).catch((error) => {
      setAiThinking(false);
      setMessages(ms => [
        ...ms,
        { id: String(++msgCounter), role: 'assistant', content: `Error: ${String(error)}` },
      ]);
    });
  }, [auth.accessToken, auth.isAuthenticated, connected, connectedToken, submitChatMessage, workspace.kind]);

  const activeWorkspaceProjectId = workspace.kind === 'project' ? workspace.projectId : null;

  useEffect(() => {
    if (!auth.isAuthenticated || hasShareToken || workspace.kind !== 'project') {
      return;
    }

    auth.syncProjectTaskCount(workspace.projectId, tasks.length);
  }, [activeWorkspaceProjectId, auth.isAuthenticated, auth.syncProjectTaskCount, hasShareToken, tasks.length, workspace.kind]);

  const handleScrollToToday = useCallback(() => ganttRef.current?.scrollToToday(), []);
  const handleCollapseAll = useCallback(() => ganttRef.current?.collapseAll(), []);
  const handleExpandAll = useCallback(() => ganttRef.current?.expandAll(), []);
  const isDraftWorkspace = workspace.kind === 'draft';
  const isGuestWorkspace = workspace.kind === 'guest';
  const chatSidebarVisible = workspace.kind === 'project' && workspace.chatOpen;
  const currentProjectLabel = hasShareToken
    ? (sharedProject.project?.name || 'Shared project')
    : workspace.kind === 'draft'
      ? workspace.draftName
      : auth.isAuthenticated
        ? auth.project?.name
        : (localTasks.projectName || 'Мой проект');
  const startScreenVisible = !hasShareToken && (
    isDraftWorkspace || (isGuestWorkspace && tasks.length === 0 && !loading)
  );

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 max-w-sm text-center">
          {sharedProject.shareToken
            ? `Не удалось открыть ссылку: ${error}`
            : `Не удалось загрузить задачи: ${error}`}
        </div>
      </div>
    );
  }

  // ── Layout ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ── Project sidebar (full height) ──────────────────────────────────── */}
      {projectSidebarVisible && !hasShareToken && (
        <aside className="w-60 shrink-0 border-r border-slate-200 bg-background flex flex-col h-full">
          <div className="flex-1 overflow-y-auto p-4">
            {auth.isAuthenticated && auth.project ? (
              <ProjectSwitcher
                currentProject={
                  workspace.kind === 'draft'
                    ? { id: 'draft', name: workspace.draftName, kind: 'draft' }
                    : { ...auth.project, kind: 'project' }
                }
                projects={auth.projects}
                onSwitch={handleSwitchProject}
                onCreateNew={handleCreateProject}
                onEdit={workspace.kind === 'draft' ? undefined : handleEditProject}
              />
            ) : !auth.isAuthenticated && (
              <ProjectSwitcher
                currentProject={{ id: 'demo', name: localTasks.projectName || 'Мой проект', kind: 'project' }}
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
            aria-label={hasShareToken ? 'Режим только чтения' : projectSidebarVisible ? 'Скрыть проекты' : 'Показать проекты'}
            disabled={hasShareToken}
            className={cn(
              'h-8 w-8 flex items-center justify-center rounded transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              hasShareToken
                ? 'cursor-default bg-slate-50 text-slate-300'
                : projectSidebarVisible
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
            )}
            title={hasShareToken ? 'Read-only share' : projectSidebarVisible ? 'Скрыть проекты' : 'Показать проекты'}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <div className="flex items-center gap-2 text-base font-cascadia tracking-tight select-none">
            <img src="/favicon.svg" alt="GetGantt" className="h-5 w-5" />
            <span className="text-slate-900">GetGantt</span>
          </div>

          <span className="text-slate-400">/</span>

          {/* Project name breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-slate-700 truncate">
              {currentProjectLabel}
            </span>
            {!hasShareToken && auth.isAuthenticated && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCreateShareLink}
                disabled={shareStatus === 'creating'}
                className="h-7 shrink-0 gap-1.5 px-2.5 text-xs text-slate-600 hover:text-slate-900"
                title={
                  shareStatus === 'creating'
                    ? 'Создаём ссылку...'
                    : shareStatus === 'copied'
                      ? 'Ссылка скопирована'
                      : shareStatus === 'error'
                        ? 'Ошибка ссылки'
                        : 'Поделиться'
                }
              >
                {shareStatus === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Link className="h-3.5 w-3.5" />}
                {shareStatus === 'copied' ? 'Скопировано' : 'Поделиться'}
              </Button>
            )}
            {!hasShareToken && auth.isAuthenticated && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCreateProject}
                className="h-7 shrink-0 px-2.5 text-xs text-primary hover:bg-primary/10 hover:text-primary"
              >
                + Новый проект
              </Button>
            )}
          </div>

          <div className="flex-1" />

          {hasShareToken ? (
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              <Eye className="h-3.5 w-3.5" />
              Только чтение
            </div>
          ) : !auth.isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-600">
                Войдите, чтобы сохранить график
              </span>
              <LoginButton onClick={() => setShowOtpModal(true)} />
            </div>
          ) : (
            <div className="flex items-center gap-2">
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
            </div>
          )}
        </header>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">
          {startScreenVisible ? (
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

                <ToolbarSep />

                {/* View mode buttons with active state highlighting */}
                <button
                  type="button"
                  onClick={() => setViewMode('day')}
                  className={cn(
                    'h-7 px-2 flex items-center rounded border transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    'text-xs font-medium',
                    viewMode === 'day'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-transparent text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900',
                  )}
                  title="По дням"
                >
                  <Sun className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('week')}
                  className={cn(
                    'h-7 px-2 flex items-center rounded border transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    'text-xs font-medium',
                    viewMode === 'week'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-transparent text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900',
                  )}
                  title="По неделям"
                >
                  <CalendarRange className="w-3.5 h-3.5" />
                </button>

                <ToolbarSep />

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCollapseAll}
                  className="h-7 text-xs gap-1.5 border-slate-200 text-slate-600 hover:text-slate-900"
                  title="Свернуть все родительские задачи"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  Свернуть все
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExpandAll}
                  className="h-7 text-xs gap-1.5 border-slate-200 text-slate-600 hover:text-slate-900"
                  title="Развернуть все родительские задачи"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  Развернуть все
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
                {!chatSidebarVisible && !hasShareToken && workspace.kind === 'project' && (
                  <button
                    type="button"
                    onClick={openProjectChat}
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
                  onTasksChange={batchUpdate.handleTasksChange}
                  dayWidth={viewMode === 'week' ? 8 : 24}
                  rowHeight={36}
                  containerHeight="calc(100vh - 120px)"
                  showTaskList={showTaskList}
                  taskListWidth={650}
                  onValidateDependencies={handleValidation}
                  enableAutoSchedule={autoSchedule}
                  onCascade={handleCascade}
                  disableTaskNameEditing={disableTaskNameEditing}
                  disableDependencyEditing={disableDependencyEditing}
                  highlightExpiredTasks={highlightExpiredTasks}
                  headerHeight={40}
                  viewMode={viewMode}
                  onAdd={batchUpdate.handleAdd}
                  onDelete={batchUpdate.handleDelete}
                  onInsertAfter={batchUpdate.handleInsertAfter}
                  onReorder={batchUpdate.handleReorder}
                  onPromoteTask={batchUpdate.handlePromoteTask}
                  onDemoteTask={batchUpdate.handleDemoteTask}
                />
              )}

              {/* ── Status Bar ───────────────────────────────────────────── */}
              {tasks.length > 0 && (
                <footer className="flex items-center gap-4 h-7 px-4 bg-white border-t border-slate-200 shrink-0 select-none">
                  <span className="font-mono text-[11px] text-slate-400">
                    {tasks.length} задач{tasks.length === 1 ? 'а' : tasks.length > 1 && tasks.length < 5 ? 'и' : ''}
                  </span>

                  <span
                    className={cn(
                      'flex items-center gap-1.5 font-mono text-[11px] transition-colors',
                      displayConnected ? 'text-emerald-600' : 'text-amber-600',
                    )}
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', displayConnected ? 'bg-emerald-500' : 'bg-amber-400')} />
                    {hasShareToken ? 'Read-only share' : displayConnected ? 'Подключено' : 'Переподключение…'}
                  </span>

                  {/* Save indicator */}
                  {!hasShareToken && auth.isAuthenticated && savingState !== 'idle' && (
                    <span
                      className={cn(
                        'flex items-center gap-1.5 font-mono text-[11px] transition-colors',
                        savingState === 'saving' && 'text-amber-600',
                        savingState === 'saved' && 'text-emerald-600',
                        savingState === 'error' && 'text-red-600',
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
                          <Check className="w-3 h-3 shrink-0" />
                          Сохранено
                        </>
                      )}
                      {savingState === 'error' && (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-red-400" />
                          Ошибка сохранения
                        </>
                      )}
                    </span>
                  )}
                </footer>
              )}
            </div>

            {/* ── Chat sidebar ───────────────────────────────────────────── */}
            {chatSidebarVisible && !hasShareToken && (
              <aside className="w-80 shrink-0 border-l border-slate-200 flex flex-col relative z-20">
                <ChatSidebar
                  messages={messages}
                  streaming={streaming}
                  onSend={handleSend}
                  disabled={aiThinking}
                  connected={displayConnected}
                  loading={aiThinking}
                  onClose={closeProjectChat}
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
    </div>
  );
}
