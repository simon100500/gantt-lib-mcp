import { describe, expect, it } from 'vitest';

import type { ProjectResource } from '../../../lib/apiTypes.ts';
import type { ResourcePlannerTimelineResource } from '../resourcePlannerAdapter.ts';
import { filterResourceTimelineResources, type ResourcePlannerFilters } from '../resourcePlannerFilters.ts';

const catalogResources: ProjectResource[] = [
  {
    id: 'resource-human',
    userId: 'user-1',
    projectId: null,
    scope: 'shared',
    name: 'Design Team',
    type: 'human',
    isActive: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    deactivatedAt: null,
  },
  {
    id: 'resource-equipment',
    userId: 'user-1',
    projectId: null,
    scope: 'shared',
    name: 'Tower Crane',
    type: 'equipment',
    isActive: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    deactivatedAt: null,
  },
  {
    id: 'resource-inactive',
    userId: 'user-1',
    projectId: null,
    scope: 'shared',
    name: 'Inactive Welder',
    type: 'human',
    isActive: false,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    deactivatedAt: '2026-04-05T00:00:00.000Z',
  },
];

const timelineResources: ResourcePlannerTimelineResource[] = [
  {
    id: 'resource-human',
    name: 'Design Team',
    items: [
      {
        id: 'assignment-spec',
        resourceId: 'resource-human',
        taskId: 'task-spec',
        title: 'Spec Package',
        subtitle: 'Alpha Project',
        startDate: '2026-04-01',
        endDate: '2026-04-02',
        metadata: {
          source: 'resource-planner-result',
          projectId: 'project-alpha',
          projectName: 'Alpha Project',
          taskId: 'task-spec',
          assignmentId: 'assignment-spec',
          resourceId: 'resource-human',
          resourceName: 'Design Team',
          hasConflict: false,
          conflictCount: 0,
          conflictAssignmentIds: [],
          assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
        },
      },
    ],
  },
  {
    id: 'resource-equipment',
    name: 'Tower Crane',
    items: [
      {
        id: 'assignment-crane',
        resourceId: 'resource-equipment',
        taskId: 'task-crane',
        title: 'Lift Panels',
        subtitle: 'Beta Project',
        startDate: '2026-04-03',
        endDate: '2026-04-04',
        metadata: {
          source: 'resource-planner-result',
          projectId: 'project-beta',
          projectName: 'Beta Project',
          taskId: 'task-crane',
          assignmentId: 'assignment-crane',
          resourceId: 'resource-equipment',
          resourceName: 'Tower Crane',
          hasConflict: true,
          conflictCount: 1,
          conflictAssignmentIds: ['assignment-other'],
          assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
        },
      },
    ],
  },
  {
    id: 'resource-inactive',
    name: 'Inactive Welder',
    items: [],
  },
];

const baseFilters: ResourcePlannerFilters = {
  query: '',
  resourceTypes: [],
  conflictOnly: false,
  includeInactive: false,
};

describe('filterResourceTimelineResources', () => {
  it('matches query against resource, task, and project text case-insensitively', () => {
    expect(filterResourceTimelineResources(timelineResources, catalogResources, { ...baseFilters, query: 'design' }).map((resource) => resource.id)).toEqual(['resource-human']);
    expect(filterResourceTimelineResources(timelineResources, catalogResources, { ...baseFilters, query: 'lift' }).map((resource) => resource.id)).toEqual(['resource-equipment']);
    expect(filterResourceTimelineResources(timelineResources, catalogResources, { ...baseFilters, query: 'beta project' }).map((resource) => resource.id)).toEqual(['resource-equipment']);
  });

  it('filters resources by catalog type', () => {
    const result = filterResourceTimelineResources(timelineResources, catalogResources, {
      ...baseFilters,
      resourceTypes: ['equipment'],
    });

    expect(result.map((resource) => resource.id)).toEqual(['resource-equipment']);
  });

  it('keeps only conflicting resources and items in conflict-only mode', () => {
    const result = filterResourceTimelineResources(timelineResources, catalogResources, {
      ...baseFilters,
      conflictOnly: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('resource-equipment');
    expect(result[0]?.items.map((item) => item.id)).toEqual(['assignment-crane']);
  });

  it('hides inactive resources unless includeInactive is true', () => {
    expect(filterResourceTimelineResources(timelineResources, catalogResources, baseFilters).map((resource) => resource.id)).toEqual([
      'resource-human',
      'resource-equipment',
    ]);

    expect(filterResourceTimelineResources(timelineResources, catalogResources, { ...baseFilters, includeInactive: true }).map((resource) => resource.id)).toEqual([
      'resource-human',
      'resource-equipment',
      'resource-inactive',
    ]);
  });

  it('preserves empty resource rows when the resource matches resource filters', () => {
    const result = filterResourceTimelineResources(timelineResources, catalogResources, {
      ...baseFilters,
      query: 'inactive welder',
      includeInactive: true,
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'resource-inactive',
        items: [],
      }),
    ]);
  });
});
