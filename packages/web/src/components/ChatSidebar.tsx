import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, ChartNoAxesGantt, GitCommitHorizontal, RotateCcw, Sparkles, Square, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPhraseIterator } from "@/lib/loadingPhrases";
import type { SubscriptionStatus, UsageStatus } from "../stores/useBillingStore.ts";
import { useUIStore } from "../stores/useUIStore.ts";

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
  onStop?: () => void | Promise<void>;
  onTaskReferenceClick?: (taskId: string) => void;
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

const TASK_REFERENCE_PATTERN = /\[task:([^|\]]+)\|([^\]]+)\]/g;

function renderMessageContent(content: string, onTaskReferenceClick?: (taskId: string) => void) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of content.matchAll(TASK_REFERENCE_PATTERN)) {
    const fullMatch = match[0];
    const taskId = match[1];
    const taskName = match[2];
    const start = match.index ?? 0;

    if (start > cursor) {
      parts.push(content.slice(cursor, start));
    }

    parts.push(
      <button
        key={`${taskId}-${start}`}
        type="button"
        onClick={() => onTaskReferenceClick?.(taskId)}
        className={cn(
          "mx-0.5 inline-flex max-w-full items-center rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 align-middle text-left text-[12px] font-medium text-sky-800 whitespace-normal break-words transition-colors",
          onTaskReferenceClick && "cursor-pointer hover:border-sky-300 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-1",
        )}
        title={`${taskName} (${taskId})`}
      >
        <span className="sr-only">{`${taskName} ${taskId}`}</span>
        <span>{taskName}</span>
      </button>,
    );

    cursor = start + fullMatch.length;
  }

  if (cursor === 0) {
    return content;
  }

  if (cursor < content.length) {
    parts.push(content.slice(cursor));
  }

  return parts;
}

export function ChatSidebar({
  messages,
  streaming,
  onSend,
  onStop,
  onTaskReferenceClick,
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
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [preferButtonSend, setPreferButtonSend] = useState(false);
  const chatComposerDraft = useUIStore((state) => state.chatComposerDraft);
  const clearChatComposerDraft = useUIStore((state) => state.clearChatComposerDraft);
  const [currentPhrase, setCurrentPhrase] = useState("");
  const [pendingApplyMessage, setPendingApplyMessage] = useState<ChatMessage | null>(null);
  const phraseIteratorRef = useRef(createPhraseIterator());
  const rootRef = useRef<HTMLDivElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isEmpty = messages.length === 0 && !streaming && !loading;
  const resolvedDisabledReason = disabledReason ?? (disabled ? "Assistant думает…" : null);
  const composerDisabled = disabled || loading;

  function resizeTextarea() {
    if (!inputRef.current) {
      return;
    }

    inputRef.current.style.height = "auto";
    const newHeight = inputRef.current.scrollHeight;
    inputRef.current.style.height = `${newHeight}px`;
    inputRef.current.style.overflowY = newHeight > 224 ? "auto" : "hidden";
  }

  function focusComposer(moveCursorToEnd = false) {
    if (!inputRef.current) {
      return;
    }

    inputRef.current.focus({ preventScroll: true });
    if (moveCursorToEnd) {
      const valueLength = inputRef.current.value.length;
      inputRef.current.setSelectionRange(valueLength, valueLength);
    }
  }

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
  }, [messages, streaming]);

  useEffect(() => {
    resizeTextarea();
  }, [inputValue]);

  useEffect(() => {
    if (!chatComposerDraft) {
      return;
    }

    setInputValue((current) => {
      if (!current.trim()) {
        return chatComposerDraft;
      }

      const separator = current.endsWith('\n') ? '\n' : '\n\n';
      return `${current}${separator}${chatComposerDraft}`;
    });
    window.requestAnimationFrame(() => {
      if (!inputRef.current) {
        return;
      }

      resizeTextarea();
      focusComposer(true);
      window.setTimeout(() => {
        resizeTextarea();
        focusComposer(true);
      }, 0);
    });
    clearChatComposerDraft();
  }, [chatComposerDraft, clearChatComposerDraft]);

  useEffect(() => {
    if (!loading || streaming) {
      phraseIteratorRef.current.reset();
      setCurrentPhrase("");
      return;
    }

    setCurrentPhrase((current) => current || phraseIteratorRef.current.next());

    const timer = window.setInterval(() => {
      setCurrentPhrase(phraseIteratorRef.current.next());
    }, 1800);

    return () => window.clearInterval(timer);
  }, [loading, streaming]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) {
      return;
    }

    const syncKeyboardInset = () => {
      const viewport = window.visualViewport;
      if (!viewport) {
        return;
      }

      const nextInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInset(nextInset);

      if (document.activeElement === inputRef.current) {
        window.requestAnimationFrame(() => {
          inputRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
        });
      }
    };

    syncKeyboardInset();
    window.visualViewport.addEventListener("resize", syncKeyboardInset);
    window.visualViewport.addEventListener("scroll", syncKeyboardInset);

    return () => {
      window.visualViewport?.removeEventListener("resize", syncKeyboardInset);
      window.visualViewport?.removeEventListener("scroll", syncKeyboardInset);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hasTouch =
      typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

    setPreferButtonSend(hasTouch || coarsePointer);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || composerDisabled) return;
    if (!isAuthenticated) {
      onLoginRequired?.();
      return;
    }
    onSend(text);
    setInputValue("");
    clearChatComposerDraft();
  }

  function handleChip(chip: string) {
    setInputValue(chip + " ");
    clearChatComposerDraft();
    inputRef.current?.focus();
  }

  function handleTextareaInput(e: React.FormEvent<HTMLTextAreaElement>) {
    resizeTextarea();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (preferButtonSend) {
      return;
    }

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
    <div
      ref={rootRef}
      className="flex h-full flex-col overflow-x-hidden bg-white"
      style={{ paddingBottom: keyboardInset > 0 ? `${keyboardInset}px` : undefined }}
    >
      <header className="flex min-h-12 items-center gap-2 border-b border-slate-200 bg-white pl-4 pr-3 shrink-0 md:min-h-10">
        <span className="text-[12px] font-semibold tracking-tight text-slate-700">
          AI ассистент
        </span>
        <span className="flex-1" />
        {onClose && (
          <>
            <button
              onClick={onClose}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 md:hidden"
              aria-label="К графику"
            >
              <ChartNoAxesGantt className="h-3.5 w-3.5" />
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
        ref={messagesViewportRef}
        role="region"
        aria-label="Сообщения AI ассистента"
        aria-live="polite"
        className="flex flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto pl-4 pr-3 py-3"
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
                    "max-w-[88%] overflow-hidden whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-relaxed shadow-none",
                    msg.role === "user"
                      ? "rounded-br-sm bg-[#e7f0fe] text-slate-800"
                      : "rounded-bl-sm bg-slate-50 text-slate-800",
                  )}
                >
                  {renderMessageContent(msg.content, onTaskReferenceClick)}
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
            <div className="max-w-[88%] overflow-hidden break-words rounded-lg rounded-bl-sm bg-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-600">
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
        className="flex shrink-0 items-end gap-2 border-t border-slate-200 bg-white pl-3 pr-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <textarea
          ref={inputRef}
          name="message"
          rows={1}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (chatComposerDraft) {
              clearChatComposerDraft();
            }
          }}
          onInput={handleTextareaInput}
          onKeyDown={handleKeyDown}
          placeholder={resolvedDisabledReason ?? "Что хотите сделать?"}
          disabled={composerDisabled}
          title={resolvedDisabledReason ?? undefined}
          autoComplete="off"
          spellCheck={false}
          style={{ maxHeight: "14rem" }}
          className={cn(
            "flex-1 resize-none overflow-y-auto rounded-md px-3 py-2 text-sm leading-relaxed",
            "border border-slate-200 bg-slate-50 placeholder:text-slate-400",
            "transition-colors focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        <button
          type={loading && onStop ? "button" : "submit"}
          onClick={loading && onStop ? () => { void onStop(); } : undefined}
          disabled={loading && onStop ? false : (composerDisabled || !inputValue.trim())}
          title={loading && onStop ? "Остановить AI-задачу" : (resolvedDisabledReason ?? undefined)}
          aria-disabled={loading && onStop ? false : (composerDisabled || !inputValue.trim())}
          aria-label={loading && onStop ? "Stop generation" : "Send message"}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground",
            "transition-colors hover:bg-primary/90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:bg-primary/50",
          )}
        >
          {loading && onStop ? <Square className="h-3.5 w-3.5 fill-current" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
