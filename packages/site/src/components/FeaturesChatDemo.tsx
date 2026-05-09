import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

type DemoScenario = {
  user: string;
  assistant: string;
  thinking: string;
};

type FeedMessage = {
  id: string;
  role: 'user' | 'assistant' | 'thinking';
  content: string;
};

const SCENARIOS: DemoScenario[] = [
  {
    user:
      'Разбить задачу «Монтаж гидроизоляционной мембраны» на подзадачи.\nИспользуй только этот явный список подзадач:\nМонтаж\nПролив',
    thinking: 'AI разбивает задачу на подзадачи...',
    assistant: 'Готово. Добавил 2 подзадачи: «Монтаж» и «Пролив».',
  },
  {
    user: 'Сдвинь фундамент на 7 дней и пересчитай зависимые работы.',
    thinking: 'AI пересчитывает цепочку работ...',
    assistant: 'Готово. Фундамент сдвинут на 7 дней, связанные работы пересчитаны.',
  },
  {
    user: 'Добавь этап электрики после штукатурки и до чистовой отделки.',
    thinking: 'AI встраивает новый этап в график...',
    assistant: 'Добавил этап «Электрика» и связал его с соседними работами.',
  },
];

const THINKING_DELAY_MS = 3000;
const PAUSE_AFTER_ASSISTANT_MS = 1500;
const PAUSE_BEFORE_NEXT_USER_MS = 400;
const USER_BUBBLE_APPEAR_MS = 420;
const ASSISTANT_BUBBLE_APPEAR_MS = 400;
const PAUSE_BEFORE_THINKING_MS = 800;
const MAX_FEED_MESSAGES = 8;

function makeMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function FeaturesChatDemo() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [feed, setFeed] = useState<FeedMessage[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewportRef.current) {
      return;
    }

    viewportRef.current.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [feed]);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];

    const schedule = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(() => {
        if (!cancelled) {
          callback();
        }
      }, delay);
      timers.push(timer);
    };

    const pushFullMessage = (
      role: FeedMessage['role'],
      text: string,
      delay: number,
      onDone?: () => void,
    ) => {
      const messageId = makeMessageId();
      setFeed((current) => [
        ...current.slice(-MAX_FEED_MESSAGES + 1),
        { id: messageId, role, content: text },
      ]);

      schedule(() => {
        onDone?.();
      }, delay);
    };

    const pushThinking = (text: string, onDone: () => void) => {
      const messageId = makeMessageId();
      setFeed((current) => [
        ...current.slice(-MAX_FEED_MESSAGES + 1),
        { id: messageId, role: 'thinking', content: text },
      ]);

      schedule(() => {
        setFeed((current) => current.filter((message) => message.id !== messageId));
        onDone();
      }, THINKING_DELAY_MS);
    };

    const runScenario = (index: number) => {
      const scenario = SCENARIOS[index] ?? SCENARIOS[0];

      pushFullMessage('user', scenario.user, USER_BUBBLE_APPEAR_MS, () => {
        schedule(() => {
          pushThinking(scenario.thinking, () => {
            pushFullMessage('assistant', scenario.assistant, ASSISTANT_BUBBLE_APPEAR_MS, () => {
              schedule(() => {
                const nextIndex = (index + 1) % SCENARIOS.length;
                setScenarioIndex(nextIndex);
              }, PAUSE_AFTER_ASSISTANT_MS);
            });
          });
        }, PAUSE_BEFORE_THINKING_MS);
      });
    };

    schedule(() => runScenario(scenarioIndex), PAUSE_BEFORE_NEXT_USER_MS);

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [scenarioIndex]);

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
      <div className="flex h-[460px] flex-col bg-white">
        <header className="flex min-h-12 items-center border-b border-slate-200 pl-4 pr-3">
          <span className="text-[12px] font-semibold tracking-tight text-slate-700">
            AI ассистент
          </span>
        </header>

        <div
          ref={viewportRef}
          className="flex-1 overflow-hidden px-4 py-4"
        >
          <div className="flex min-h-full flex-col justify-end gap-4">
            {feed.map((message) => (
              <div
                key={message.id}
                className={`flex animate-fade-up motion-reduce:animate-none ${message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
              >
                {message.role === 'thinking' ? (
                  <div className="flex items-center gap-2 rounded-lg rounded-bl-sm bg-transparent px-0 py-2.5">
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" />
                    </div>
                    <span className="text-sm text-slate-600">{message.content}</span>
                  </div>
                ) : (
                  <div
                    className={`max-w-[88%] whitespace-pre-wrap rounded-[18px] px-4 py-2.5 text-[14px] leading-7 text-slate-800 ${message.role === 'user'
                      ? 'rounded-br-md bg-[#dfeafe]'
                      : 'rounded-bl-md bg-slate-50'
                      }`}
                  >
                    {message.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <form className="flex items-end gap-2 border-t border-slate-200 bg-white px-3 py-3">
          <textarea
            readOnly
            rows={1}
            value=""
            placeholder="Что хотите сделать?"
            className="flex-1 resize-none overflow-hidden rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-relaxed placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            aria-label="Send message"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
