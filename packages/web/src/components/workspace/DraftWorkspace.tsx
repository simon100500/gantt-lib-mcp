import { StartScreen, type StartScreenSendResult } from '../StartScreen.tsx';

interface DraftWorkspaceProps {
  isAuthenticated: boolean;
  onSend: (text: string) => StartScreenSendResult | Promise<StartScreenSendResult>;
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
      onSend={onSend}
      onEmptyChart={() => { void onEmptyChart(); }}
      isAuthenticated={isAuthenticated}
      onLoginRequired={onLoginRequired}
    />
  );
}
