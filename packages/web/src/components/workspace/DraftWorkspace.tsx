import { StartScreen } from '../StartScreen.tsx';

interface DraftWorkspaceProps {
  isAuthenticated: boolean;
  onSend: (text: string) => void | Promise<void>;
  onEmptyChart: () => void | Promise<void>;
  onLoginRequired: () => void;
}

export function DraftWorkspace({
  isAuthenticated,
  onSend,
  onEmptyChart,
  onLoginRequired,
}: DraftWorkspaceProps) {
  return (
    <StartScreen
      onSend={(text) => { void onSend(text); }}
      onEmptyChart={() => { void onEmptyChart(); }}
      isAuthenticated={isAuthenticated}
      onLoginRequired={onLoginRequired}
    />
  );
}
