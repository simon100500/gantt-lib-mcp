import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
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
      <nav className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6" aria-label="Хлебные крошки">
        <Button
          variant="outline"
          size="sm"
          asChild
          className="shrink-0 gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
        >
          <a href="/">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Главная
          </a>
        </Button>
        <span className="text-sm text-slate-400" aria-hidden="true">/</span>
        <span className="text-sm font-medium text-slate-900">Аккаунт</span>
        {children}
      </nav>
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
