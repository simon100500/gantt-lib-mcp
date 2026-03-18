import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
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
  isAuthenticated?: boolean;
  onLoginRequired?: () => void;
}

const QUICK_CHIPS = [
  "Добавить задачу",
  "Сдвинуть сроки",
  "Связать задачи",
  "Показать сводку",
];
const LOADING_PHRASES = [
  "Ищем техкарты",
  "Сортируем задачи",
  "Ставим дедлайны",
  "Проверяем зависимости",
  "Выравниваем график",
  "Собираем план работ",
];

export function ChatSidebar({
  messages,
  streaming,
  onSend,
  disabled,
  connected,
  loading,
  onClose,
  isAuthenticated = true,
  onLoginRequired,
}: ChatSidebarProps) {
  const [inputValue, setInputValue] = useState("");
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isEmpty = messages.length === 0 && !streaming && !loading;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!loading || streaming) {
      setLoadingPhraseIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingPhraseIndex((prev) => (prev + 1) % LOADING_PHRASES.length);
    }, 1800);

    return () => window.clearInterval(timer);
  }, [loading, streaming]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || disabled) return;
    if (!isAuthenticated) {
      onLoginRequired?.();
      return;
    }
    onSend(text);
    setInputValue("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    if (inputRef.current) inputRef.current.style.overflowY = "hidden";
  }

  function handleChip(chip: string) {
    setInputValue(chip + " ");
    inputRef.current?.focus();
  }

  function handleTextareaInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    el.style.height = "auto";
    const newHeight = el.scrollHeight;
    el.style.height = `${newHeight}px`;
    el.style.overflowY = newHeight > 120 ? "auto" : "hidden";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-3 min-h-12 px-4 bg-white border-b border-slate-200 shrink-0">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full transition-colors",
            connected ? "bg-emerald-500" : "bg-amber-400",
          )}
          title={connected ? "Подключено" : "Переподключение..."}
        />
        <span className="text-sm font-semibold tracking-tight text-slate-800">
          AI Ассистент
        </span>
        <span className="flex-1" />
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-slate-100"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3">
        {isEmpty && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">
                AI Гант-ассистент
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Попросите создать график с нуля или изменить отдельные задачи
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex animate-fade-up motion-reduce:animate-none",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[86%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                msg.role === "user"
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm border border-slate-200 bg-slate-100 text-slate-800",
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && !streaming && (
          <div className="flex justify-start animate-fade-up motion-reduce:animate-none">
            <div className="flex items-center gap-2 rounded-xl rounded-bl-sm border border-slate-200 bg-slate-100 px-3.5 py-3">
              <div className="flex shrink-0 items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce motion-reduce:animate-none [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce motion-reduce:animate-none [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce motion-reduce:animate-none" />
              </div>
              <span className="text-sm text-slate-600">
                {LOADING_PHRASES[loadingPhraseIndex]}
              </span>
            </div>
          </div>
        )}

        {streaming && (
          <div className="flex justify-start animate-fade-up motion-reduce:animate-none">
            <div className="max-w-[86%] rounded-xl rounded-bl-sm border border-slate-200 bg-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-800">
              {streaming}
              <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse align-middle bg-slate-500 motion-reduce:animate-none" />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {isEmpty && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleChip(chip)}
              className={cn(
                "rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500",
                "transition-colors hover:border-primary hover:text-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              )}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-end gap-2 border-t border-slate-200 px-3 py-2.5"
      >
        <textarea
          ref={inputRef}
          name="message"
          rows={1}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onInput={handleTextareaInput}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "AI думает..." : "Что хотите сделать?"}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          style={{ maxHeight: "7.5rem" }}
          className={cn(
            "flex-1 resize-none overflow-y-auto rounded-md px-3 py-2 text-sm leading-relaxed",
            "border border-slate-200 bg-slate-50 placeholder:text-slate-400",
            "transition-colors focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        <button
          type="submit"
          disabled={disabled || !inputValue.trim()}
          aria-label="Send message"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground",
            "transition-colors hover:bg-primary/90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
