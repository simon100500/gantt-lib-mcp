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
  const helperText = useMemo(() => {
    if (!text.length) {
      return '';
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
      <div className="mx-auto flex max-w-3xl flex-col items-center">
        <div className="max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-950 lg:text-5xl">
            Не нашли нужный шаблон?
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-700">
            Опишите проект и получите готовый план проекта
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 w-full rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.08)] sm:p-5 md:p-6">
          <textarea
            id="template-custom-request"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={PLACEHOLDER}
            rows={6}
            maxLength={MAX_TEXT_LENGTH}
            disabled={loading}
            className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-70"
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
          <div className="mt-5 flex justify-center sm:justify-start">
            <button
              type="submit"
              className="inline-flex min-w-[168px] items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              {loading ? 'Подготавливаем...' : 'Получить план'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
