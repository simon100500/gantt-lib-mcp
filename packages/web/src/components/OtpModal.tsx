import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { AuthSuccessResponse } from '../lib/apiTypes.ts';
import { YandexAuthButton } from './YandexAuthButton.tsx';

interface OtpModalProps {
  onSuccess: (result: AuthSuccessResponse) => void;
  onClose: () => void;
  initialMethod?: 'yandex' | 'otp';
}

type Step = 'choice' | 'otp';

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

async function readErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  const raw = await res.text();

  if (!raw.trim()) {
    return `${fallback} (empty response, check backend on localhost:3000)`;
  }

  try {
    const data = JSON.parse(raw) as ApiErrorResponse;
    return data.error || data.message || fallback;
  } catch {
    return `${fallback}: ${raw.slice(0, 200)}`;
  }
}

export function OtpModal({ onSuccess, onClose, initialMethod = 'yandex' }: OtpModalProps) {
  const [step, setStep] = useState<Step>('choice');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentAttention, setConsentAttention] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStep('choice');
    setError(null);
  }, [initialMethod]);

  const ensureConsentAccepted = () => {
    if (consentAccepted) {
      setConsentAttention(false);
      return true;
    }

    setConsentAttention(true);
    return false;
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ensureConsentAccepted()) {
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Требуется email');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Неверный email адрес');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Failed to send code'));
      }

      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    const code = otp.replace(/\D/g, ''); // Remove non-digits

    if (code.length !== 6) {
      setError('Введите 6 цифр кода');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Invalid code'));
      }

      const result = await res.json() as AuthSuccessResponse;

      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
      setOtp('');
      otpInputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when all 6 digits are filled
  useEffect(() => {
    const cleanOtp = otp.replace(/\D/g, '');
    if (cleanOtp.length === 6 && !loading && step === 'otp') {
      verifyOtp();
    }
  }, [otp, step]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      {step === 'choice' ? (
        <Card className="relative w-[440px] max-w-[calc(100vw-2rem)] rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-slate-400 transition-colors hover:text-slate-600"
            aria-label="Закрыть"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <CardHeader className="space-y-3 pb-5">
            <CardTitle className="text-[28px] font-semibold tracking-[-0.03em] text-slate-950">Вход в ГетГант</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <YandexAuthButton
              onSuccess={onSuccess}
              onError={setError}
              onBeforeLogin={ensureConsentAccepted}
            />
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                {error}
              </div>
            )}
            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  или
                </span>
              </div>
            </div>
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-slate-700">Войти по почте</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className={cn(
                    "h-12 rounded-2xl border-slate-200 bg-white text-[15px]",
                    error && "border-destructive focus-visible:ring-destructive"
                  )}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoFocus={initialMethod === 'otp'}
                />
              </div>
              <label
                className={cn(
                  "flex items-start gap-3 rounded-2xl border bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 transition-colors hover:border-slate-300",
                  consentAttention
                    ? "border-red-300 bg-red-50/80"
                    : "border-slate-200",
                )}
              >
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(event) => {
                    setConsentAccepted(event.target.checked);
                    if (event.target.checked) {
                      setConsentAttention(false);
                      setError(null);
                    }
                  }}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span>
                  Я принимаю{' '}
                  <a href="https://getgantt.ru/privacy/" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                    Политику конфиденциальности
                  </a>{' '}
                  и{' '}
                  <a href="https://getgantt.ru/terms/" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                    Условия использования
                  </a>
                </span>
              </label>
              <Button
                type="submit"
                className="h-12 w-full rounded-2xl text-[15px] font-medium"
                size="lg"
                disabled={loading}
              >
                {loading ? 'Отправка...' : 'Получить код по почте'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="pt-0" />
        </Card>
      ) : (
        <div className="relative w-[440px] max-w-[calc(100vw-2rem)]">
          <Card className="relative w-full rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Закрыть"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <CardHeader className="space-y-2 pb-5">
              <CardTitle className="text-[28px] font-semibold tracking-[-0.03em] text-slate-950">Проверьте email</CardTitle>
              <CardDescription className="flex items-center gap-1 flex-wrap text-[15px] leading-6 text-slate-600">
                Мы отправили 6-значный код на {email}{' '}
                <button
                  onClick={() => setStep('choice')}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  (изменить)
                </button>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp" className="text-sm font-medium text-slate-700">Код подтверждения</Label>
                <Input
                  ref={otpInputRef}
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => {
                    // Only allow digits
                    const value = e.target.value.replace(/\D/g, '');
                    setOtp(value);
                  }}
                  className={cn(
                    "h-16 rounded-2xl border-slate-200 bg-slate-50 text-center !text-4xl font-mono tracking-[0.32em] py-4",
                    error && "border-destructive focus-visible:ring-destructive"
                  )}
                  disabled={loading}
                  autoFocus
                />
                {error && <p className="text-sm leading-6 text-destructive text-center">{error}</p>}
              </div>
              {!loading && (
                <p className="text-sm text-muted-foreground text-center">
                  Не получили?{' '}
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setStep('choice')}
                  >
                    Отправить снова
                  </button>
                </p>
              )}
              <button
                type="button"
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
                onClick={() => {
                  setOtp('');
                  setError(null);
                  setStep('choice');
                }}
              >
                Вернуться к выбору способа входа
              </button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
