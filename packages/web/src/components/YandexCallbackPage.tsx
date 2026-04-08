import { useEffect, useState } from 'react';

const YANDEX_TOKEN_SDK_SRC = 'https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-token-with-polyfills-latest.js';

declare global {
  interface Window {
    YaSendSuggestToken?: (origin: string, extraData?: Record<string, unknown>) => void;
  }
}

let yandexTokenSdkPromise: Promise<void> | null = null;

function readAccessTokenFromLocation(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(window.location.search);

  const token = hashParams.get('access_token') ?? queryParams.get('access_token');
  return token?.trim() || null;
}

function getAppOrigin(): string {
  if (typeof window === 'undefined') {
    throw new Error('Yandex callback is only available in the browser');
  }

  return window.location.origin;
}

function ensureYandexTokenSdk(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Yandex callback is only available in the browser'));
  }

  if (window.YaSendSuggestToken) {
    return Promise.resolve();
  }

  if (yandexTokenSdkPromise) {
    return yandexTokenSdkPromise;
  }

  yandexTokenSdkPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-yandex-sdk="token"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Не удалось загрузить callback SDK')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = YANDEX_TOKEN_SDK_SRC;
    script.async = true;
    script.dataset.yandexSdk = 'token';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Не удалось загрузить callback SDK'));
    document.head.appendChild(script);
  }).finally(() => {
    if (!window.YaSendSuggestToken) {
      yandexTokenSdkPromise = null;
    }
  });

  return yandexTokenSdkPromise;
}

export function YandexCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void ensureYandexTokenSdk()
      .then(() => {
        if (!window.YaSendSuggestToken) {
          throw new Error('Yandex callback helper недоступен');
        }

        const accessToken = readAccessTokenFromLocation();
        if (accessToken && window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              source: 'gantt-yandex-auth',
              accessToken,
            },
            getAppOrigin(),
          );
        }

        window.YaSendSuggestToken(getAppOrigin(), {
          source: 'yandex-suggest',
        });
        window.setTimeout(() => {
          window.close();
        }, 800);
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : 'Не удалось вернуть токен в приложение');
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white">
      <div className="max-w-md space-y-3 rounded-3xl border border-white/10 bg-white/5 px-8 py-10 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.32em] text-white/50">Yandex Auth</p>
        <h1 className="text-2xl font-semibold">Возвращаем вас в приложение</h1>
        <p className="text-sm text-white/70">
          {error ?? 'Подтверждаем вход, отправляем токен в основное окно и закрываем эту вкладку.'}
        </p>
      </div>
    </div>
  );
}
