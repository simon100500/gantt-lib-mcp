import type { RefObject } from 'react';

import type { GanttChartRef } from '../GanttChart.tsx';
import { StartScreen } from '../StartScreen.tsx';
import { ProjectWorkspace } from './ProjectWorkspace.tsx';
import type { UseBatchTaskUpdateResult } from '../../hooks/useBatchTaskUpdate.ts';
import { useTaskStore } from '../../stores/useTaskStore.ts';
import type { Task, ValidationResult } from '../../types.ts';

interface GuestWorkspaceProps {
  ganttRef: RefObject<GanttChartRef | null>;
  isAuthenticated: boolean;
  batchUpdate: UseBatchTaskUpdateResult;
  onSend: (text: string) => void | Promise<void>;
  onEmptyChart: () => void | Promise<void>;
  onLoginRequired: () => void;
  onScrollToToday: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onValidation: (result: ValidationResult) => void;
  onCascade: (shiftedTasks: Task[]) => void;
  shareStatus?: 'idle' | 'creating' | 'copied' | 'error';
  onCreateShareLink?: () => void;
  ganttDayMode: 'business' | 'calendar';
}

export function GuestWorkspace(props: GuestWorkspaceProps) {
  const tasks = useTaskStore((state) => state.tasks);
  const loading = useTaskStore((state) => state.loading);

  if (tasks.length === 0 && !loading) {
    return (
      <StartScreen
        onSend={(text) => { void props.onSend(text); }}
        onEmptyChart={() => { void props.onEmptyChart(); }}
        isAuthenticated={props.isAuthenticated}
        onLoginRequired={props.onLoginRequired}
      />
    );
  }

  return (
    <ProjectWorkspace
      ganttRef={props.ganttRef}
      hasShareToken={false}
      displayConnected={true}
      isAuthenticated={props.isAuthenticated}
      batchUpdate={props.batchUpdate}
      onLoginRequired={props.onLoginRequired}
      onScrollToToday={props.onScrollToToday}
      onCollapseAll={props.onCollapseAll}
      onExpandAll={props.onExpandAll}
      onValidation={props.onValidation}
      onCascade={props.onCascade}
      ganttDayMode={props.ganttDayMode}
      showChat={false}
      shareStatus={props.shareStatus}
      onCreateShareLink={props.onCreateShareLink}
    />
  );
}
