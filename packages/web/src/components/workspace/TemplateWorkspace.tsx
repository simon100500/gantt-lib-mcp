import type { RefObject } from 'react';
import type { GanttChartRef } from '../GanttChart.tsx';
import type { UseBatchTaskUpdateResult } from '../../hooks/useBatchTaskUpdate.ts';
import type { TemplateWorkspaceResponse } from '../../lib/apiTypes.ts';
import type { Task, ValidationResult } from '../../types.ts';
import { ProjectWorkspace } from './ProjectWorkspace.tsx';

interface TemplateWorkspaceProps {
  ganttRef: RefObject<GanttChartRef | null>;
  template: TemplateWorkspaceResponse | null;
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  loading: boolean;
  accessToken: string | null;
  batchUpdate: UseBatchTaskUpdateResult;
  onScrollToToday: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onValidation: (result: ValidationResult) => void;
}

export function TemplateWorkspace({
  ganttRef,
  template,
  tasks,
  setTasks,
  loading,
  accessToken,
  batchUpdate,
  onScrollToToday,
  onCollapseAll,
  onExpandAll,
  onValidation,
}: TemplateWorkspaceProps) {
  return (
    <ProjectWorkspace
      ganttRef={ganttRef}
      tasks={tasks}
      setTasks={setTasks}
      loading={loading}
      accessToken={null}
      sharedProject={null}
      shareToken={null}
      hasShareToken={false}
      displayConnected={true}
      isAuthenticated={false}
      batchUpdate={batchUpdate}
      onLoginRequired={() => {}}
      onScrollToToday={onScrollToToday}
      onCollapseAll={onCollapseAll}
      onExpandAll={onExpandAll}
      onValidation={onValidation}
      readOnly={false}
      showChat={false}
      ganttDayMode="calendar"
      displayGanttDayMode="calendar"
      showResourceAssignments={false}
      onExportPdf={undefined}
      onExportExcel={undefined}
      onGanttDayModeChange={undefined}
      previewState="idle"
      previewMessage={template ? null : 'Template not loaded'}
    />
  );
}
