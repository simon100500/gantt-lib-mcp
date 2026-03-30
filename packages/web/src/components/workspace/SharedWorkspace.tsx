import type { RefObject } from 'react';

import type { GanttChartRef } from '../GanttChart.tsx';
import { ProjectWorkspace } from './ProjectWorkspace.tsx';
import type { ValidationResult } from '../../types.ts';

interface SharedWorkspaceProps {
  ganttRef: RefObject<GanttChartRef | null>;
  displayConnected: boolean;
  onScrollToToday: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onValidation: (result: ValidationResult) => void;
  ganttDayMode: 'business' | 'calendar';
}

export function SharedWorkspace({
  ganttRef,
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
      hasShareToken={true}
      displayConnected={displayConnected}
      isAuthenticated={false}
      onLoginRequired={() => {}}
      onScrollToToday={onScrollToToday}
      onCollapseAll={onCollapseAll}
      onExpandAll={onExpandAll}
      onValidation={onValidation}
      ganttDayMode={ganttDayMode}
      readOnly
      showChat={false}
    />
  );
}
