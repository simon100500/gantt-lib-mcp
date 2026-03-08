import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface LoginButtonProps {
  onClick: () => void;
}

/**
 * Login button displayed in header for unauthenticated users.
 * Shows a login icon and "Войти" text.
 */
export function LoginButton({ onClick }: LoginButtonProps) {
  return (
    <Button
      variant="default"
      size="sm"
      onClick={onClick}
      className="h-7 text-xs gap-1.5"
    >
      <LogIn className="w-3.5 h-3.5" />
      Войти
    </Button>
  );
}
