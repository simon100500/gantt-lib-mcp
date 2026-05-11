import { useMemo, useState } from 'react';
import { buildAppNewProjectUrl } from '../lib/utils';

const PLACEHOLDER = 'Например: нужен график ремонта офиса 250 м2 в 2 этапа, с демонтажом, инженерией, чистовой отделкой и запуском за 90 дней';

export function HomepagePromptRedirect() {
  const [text, setText] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  const appNewProjectUrl = useMemo(() => buildAppNewProjectUrl(), []);

  const startRedirect = () => {
    if (redirecting) {
      return;
    }
    setRedirecting(true);
    window.location.assign(appNewProjectUrl);
  };

  return (
    <div className="relative w-full rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-6">
      <div className="flex flex-col gap-4">
        <textarea
          value={text}
          onChange={(event) => {
            const nextValue = event.target.value;
            setText(nextValue);
            if (nextValue.trim().length > 0) {
              startRedirect();
            }
          }}
          onPaste={() => startRedirect()}
          placeholder={PLACEHOLDER}
          rows={6}
          className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Начните вводить описание и продолжите работу в сервисе GetGantt.
          </p>
          <a
            href={appNewProjectUrl}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Открыть сервис
          </a>
        </div>
      </div>
    </div>
  );
}
