import { useEffect, useState } from 'react';
import { buildAppProjectIntentUrl } from '../lib/utils';

const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 4000;
const PLACEHOLDER = 'Например: нужен график ремонта офиса 250 м2 в 2 этапа, с демонтажом, инженерией, чистовой отделкой и запуском за 90 дней';

interface HomepagePromptRedirectProps {
  apiBaseUrl: string;
  selectedPrompt?: string;
}

export function HomepagePromptRedirect({ apiBaseUrl, selectedPrompt }: HomepagePromptRedirectProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPrompt) {
      return;
    }
    setError(null);
    setText(selectedPrompt);
  }, [selectedPrompt]);

  const startRedirect = async () => {
    const trimmedText = text.trim();
    if (loading) {
      return;
    }
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
    <div className="relative w-full rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-6">
      <div className="flex flex-col gap-4">
        <textarea
          value={text}
          onChange={(event) => {
            if (error) {
              setError(null);
            }
            setText(event.target.value);
          }}
          placeholder={PLACEHOLDER}
          rows={5}
          maxLength={MAX_TEXT_LENGTH}
          disabled={loading}
          className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm leading-6 text-slate-900 outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
        />

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="flex justify-start">
          <button
            type="button"
            onClick={startRedirect}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            {loading ? 'Подготавливаем...' : 'Создать график'}
          </button>
        </div>
      </div>
    </div>
  );
}
