import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, GitCommitHorizontal, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPhraseIterator } from "@/lib/loadingPhrases";
import type { SubscriptionStatus, UsageStatus } from "../stores/useBillingStore.ts";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  requestContextId?: string | null;
  historyGroupId?: string | null;
  checkpointLabel?: string | null;
  canPreviewHistory?: boolean;
  canRestoreHistory?: boolean;
  previewLoading?: boolean;
  restoreLoading?: boolean;
}

interface ChatSidebarProps {
  messages: ChatMessage[];
  streaming: string;
  onSend: (text: string) => void;
  disabled: boolean;
  connected: boolean;
  usage?: UsageStatus | SubscriptionStatus | null;
  disabledReason?: string | null;
  loading?: boolean;
  onClose?: () => void;
  onShowChart?: () => void;
  showChartButton?: boolean;
  isAuthenticated?: boolean;
  onLoginRequired?: () => void;
  onPreviewHistory?: (groupId: string) => void;
  onRestoreHistory?: (groupId: string) => void;
  onReturnToCurrentVersion?: () => void;
  showReturnToCurrentVersion?: boolean;
  activePreviewGroupId?: string | null;
}

const QUICK_CHIPS = [
  "Добавить задачу",
  "Сдвинуть сроки",
  "Связать задачи",
  "Показать сводку",
];

export function ChatSidebar({
  messages,
  streaming,
  onSend,
  disabled,
  connected,
  usage,
  disabledReason,
  loading,
  onClose,
  onShowChart,
  showChartButton = false,
  isAuthenticated = true,
  onLoginRequired,
  onPreviewHistory,
  onRestoreHistory,
  onReturnToCurrentVersion,
  showReturnToCurrentVersion = false,
  activePreviewGroupId = null,
}: ChatSidebarProps) {
  const [inputValue, setInputValue] = useState("");
  const [currentPhrase, setCurrentPhrase] = useState("");
  const [pendingApplyMessage, setPendingApplyMessage] = useState<ChatMessage | null>(null);
  const phraseIteratorRef = useRef(createPhraseIterator());
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isEmpty = messages.length === 0 && !streaming && !loading;
  const resolvedDisabledReason = disabledReason ?? (disabled ? "Assistant думает…" : null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!loading || streaming) {
      phraseIteratorRef.current.reset();
      setCurrentPhrase("");
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentPhrase(phraseIteratorRef.current.next());
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

  function handleApplyHistory(message: ChatMessage) {
    if (!message.historyGroupId || !onRestoreHistory) {
      return;
    }

    onRestoreHistory(message.historyGroupId);
    setPendingApplyMessage(null);
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex min-h-10 items-center gap-2 border-b border-slate-200 bg-white pl-4 pr-3 shrink-0">
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
            connected ? "bg-emerald-500" : "bg-amber-400",
          )}
          title={connected ? "Подключено" : "Переподключение..."}
        />
        <span className="text-[12px] font-medium tracking-tight text-slate-600">
          Ассистент
        </span>
        <span className="flex-1" />
        {onClose && (
          <>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 md:hidden"
              aria-label="К графику"
            >
              <span>К графику</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="hidden rounded-md p-1 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 md:inline-flex"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </>
        )}
      </header>

      {pendingApplyMessage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPendingApplyMessage(null);
            }
          }}
        >
          <div
            className="w-[480px] max-w-[calc(100vw-2rem)] rounded-xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <TriangleAlert className="h-6 w-6 shrink-0 text-amber-500" />
              <h2 className="text-lg font-semibold text-slate-800">Откатиться к этой версии?</h2>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-700">
              Проект будет возвращен к состоянию, которое вы сейчас просматриваете. Это сообщение и более поздние сообщения в чате будут скрыты.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingApplyMessage(null)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => handleApplyHistory(pendingApplyMessage)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Откатиться
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        role="region"
        aria-label="Сообщения AI ассистента"
        aria-live="polite"
        className="flex flex-1 flex-col gap-2 overflow-y-auto pl-4 pr-3 py-3"
      >
        {isEmpty && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <Sparkles className="h-4 w-4 text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">
                Помощник по проекту
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Попросите создать график с нуля или изменить отдельные задачи.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="animate-fade-up motion-reduce:animate-none">
            {msg.role === "user" && msg.historyGroupId && msg.checkpointLabel && (
              <div className="mb-2 w-full">
                <div
                  className={cn(
                    "w-full",
                    msg.historyGroupId === activePreviewGroupId && "rounded-b-md border-t-2 border-primary bg-slate-50",
                  )}
                >
                  <div
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1 text-[12px] text-slate-500 transition-colors",
                      msg.canPreviewHistory && "cursor-pointer hover:bg-slate-100 hover:text-slate-700",
                      msg.historyGroupId === activePreviewGroupId && "text-slate-900",
                      (msg.previewLoading || msg.restoreLoading) && "opacity-70",
                    )}
                    onClick={() => {
                      if (msg.canPreviewHistory && msg.historyGroupId !== activePreviewGroupId) {
                        onPreviewHistory?.(msg.historyGroupId!);
                      }
                    }}
                    role={msg.canPreviewHistory && msg.historyGroupId !== activePreviewGroupId ? "button" : undefined}
                    tabIndex={msg.canPreviewHistory && msg.historyGroupId !== activePreviewGroupId ? 0 : undefined}
                    onKeyDown={(event) => {
                      if (
                        (event.key === "Enter" || event.key === " ")
                        && msg.canPreviewHistory
                        && msg.historyGroupId !== activePreviewGroupId
                      ) {
                        event.preventDefault();
                        onPreviewHistory?.(msg.historyGroupId!);
                      }
                    }}
                  >
                    <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0" />
                    <span>{msg.checkpointLabel}</span>
                  </div>
                  {msg.previewLoading && (
                    <div className="mt-1 px-2 pb-2 text-[11px] text-slate-500">
                      Загрузка версии...
                    </div>
                  )}
                  {msg.historyGroupId === activePreviewGroupId && (
                    <div className="flex items-center gap-2 px-2 pb-2">
                      {msg.canRestoreHistory && (
                        <button
                          type="button"
                          onClick={() => setPendingApplyMessage(msg)}
                          disabled={msg.restoreLoading || msg.previewLoading}
                          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                          {msg.restoreLoading ? "Откат..." : "Откатиться"}
                        </button>
                      )}
                      {onReturnToCurrentVersion && (
                        <button
                          type="button"
                          onClick={onReturnToCurrentVersion}
                          disabled={msg.restoreLoading || msg.previewLoading}
                          className="inline-flex h-8 flex-1 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-[12px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Отмена
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {msg.role === "system" ? (
              <div className="px-0 py-1 text-[12px] leading-relaxed text-slate-500">
                {msg.content}
              </div>
            ) : (
              <div
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[88%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed shadow-none",
                    msg.role === "user"
                      ? "rounded-br-sm bg-[#e7f0fe] text-slate-800"
                      : "rounded-bl-sm bg-slate-50 text-slate-800",
                  )}
                >
                  {msg.content}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && !streaming && (
          <div className="flex justify-start animate-fade-up motion-reduce:animate-none">
            <div className="flex items-center gap-2 rounded-lg rounded-bl-sm bg-transparent px-0 py-2.5">
              <div className="flex shrink-0 items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce motion-reduce:animate-none [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce motion-reduce:animate-none [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce motion-reduce:animate-none" />
              </div>
              <span className="text-sm text-slate-600">
                {currentPhrase || "Загружаем..."}
              </span>
            </div>
          </div>
        )}

        {streaming && (
          <div className="flex justify-start animate-fade-up motion-reduce:animate-none">
            <div className="max-w-[88%] rounded-lg rounded-bl-sm bg-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-600">
              {streaming}
              <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse align-middle bg-slate-500 motion-reduce:animate-none" />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {isEmpty && (
        <div className="flex flex-wrap gap-1.5 pl-4 pr-3 pb-2">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleChip(chip)}
              className={cn(
                "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500",
                "transition-colors hover:border-slate-300 hover:text-slate-700",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              )}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {resolvedDisabledReason && !loading && (
        <div className="shrink-0 border-t border-slate-200 bg-amber-50 px-3 py-2">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-xs text-amber-700">
              {resolvedDisabledReason}
            </p>
            {showReturnToCurrentVersion && onReturnToCurrentVersion && (
              <button
                type="button"
                onClick={onReturnToCurrentVersion}
                className="shrink-0 rounded-md border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                Вернуться к текущей
              </button>
            )}
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-end gap-2 border-t border-slate-200 bg-white pl-3 pr-3 py-2"
      >
        <textarea
          ref={inputRef}
          name="message"
          rows={1}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onInput={handleTextareaInput}
          onKeyDown={handleKeyDown}
          placeholder={resolvedDisabledReason ?? "Что хотите сделать?"}
          disabled={disabled}
          title={resolvedDisabledReason ?? undefined}
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
          title={resolvedDisabledReason ?? undefined}
          aria-disabled={disabled || !inputValue.trim()}
          aria-label="Send message"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground",
            "transition-colors hover:bg-primary/90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:bg-primary/50",
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
