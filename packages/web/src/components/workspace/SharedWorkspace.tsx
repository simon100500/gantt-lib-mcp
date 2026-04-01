import type { RefObject } from 'react';

import type { GanttChartRef } from '../GanttChart.tsx';
import { ProjectWorkspace } from './ProjectWorkspace.tsx';
import type { SharedTaskProject } from '../../stores/useTaskStore.ts';
import type { Task, ValidationResult } from '../../types.ts';

interface SharedWorkspaceProps {
  ganttRef: RefObject<GanttChartRef | null>;
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  loading: boolean;
  sharedProject: SharedTaskProject | null;
  shareToken: string | null;
  displayConnected: boolean;
  onScrollToToday: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onValidation: (result: ValidationResult) => void;
  ganttDayMode: 'business' | 'calendar';
}

export function SharedWorkspace({
  ganttRef,
  tasks,
  setTasks,
  loading,
  sharedProject,
  shareToken,
  displayConnected,
  onScrollToToday,
  onCollapseAll,
  onExpandAll,
  onValidation,
  ganttDayMode,
}: SharedWorkspaceProps) {
  return (
    <ProjectWorkspace
      ganttRef={ganttRef}
      tasks={tasks}
      setTasks={setTasks}
      loading={loading}
      sharedProject={sharedProject}
      shareToken={shareToken}
      hasShareToken={true}
      displayConnected={displayConnected}
      isAuthenticated={false}
      onLoginRequired={() => {}}
      onScrollToToday={onScrollToToday}
      onCollapseAll={onCollapseAll}
      onExpandAll={onExpandAll}
      onValidation={onValidation}
      ganttDayMode={ganttDayMode}
      calendarDays={sharedProject?.calendarDays ?? []}
      readOnly
      showChat={false}
    />
  );
}
