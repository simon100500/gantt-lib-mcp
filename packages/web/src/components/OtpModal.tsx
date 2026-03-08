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
}

type Step = 'email' | 'otp';

export function OtpModal({ onSuccess }: OtpModalProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null));

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
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Failed to send code');
      }

      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    setError(null);
    const newDigits = [...digits];
    // Keep only the last character
    newDigits[index] = value.slice(-1);
    setDigits(newDigits);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      // Move focus to previous input and clear it
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    const pastedDigits = pastedData.replace(/\D/g, '').slice(0, 6);

    if (pastedDigits) {
      const newDigits = [...digits];
      for (let i = 0; i < pastedDigits.length; i++) {
        newDigits[i] = pastedDigits[i];
      }
      setDigits(newDigits);

      // Focus the last filled input or the next empty one
      const focusIndex = Math.min(pastedDigits.length, 5);
      inputRefs.current[focusIndex]?.focus();
    }
  };

  const verifyOtp = async () => {
    setError(null);
    const code = digits.join('');

    if (code.length !== 6) {
      setError('Введите все 6 цифр');
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
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Invalid code');
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
      // Clear digits and focus first input
      setDigits(Array(6).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when all 6 digits are filled
  useEffect(() => {
    if (digits.every(d => d !== '') && !loading) {
      verifyOtp();
    }
  }, [digits]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      {step === 'email' ? (
        <Card className="w-[420px] max-w-[calc(100vw-2rem)] shadow-2xl border-0 rounded-2xl">
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
        <>
          <button
            onClick={() => setStep('email')}
            className="text-sm text-primary hover:underline mb-4 flex items-center gap-1 relative z-10"
          >
            ← Изменить email
          </button>
          <Card className="w-[420px] max-w-[calc(100vw-2rem)] shadow-2xl border-0 rounded-2xl">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl font-semibold">Проверьте email</CardTitle>
              <CardDescription>Мы отправили 6-значный код на {email}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 justify-center my-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    pattern="[0-9]*"
                    value={digits[i]}
                    className={cn(
                      "w-12 h-[60px] text-center text-2xl font-bold p-0 [appearance:textfield]",
                      error && "border-destructive focus-visible:ring-destructive"
                    )}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={i === 0 ? handlePaste : undefined}
                    onFocus={(e) => e.target.select()}
                    disabled={loading}
                  />
                ))}
              </div>
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              {!loading && (
                <p className="text-sm text-muted-foreground text-center mt-3">
                  Не получили?{' '}
                  <button
                    className="text-primary hover:underline"
                    onClick={() => setStep('email')}
                  >
                    Отправить снова
                  </button>
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
