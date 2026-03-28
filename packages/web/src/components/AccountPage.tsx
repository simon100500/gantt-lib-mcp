import { LoginButton } from './LoginButton';
import { Button } from './ui/button';
import { AccountBillingPage } from './AccountBillingPage';

interface AccountPageProps {
  isAuthenticated: boolean;
  userEmail?: string | null;
  onLoginRequired: () => void;
}

export function AccountPage({ isAuthenticated, userEmail, onLoginRequired }: AccountPageProps) {
  if (!isAuthenticated) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <a href="/" className="flex items-center gap-3 text-slate-900">
              <img src="/favicon.svg" alt="GetGantt" width="18" height="18" className="h-[18px] w-[18px]" />
              <span className="text-sm font-semibold tracking-tight">GetGantt Account</span>
            </a>
            <LoginButton onClick={onLoginRequired} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-12 sm:px-6">
          <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-900">Аккаунт</h1>
            <p className="mt-3 text-sm text-slate-600">
              Войдите, чтобы посмотреть текущий тариф, срок действия и историю платежей.
            </p>
            <div className="mt-6 flex justify-center">
              <LoginButton onClick={onLoginRequired} />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center gap-3 text-slate-900">
            <img src="/favicon.svg" alt="GetGantt" width="18" height="18" className="h-[18px] w-[18px]" />
            <span className="text-sm font-semibold tracking-tight">GetGantt Account</span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{userEmail}</span>
            <Button variant="outline" size="sm" onClick={() => { window.location.href = '/'; }}>
              В приложение
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <AccountBillingPage onClose={() => { window.location.href = '/'; }} />
      </div>
    </div>
  );
}
