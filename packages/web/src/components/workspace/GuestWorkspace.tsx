import type { RefObject } from 'react';

import type { GanttChartRef } from '../GanttChart.tsx';
import { StartScreen, type StartScreenSendResult } from '../StartScreen.tsx';
import { ProjectWorkspace } from './ProjectWorkspace.tsx';
import type { UseBatchTaskUpdateResult } from '../../hooks/useBatchTaskUpdate.ts';
import type { Task, ValidationResult } from '../../types.ts';

interface GuestWorkspaceProps {
  ganttRef: RefObject<GanttChartRef | null>;
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  loading: boolean;
  isAuthenticated: boolean;
  batchUpdate: UseBatchTaskUpdateResult;
  onSend: (text: string) => StartScreenSendResult | Promise<StartScreenSendResult>;
  onEmptyChart: () => void | Promise<void>;
  onLoginRequired: () => void;
  onScrollToToday: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  isExportExcelLoading?: boolean;
  onValidation: (result: ValidationResult) => void;
  onCascade: (shiftedTasks: Task[]) => void;
  shareStatus?: 'idle' | 'creating' | 'copied' | 'error';
  onCreateShareLink?: () => void;
  ganttDayMode: 'business' | 'calendar';
}

export function GuestWorkspace(props: GuestWorkspaceProps) {
  if (props.tasks.length === 0 && !props.loading) {
    return (
      <StartScreen
        onSend={props.onSend}
        onEmptyChart={() => { void props.onEmptyChart(); }}
        isAuthenticated={props.isAuthenticated}
        onLoginRequired={props.onLoginRequired}
      />
    );
  }

  return (
    <ProjectWorkspace
      ganttRef={props.ganttRef}
      tasks={props.tasks}
      setTasks={props.setTasks}
      loading={props.loading}
      sharedProject={null}
      shareToken={null}
      hasShareToken={false}
      displayConnected={true}
      isAuthenticated={props.isAuthenticated}
      batchUpdate={props.batchUpdate}
      onLoginRequired={props.onLoginRequired}
      onScrollToToday={props.onScrollToToday}
      onCollapseAll={props.onCollapseAll}
      onExpandAll={props.onExpandAll}
      onExportPdf={props.onExportPdf}
      onExportExcel={props.onExportExcel}
      isExportExcelLoading={props.isExportExcelLoading}
      onValidation={props.onValidation}
      onCascade={props.onCascade}
      ganttDayMode={props.ganttDayMode}
      calendarDays={[]}
      showChat={false}
      shareStatus={props.shareStatus}
      onCreateShareLink={props.onCreateShareLink}
    />
  );
}
