import type { ResourceTimelineItem } from 'gantt-lib';
import { describe, expect, it } from 'vitest';

import type { ResourcePlannerResult } from '../../../lib/apiTypes.ts';
import {
  getPlannerItemMetadata,
  mapResourcePlannerResultToTimelineResources,
} from '../resourcePlannerAdapter.ts';

const plannerResult: ResourcePlannerResult = {
  projectId: 'project-1',
  scope: 'all-projects',
  workspaceUserId: 'user-1',
  resources: [
    {
      resourceId: 'resource-1',
      resourceName: 'Shared Designer',
      hasConflicts: true,
      conflictCount: 2,
      intervals: [
        {
          assignmentId: 'assignment-1',
          resourceId: 'resource-1',
          resourceName: 'Shared Designer',
          projectId: 'project-2',
          projectName: 'Project 2',
          taskId: 'task-2',
          taskName: 'Landing',
          startDate: '2026-04-01',
          endDate: '2026-04-03',
          assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
          hasConflict: true,
          conflictCount: 1,
          conflictAssignmentIds: ['assignment-3'],
        },
      ],
    },
    {
      resourceId: 'resource-empty',
      resourceName: 'Empty Crane',
      hasConflicts: false,
      conflictCount: 0,
      intervals: [],
    },
  ],
};

describe('resourcePlannerAdapter', () => {
  it('maps planner resources and intervals into gantt-lib resource rows', () => {
    const resources = mapResourcePlannerResultToTimelineResources(plannerResult);

    expect(resources).toHaveLength(2);
    expect(resources[0]).toMatchObject({
      id: 'resource-1',
      name: 'Shared Designer',
    });
    expect(resources[0]?.items[0]).toMatchObject({
      id: 'assignment-1',
      resourceId: 'resource-1',
      taskId: 'task-2',
      title: 'Landing',
      subtitle: 'Project 2',
      startDate: '2026-04-01',
      endDate: '2026-04-03',
    });
  });

  it('preserves empty resources as visible resource planner rows', () => {
    const resources = mapResourcePlannerResultToTimelineResources(plannerResult);

    expect(resources[1]).toEqual({
      id: 'resource-empty',
      name: 'Empty Crane',
      items: [],
    });
  });

  it('carries conflict and correction metadata through a typed helper', () => {
    const item = mapResourcePlannerResultToTimelineResources(plannerResult)[0]?.items[0];

    expect(item).toBeDefined();
    const metadata = getPlannerItemMetadata(item);

    expect(metadata).toEqual({
      source: 'resource-planner-result',
      projectId: 'project-2',
      projectName: 'Project 2',
      taskId: 'task-2',
      assignmentId: 'assignment-1',
      resourceId: 'resource-1',
      resourceName: 'Shared Designer',
      hasConflict: true,
      conflictCount: 1,
      conflictAssignmentIds: ['assignment-3'],
      assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
    });
  });

  it('rejects unknown or non-resource-planner metadata', () => {
    const unknownItem: ResourceTimelineItem = {
      id: 'assignment-unknown',
      resourceId: 'resource-1',
      taskId: 'task-1',
      title: 'Unknown',
      startDate: '2026-04-01',
      endDate: '2026-04-02',
      metadata: {
        source: 'other',
        projectId: 'project-1',
      },
    };

    expect(getPlannerItemMetadata(unknownItem)).toBeNull();
    expect(getPlannerItemMetadata({ ...unknownItem, metadata: null })).toBeNull();
  });
});
