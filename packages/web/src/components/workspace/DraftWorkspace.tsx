import { StartScreen, type StartScreenSendResult } from '../StartScreen.tsx';

interface DraftWorkspaceProps {
  isAuthenticated: boolean;
  onSend: (text: string) => StartScreenSendResult | Promise<StartScreenSendResult>;
  onEmptyChart: () => void | Promise<void>;
  onImport?: () => void;
  onLoginRequired: () => void;
}

export function DraftWorkspace({
  isAuthenticated,
  onSend,
  onEmptyChart,
  onImport,
  onLoginRequired,
}: DraftWorkspaceProps) {
  return (
    <StartScreen
      onSend={onSend}
      onEmptyChart={() => { void onEmptyChart(); }}
      onImport={onImport}
      isAuthenticated={isAuthenticated}
      onLoginRequired={onLoginRequired}
    />
  );
}
