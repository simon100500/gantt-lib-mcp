import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AuthSuccessResponse } from '../lib/apiTypes.ts';

const YANDEX_SDK_SRC = 'https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-with-polyfills-latest.js';
const AUTH_TIMEOUT_MS = 60_000;

declare global {
  interface Window {
    YaAuthSuggest?: {
      init(
        oauthQueryParams: {
          client_id: string;
          response_type: 'token';
          redirect_uri: string;
        },
        tokenPageOrigin: string,
      ): Promise<{ handler: () => Promise<unknown> }>;
    };
  }
}

type YandexCallbackMessage = {
  source: 'gantt-yandex-auth';
  accessToken: string;
};

interface YandexAuthButtonProps {
  onSuccess: (result: AuthSuccessResponse) => void;
  onError: (message: string | null) => void;
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

interface YandexSdkErrorShape {
  code?: unknown;
  message?: unknown;
  description?: unknown;
  error?: unknown;
  error_description?: unknown;
  status?: unknown;
}

let yandexSdkPromise: Promise<void> | null = null;

function clearYandexSdkState(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const localKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && /(yandex|passport|\bya\b)/i.test(key)) {
        localKeys.push(key);
      }
    }
    localKeys.forEach((key) => window.localStorage.removeItem(key));

    const sessionKeys: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key && /(yandex|passport|\bya\b)/i.test(key)) {
        sessionKeys.push(key);
      }
    }
    sessionKeys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch (error) {
    console.warn('[YandexAuth] failed to clear SDK storage state', error);
  }
}

function getAppOrigin(): string {
  if (typeof window === 'undefined') {
    throw new Error('Yandex login is only available in the browser');
  }

  return window.location.origin;
}

function getCallbackUrl(): string {
  return new URL('/auth/yandex/callback', getAppOrigin()).toString();
}

function getTokenPageOrigin(): string {
  return new URL(getCallbackUrl()).origin;
}

function ensureYandexSdk(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Yandex login is only available in the browser'));
  }

  if (window.YaAuthSuggest) {
    return Promise.resolve();
  }

  if (yandexSdkPromise) {
    return yandexSdkPromise;
  }

  yandexSdkPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[data-yandex-sdk="suggest"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Не удалось загрузить Yandex SDK')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = YANDEX_SDK_SRC;
    script.async = true;
    script.dataset.yandexSdk = 'suggest';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Не удалось загрузить Yandex SDK'));
    document.head.appendChild(script);
  }).finally(() => {
    if (!window.YaAuthSuggest) {
      yandexSdkPromise = null;
    }
  });

  return yandexSdkPromise;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const raw = await response.text();
  if (!raw.trim()) {
    return fallback;
  }

  try {
    const data = JSON.parse(raw) as ApiErrorResponse;
    return data.error || data.message || fallback;
  } catch {
    return `${fallback}: ${raw.slice(0, 200)}`;
  }
}

function extractAccessToken(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as {
    access_token?: unknown;
    accessToken?: unknown;
    token?: unknown;
  };

  if (typeof candidate.access_token === 'string' && candidate.access_token.trim()) {
    return candidate.access_token.trim();
  }
  if (typeof candidate.accessToken === 'string' && candidate.accessToken.trim()) {
    return candidate.accessToken.trim();
  }
  if (typeof candidate.token === 'string' && candidate.token.trim()) {
    return candidate.token.trim();
  }

  return null;
}

function waitForCallbackToken(timeoutMs: number): Promise<{ access_token: string }> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Yandex login is only available in the browser'));
      return;
    }

    const expectedOrigin = getAppOrigin();
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      reject(new Error('Превышено время ожидания авторизации через Яндекс'));
    }, timeoutMs);

    function handleMessage(event: MessageEvent<unknown>) {
      if (event.origin !== expectedOrigin || !event.data || typeof event.data !== 'object') {
        return;
      }

      const payload = event.data as Partial<YandexCallbackMessage>;
      if (payload.source !== 'gantt-yandex-auth' || typeof payload.accessToken !== 'string' || !payload.accessToken.trim()) {
        return;
      }

      window.clearTimeout(timeoutId);
      window.removeEventListener('message', handleMessage);
      resolve({ access_token: payload.accessToken.trim() });
    }

    window.addEventListener('message', handleMessage);
  });
}

function normalizeYandexError(error: unknown): { message: string; rawMessage: string; code: string | null } {
  if (error instanceof Error) {
    return { message: error.message, rawMessage: error.message, code: null };
  }

  if (typeof error === 'string') {
    return { message: error, rawMessage: error, code: null };
  }

  if (error && typeof error === 'object') {
    const candidate = error as YandexSdkErrorShape;
    const code = typeof candidate.code === 'string' ? candidate.code : null;
    const parts = [
      code ? `code=${code}` : null,
      typeof candidate.message === 'string' ? candidate.message : null,
      typeof candidate.description === 'string' ? candidate.description : null,
      typeof candidate.error === 'string' ? candidate.error : null,
      typeof candidate.error_description === 'string' ? candidate.error_description : null,
      typeof candidate.status === 'string' || typeof candidate.status === 'number' ? `status=${candidate.status}` : null,
    ].filter(Boolean);

    const rawMessage = parts.join(' | ');
    if (rawMessage) {
      return { message: rawMessage, rawMessage, code };
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') {
        return { message: `Ошибка Яндекс SDK: ${serialized}`, rawMessage: serialized, code };
      }
    } catch {
      // ignore JSON serialization failure
    }
  }

  return {
    message: 'Не удалось выполнить вход через Яндекс',
    rawMessage: String(error ?? ''),
    code: null,
  };
}

export function YandexAuthButton({ onSuccess, onError }: YandexAuthButtonProps) {
  const [loading, setLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    clearYandexSdkState();
    void ensureYandexSdk()
      .then(() => setSdkReady(true))
      .catch((error) => {
        onError(error instanceof Error ? error.message : 'Не удалось загрузить вход через Яндекс');
      });
  }, [onError]);

  const handleLogin = async () => {
    const clientId = import.meta.env.VITE_YANDEX_CLIENT_ID?.trim();
    if (!clientId) {
      onError('VITE_YANDEX_CLIENT_ID не настроен');
      return;
    }

    try {
      setLoading(true);
      onError(null);
      clearYandexSdkState();

      await ensureYandexSdk();
      if (!window.YaAuthSuggest) {
        throw new Error('Yandex SDK не инициализирован');
      }

      const redirectUri = getCallbackUrl();
      const { handler } = await window.YaAuthSuggest.init(
        {
          client_id: clientId,
          response_type: 'token',
          redirect_uri: redirectUri,
        },
        getTokenPageOrigin(),
      );

      const widgetResult = await Promise.race([
        Promise.race([
          handler(),
          waitForCallbackToken(AUTH_TIMEOUT_MS),
        ]),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('Превышено время ожидания авторизации через Яндекс')), AUTH_TIMEOUT_MS);
        }),
      ]);
      const accessToken = extractAccessToken(widgetResult);
      if (!accessToken) {
        throw new Error('Яндекс не вернул access token');
      }

      const response = await fetch('/api/auth/yandex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось выполнить вход через Яндекс'));
      }

      onSuccess(await response.json() as AuthSuccessResponse);
    } catch (error) {
      console.error('[YandexAuth] login failed', error);
      const { message, rawMessage, code } = normalizeYandexError(error);
      if (code === 'denied' || message === 'denied' || rawMessage.includes('cancelled')) {
        onError(null);
        return;
      }
      if (code === 'in_progress') {
        onError('Окно авторизации Яндекса уже открыто. Завершите вход в нём или закройте его и попробуйте снова.');
        return;
      }
      if (code === 'not_available') {
        onError('Yandex ID недоступен в текущем окружении. Для локального запуска обычно нужно, чтобы `localhost` callback был добавлен в OAuth-приложение и браузер разрешал popup/cookies.');
        return;
      }
      onError(message || 'Не удалось выполнить вход через Яндекс');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size="lg"
      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-900 shadow-sm hover:bg-slate-50 hover:text-slate-900"
      onClick={() => void handleLogin()}
      disabled={loading || !sdkReady}
    >
      <img src="/Yandex_icon.svg" alt="" className="h-5 w-5" />
      <span>{loading ? 'Открываем Яндекс…' : 'Войти с Яндекс ID'}</span>
    </Button>
  );
}
