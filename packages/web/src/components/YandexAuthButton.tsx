import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AuthSuccessResponse } from '../lib/apiTypes.ts';

const YANDEX_SDK_SRC = 'https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-with-polyfills-latest.js';
const PRODUCTION_ORIGIN = 'https://ai.getgantt.ru';

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

interface YandexAuthButtonProps {
  onSuccess: (result: AuthSuccessResponse) => void;
  onError: (message: string | null) => void;
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

let yandexSdkPromise: Promise<void> | null = null;

function getAppOrigin(): string {
  if (typeof window === 'undefined') {
    return PRODUCTION_ORIGIN;
  }

  const { origin, hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1' ? origin : PRODUCTION_ORIGIN;
}

function getCallbackUrl(): string {
  return new URL('/auth/yandex/callback', getAppOrigin()).toString();
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

export function YandexAuthButton({ onSuccess, onError }: YandexAuthButtonProps) {
  const [loading, setLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
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
        redirectUri,
      );

      const widgetResult = await handler();
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
      onError(error instanceof Error ? error.message : 'Не удалось выполнить вход через Яндекс');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size="lg"
      className="h-12 w-full bg-[#FC3F1D] text-white hover:bg-[#e53818]"
      onClick={() => void handleLogin()}
      disabled={loading || !sdkReady}
    >
      {loading ? 'Подключаем Яндекс…' : 'Войти через Яндекс'}
    </Button>
  );
}
