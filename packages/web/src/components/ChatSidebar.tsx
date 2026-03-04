import { useRef, useEffect } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSidebarProps {
  messages: ChatMessage[];
  streaming: string;        // Partial assistant response currently streaming
  onSend: (text: string) => void;
  disabled: boolean;
  connected: boolean;
}

export function ChatSidebar({ messages, streaming, onSend, disabled, connected }: ChatSidebarProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('message') as HTMLInputElement;
    const text = input.value.trim();
    if (!text || disabled) return;
    onSend(text);
    input.value = '';
  }

  const msgStyle = (role: string): React.CSSProperties => ({
    padding: '8px 12px',
    margin: '4px 8px',
    borderRadius: 8,
    maxWidth: '85%',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? '#4f9cf9' : '#f0f0f0',
    color: role === 'user' ? '#fff' : '#222',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
    fontSize: 14,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', fontWeight: 600 }}>
        AI Gantt Assistant
        <span style={{ float: 'right', fontSize: 12, color: connected ? '#22c55e' : '#ef4444' }}>
          {connected ? 'connected' : 'reconnecting...'}
        </span>
      </div>

      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
        {messages.length === 0 && !streaming && (
          <div style={{ padding: 20, color: '#888', textAlign: 'center', fontSize: 14 }}>
            Ask me to create a Gantt chart for your project.
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} style={msgStyle(msg.role)}>
            {msg.content}
          </div>
        ))}
        {/* Streaming partial response */}
        {streaming && (
          <div style={{ ...msgStyle('assistant'), opacity: 0.8 }}>
            {streaming}
            <span style={{ animation: 'pulse 1s infinite' }}>|</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input form */}
      <form
        onSubmit={handleSubmit}
        style={{ borderTop: '1px solid #e0e0e0', padding: 12, display: 'flex', gap: 8 }}
      >
        <input
          name="message"
          type="text"
          placeholder={disabled ? 'AI is thinking...' : 'Type a message...'}
          disabled={disabled || !connected}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #d0d0d0',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={disabled || !connected}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            background: '#4f9cf9',
            color: '#fff',
            border: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 14,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
