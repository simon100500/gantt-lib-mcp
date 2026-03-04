import { useState, useCallback, useRef } from 'react';
import { GanttChart, type GanttChartRef } from './components/GanttChart.tsx';
import { ChatSidebar, type ChatMessage } from './components/ChatSidebar.tsx';
import { useTasks } from './hooks/useTasks.ts';
import { useWebSocket, type ServerMessage } from './hooks/useWebSocket.ts';
import type { Task, ValidationResult, DependencyError } from './types.ts';

let msgCounter = 0;

export default function App() {
  const { tasks, setTasks, loading, error } = useTasks();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [aiThinking, setAiThinking] = useState(false);

  // New gantt-lib feature states
  const [validationErrors, setValidationErrors] = useState<DependencyError[]>([]);
  const [enableAutoSchedule, setEnableAutoSchedule] = useState(false);
  const [disableTaskNameEditing, setDisableTaskNameEditing] = useState(false);
  const [disableDependencyEditing, setDisableDependencyEditing] = useState(false);
  const [highlightExpiredTasks, setHighlightExpiredTasks] = useState(true);
  const ganttRef = useRef<GanttChartRef>(null);

  const handleWsMessage = useCallback((msg: ServerMessage) => {
    if (msg.type === 'tasks') {
      setTasks(msg.tasks as Task[]);
    } else if (msg.type === 'token') {
      setAiThinking(true);
      setStreaming(prev => prev + (msg.content ?? ''));
    } else if (msg.type === 'done') {
      setAiThinking(false);
      setStreaming(prev => {
        if (prev) {
          setMessages(ms => [...ms, {
            id: String(++msgCounter),
            role: 'assistant',
            content: prev,
          }]);
        }
        return '';
      });
    } else if (msg.type === 'error') {
      setAiThinking(false);
      setStreaming('');
      setMessages(ms => [...ms, {
        id: String(++msgCounter),
        role: 'assistant',
        content: `Error: ${msg.message ?? 'unknown error'}`,
      }]);
    }
  }, [setTasks]);

  const { send, connected } = useWebSocket(handleWsMessage);

  const handleSend = useCallback((text: string) => {
    setMessages(ms => [...ms, { id: String(++msgCounter), role: 'user', content: text }]);
    setAiThinking(true);
    send({ type: 'chat', message: text });
  }, [send]);

  // Handle validation errors from dependency validation
  const handleValidation = useCallback((result: ValidationResult) => {
    if (!result.isValid) {
      console.error('Dependency validation errors:', result.errors);
      setValidationErrors(result.errors);
      // TODO: Display errors in UI (toast, status bar, etc.)
    } else {
      setValidationErrors([]);
    }
  }, []);

  // Handle cascade updates from auto-schedule mode
  const handleCascade = useCallback((shiftedTasks: Task[]) => {
    setTasks(prev => {
      const map = new Map(shiftedTasks.map(t => [t.id, t]));
      return prev.map(t => map.get(t.id) ?? t);
    });
  }, [setTasks]);

  // Scroll to today button handler
  const handleScrollToToday = useCallback(() => {
    ganttRef.current?.scrollToToday();
  }, []);

  if (error) {
    return (
      <div style={{ padding: 20, color: 'red' }}>
        Failed to load tasks: {error}. Is the server running on :3000?
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '98vh', fontFamily: 'sans-serif' }}>
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Control Bar */}
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '8px 16px',
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: '#f5f5f5',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => setEnableAutoSchedule(!enableAutoSchedule)}
            style={{
              padding: '6px 12px',
              backgroundColor: enableAutoSchedule ? '#22c55e' : '#e5e7eb',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            {enableAutoSchedule ? 'Auto-Schedule: ON' : 'Auto-Schedule: OFF'}
          </button>

          <button
            onClick={() => setHighlightExpiredTasks(!highlightExpiredTasks)}
            style={{
              padding: '6px 12px',
              backgroundColor: highlightExpiredTasks ? '#22c55e' : '#e5e7eb',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            {highlightExpiredTasks ? 'Highlight Expired: ON' : 'Highlight Expired: OFF'}
          </button>

          <button
            onClick={() => setDisableTaskNameEditing(!disableTaskNameEditing)}
            style={{
              padding: '6px 12px',
              backgroundColor: disableTaskNameEditing ? '#ef4444' : '#e5e7eb',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            {disableTaskNameEditing ? 'Name Editing: OFF' : 'Name Editing: ON'}
          </button>

          <button
            onClick={() => setDisableDependencyEditing(!disableDependencyEditing)}
            style={{
              padding: '6px 12px',
              backgroundColor: disableDependencyEditing ? '#ef4444' : '#e5e7eb',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            {disableDependencyEditing ? 'Dependency Editing: OFF' : 'Dependency Editing: ON'}
          </button>

          <button
            onClick={handleScrollToToday}
            style={{
              padding: '6px 12px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: '1px solid #2563eb',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              marginLeft: 'auto'
            }}
          >
            Scroll to Today
          </button>

          {validationErrors.length > 0 && (
            <span style={{
              padding: '4px 8px',
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fecaca',
              borderRadius: '4px',
              fontSize: '12px'
            }}>
              {validationErrors.length} validation error(s)
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 20 }}>Loading...</div>
        ) : (
          <GanttChart
            ref={ganttRef}
            tasks={tasks}
            onChange={setTasks}
            dayWidth={24}
            rowHeight={36}
            containerHeight={800}
            showTaskList={true}
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
      <aside style={{ width: 360, borderLeft: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column' }}>
        <ChatSidebar
          messages={messages}
          streaming={streaming}
          onSend={handleSend}
          disabled={aiThinking}
          connected={connected}
        />
      </aside>
    </div>
  );
}
