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
}

export function SharedWorkspace({
  ganttRef,
  displayConnected,
  onScrollToToday,
  onCollapseAll,
  onExpandAll,
  onValidation,
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
      readOnly
      showChat={false}
    />
  );
}
