import { LoginButton } from './LoginButton';
import { AccountBillingPage } from './AccountBillingPage';

interface AccountPageProps {
  isAuthenticated: boolean;
  userEmail?: string | null;
  onLoginRequired: () => void;
}

function PageHeader({ children }: { children: React.ReactNode }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
        <a href="/" className="flex items-center gap-3 text-slate-900">
          <img
            src="/favicon.svg"
            alt=""
            width="18"
            height="18"
            className="h-[18px] w-[18px]"
            aria-hidden="true"
          />
          <div>
            <div className="text-sm font-semibold tracking-tight">GetGantt</div>
          </div>
        </a>
        <span className="text-sm text-slate-400" aria-hidden="true">/</span>
        <span className="text-sm font-medium text-slate-900">Аккаунт</span>
        {children}
      </div>
    </header>
  );
}

export function AccountPage({ isAuthenticated, userEmail, onLoginRequired }: AccountPageProps) {
  if (!isAuthenticated) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-[#f4f5f7]">
        <PageHeader>
          <div className="ml-auto">
            <LoginButton onClick={onLoginRequired} />
          </div>
        </PageHeader>

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
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f4f5f7]">
      <PageHeader>
        <span className="ml-auto hidden text-sm text-slate-500 sm:inline">{userEmail}</span>
      </PageHeader>
      <div className="flex-1 overflow-hidden">
        <AccountBillingPage />
      </div>
    </div>
  );
}
