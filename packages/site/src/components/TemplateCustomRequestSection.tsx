import { useMemo, useState } from 'react';
import { buildAppProjectIntentUrl } from '../lib/utils';

const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 4000;
const PLACEHOLDER = 'Например: нужен график ремонта офиса 250 м2 в 2 этапа, с демонтажом, инженерией, чистовой отделкой и запуском за 90 дней';

interface TemplateCustomRequestSectionProps {
  apiBaseUrl: string;
  templateSlug: string;
}

export function TemplateCustomRequestSection({
  apiBaseUrl,
  templateSlug,
}: TemplateCustomRequestSectionProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedText = text.trim();
  const remaining = MAX_TEXT_LENGTH - text.length;
  const submitDisabled = loading || trimmedText.length < MIN_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH;
  const helperText = useMemo(() => {
    if (!text.length) {
      return 'Следующий шаг откроется в GetGantt. Сам план будет создан уже внутри рабочего пространства.';
    }
    if (trimmedText.length < MIN_TEXT_LENGTH) {
      return `Добавьте ещё ${MIN_TEXT_LENGTH - trimmedText.length} символов, чтобы мы могли подготовить стартовый запрос.`;
    }
    return `Осталось ${Math.max(remaining, 0)} символов.`;
  }, [remaining, text.length, trimmedText.length]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (trimmedText.length < MIN_TEXT_LENGTH) {
      setError('Опишите проект, чтобы мы могли подготовить стартовый план.');
      return;
    }

    if (text.length > MAX_TEXT_LENGTH) {
      setError('Описание получилось слишком длинным. Сократите его и попробуйте ещё раз.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/public/project-intents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: trimmedText,
          source: 'site_custom_request',
          templateSlug,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json() as { intentId?: string };
      if (!payload.intentId) {
        throw new Error('intentId missing');
      }

      window.location.assign(buildAppProjectIntentUrl(payload.intentId));
    } catch (submitError) {
      console.error('Failed to create project intent', submitError);
      setError('Не удалось подготовить запрос. Попробуйте ещё раз.');
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 lg:pb-24">
      <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(97,88,224,0.16),_transparent_42%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(244,247,255,0.96))] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] md:p-8 lg:p-10">
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.12),_transparent_65%)] lg:block" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div className="max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
              Альтернативный сценарий
            </p>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 lg:text-4xl">
              Не нашли нужный шаблон?
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-700">
              Опишите проект и получите готовый план проекта
            </p>
            <p className="mt-5 max-w-lg text-sm leading-7 text-slate-500">
              Мы подготовим стартовый запрос и передадим его в GetGantt. Само создание проекта и генерация останутся внутри приложения.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="relative rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur sm:p-5">
            <label htmlFor="template-custom-request" className="text-sm font-semibold text-slate-900">
              Коротко опишите проект
            </label>
            <textarea
              id="template-custom-request"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={PLACEHOLDER}
              rows={6}
              maxLength={MAX_TEXT_LENGTH}
              disabled={loading}
              className="mt-3 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-70"
            />
            <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-slate-500">{helperText}</p>
              <p className={`font-medium ${remaining < 200 ? 'text-amber-600' : 'text-slate-400'}`}>
                {text.length}/{MAX_TEXT_LENGTH}
              </p>
            </div>
            {error ? (
              <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-6 text-slate-500">
                После входа в GetGantt вы создадите новый проект и продолжите с уже подготовленным запросом.
              </p>
              <button
                type="submit"
                disabled={submitDisabled}
                className="inline-flex min-w-[168px] items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Подготавливаем...' : 'Получить план'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
