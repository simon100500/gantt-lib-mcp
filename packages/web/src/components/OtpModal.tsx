import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface OtpModalProps {
  onSuccess: (result: {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string };
    project: { id: string; name: string };
  }) => void;
  onClose: () => void;
}

type Step = 'email' | 'otp';

async function readErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  const raw = await res.text();

  if (!raw.trim()) {
    return `${fallback} (empty response, check backend on localhost:3000)`;
  }

  try {
    const data = JSON.parse(raw) as { error?: string; message?: string };
    return data.error || data.message || fallback;
  } catch {
    return `${fallback}: ${raw.slice(0, 200)}`;
  }
}

export function OtpModal({ onSuccess, onClose }: OtpModalProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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

      const result = await res.json() as {
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string };
        project: { id: string; name: string };
      };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {step === 'email' ? (
        <Card className="w-[420px] max-w-[calc(100vw-2rem)] shadow-2xl border-0 rounded-2xl relative" onClick={(e) => e.stopPropagation()}>
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
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-semibold">Вход в Gantt</CardTitle>
            <CardDescription>Введите email для получения кода</CardDescription>
          </CardHeader>
          <form onSubmit={handleRequestOtp}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email адрес</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className={cn(
                    "h-11",
                    error && "border-destructive focus-visible:ring-destructive"
                  )}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading}
              >
                {loading ? 'Отправка...' : 'Отправить код'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      ) : (
        <div className="relative w-[420px] max-w-[calc(100vw-2rem)]">
          <Card className="w-full shadow-2xl border-0 rounded-2xl relative" onClick={(e) => e.stopPropagation()}>
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
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl font-semibold">Проверьте email</CardTitle>
              <CardDescription className="flex items-center gap-1 flex-wrap">
                Мы отправили 6-значный код на {email}{' '}
                <button
                  onClick={() => setStep('email')}
                  className="text-primary hover:underline text-sm"
                >
                  (изменить)
                </button>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp">Код подтверждения</Label>
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
                    "h-14 text-center !text-4xl font-mono tracking-widest py-4",
                    error && "border-destructive focus-visible:ring-destructive"
                  )}
                  disabled={loading}
                  autoFocus
                />
                {error && <p className="text-sm text-destructive text-center">{error}</p>}
              </div>
              {!loading && (
                <p className="text-sm text-muted-foreground text-center">
                  Не получили?{' '}
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setStep('email')}
                  >
                    Отправить снова
                  </button>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
