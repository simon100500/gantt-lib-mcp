import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSidebarProps {
  messages: ChatMessage[];
  streaming: string;
  onSend: (text: string) => void;
  disabled: boolean;
  connected: boolean;
  loading?: boolean;
  onClose?: () => void;
}

const QUICK_CHIPS = ['Добавить задачу', 'Сдвинуть сроки', 'Связать задачи', 'Показать сводку'];

export function ChatSidebar({ messages, streaming, onSend, disabled, connected, loading, onClose }: ChatSidebarProps) {
  const [inputValue, setInputValue] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEmpty = messages.length === 0 && !streaming && !loading;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || disabled) return;
    onSend(text);
    setInputValue('');
  }

  function handleChip(chip: string) {
    setInputValue(chip);
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Header ───────────────────────────────── */}
      <div className="flex items-center gap-2.5 h-11 px-4 border-b border-slate-200 shrink-0">
        <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-slate-800">AI Ассистент</span>
        <span
          className={cn(
            'ml-auto w-2 h-2 rounded-full shrink-0 transition-colors',
            connected ? 'bg-emerald-500' : 'bg-amber-400',
          )}
          title={connected ? 'Подключено' : 'Переподключение…'}
        />
        {onClose && (
          <button
            onClick={onClose}
            className="ml-2 p-1 hover:bg-slate-100 rounded transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        )}
      </div>

      {/* ── Messages ─────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2.5">
        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center flex-1 text-center gap-3 py-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">AI Гант-ассистент</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Попросите создать или изменить расписание проекта
              </p>
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={cn('flex animate-fade-up motion-reduce:animate-none', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[86%] px-3 py-2 text-sm leading-relaxed rounded-xl',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-slate-100 text-slate-800 border border-slate-200 rounded-bl-sm',
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && !streaming && (
          <div className="flex justify-start animate-fade-up motion-reduce:animate-none">
            <div className="bg-slate-100 border border-slate-200 rounded-xl rounded-bl-sm px-3.5 py-3 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce motion-reduce:animate-none [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce motion-reduce:animate-none [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce motion-reduce:animate-none" />
            </div>
          </div>
        )}

        {/* Streaming partial response */}
        {streaming && (
          <div className="flex justify-start animate-fade-up motion-reduce:animate-none">
            <div className="max-w-[86%] px-3 py-2 text-sm leading-relaxed rounded-xl rounded-bl-sm bg-slate-100 text-slate-800 border border-slate-200">
              {streaming}
              <span className="inline-block w-0.5 h-3.5 bg-slate-500 ml-0.5 align-middle animate-pulse motion-reduce:animate-none" />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* ── Quick chips ──────────────────────────── */}
      {isEmpty && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {QUICK_CHIPS.map(chip => (
            <button
              key={chip}
              type="button"
              onClick={() => handleChip(chip)}
              disabled={disabled || !connected}
              className={cn(
                'text-[11px] px-2.5 py-1 rounded-full border border-slate-200 text-slate-500',
                'transition-colors hover:border-primary hover:text-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* ── Input area ───────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-200 shrink-0"
      >
        <input
          ref={inputRef}
          name="message"
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder={disabled ? 'AI думает…' : 'Сообщение AI…'}
          disabled={disabled || !connected}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            'flex-1 h-9 px-3 text-sm rounded-md',
            'border border-slate-200 bg-slate-50 placeholder:text-slate-400',
            'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-transparent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        />
        <button
          type="submit"
          disabled={disabled || !connected || !inputValue.trim()}
          aria-label="Send message"
          className={cn(
            'h-9 w-9 shrink-0 rounded-md bg-primary text-primary-foreground',
            'flex items-center justify-center',
            'transition-colors hover:bg-primary/90',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
