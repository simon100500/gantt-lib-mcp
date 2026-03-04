import { useState, useCallback } from 'react';
import { GanttChart } from './components/GanttChart.tsx';
import { ChatSidebar, type ChatMessage } from './components/ChatSidebar.tsx';
import { useTasks } from './hooks/useTasks.ts';
import { useWebSocket, type ServerMessage } from './hooks/useWebSocket.ts';
import type { Task } from './types.ts';

let msgCounter = 0;

export default function App() {
  const { tasks, setTasks, loading, error } = useTasks();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [aiThinking, setAiThinking] = useState(false);

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

  if (error) {
    return (
      <div style={{ padding: 20, color: 'red' }}>
        Failed to load tasks: {error}. Is the server running on :3000?
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {loading ? (
          <div style={{ padding: 20 }}>Loading...</div>
        ) : (
          <GanttChart tasks={tasks} onChange={setTasks} />
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
