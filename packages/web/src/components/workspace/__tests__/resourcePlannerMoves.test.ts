import { describe, expect, it } from 'vitest';
import type { ResourceTimelineMove } from 'gantt-lib';

import type { ResourcePlannerTimelineItem } from '../resourcePlannerAdapter.ts';
import {
  buildReplacementResourceIds,
  classifyResourcePlannerMove,
  normalizePlannerMoveDate,
} from '../resourcePlannerMoves.ts';

function item(overrides: Partial<ResourcePlannerTimelineItem> = {}): ResourcePlannerTimelineItem {
  return {
    id: 'assignment-1',
    resourceId: 'resource-1',
    taskId: 'task-1',
    title: 'Install',
    startDate: '2026-04-01',
    endDate: '2026-04-03',
    metadata: {
      source: 'resource-planner-result',
      projectId: 'project-1',
      projectName: 'Project 1',
      taskId: 'task-1',
      assignmentId: 'assignment-1',
      resourceId: 'resource-1',
      resourceName: 'Crew',
      hasConflict: false,
      conflictCount: 0,
      conflictAssignmentIds: [],
      assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

function move(overrides: Partial<ResourceTimelineMove<ResourcePlannerTimelineItem>> = {}): ResourceTimelineMove<ResourcePlannerTimelineItem> {
  const baseItem = item();
  return {
    item: baseItem,
    itemId: baseItem.id,
    fromResourceId: 'resource-1',
    toResourceId: 'resource-1',
    startDate: new Date(Date.UTC(2026, 3, 2)),
    endDate: new Date(Date.UTC(2026, 3, 4)),
    ...overrides,
  };
}

describe('resourcePlannerMoves', () => {
  it('normalizes Date payloads to UTC YYYY-MM-DD strings', () => {
    expect(normalizePlannerMoveDate(new Date('2026-04-02T23:30:00-08:00'))).toBe('2026-04-03');
    expect(normalizePlannerMoveDate('2026-04-04T12:30:00.000Z')).toBe('2026-04-04');
  });

  it('classifies a preserved-duration same-resource date move as move_task', () => {
    expect(classifyResourcePlannerMove(move())).toEqual({
      kind: 'date-only',
      itemId: 'assignment-1',
      taskId: 'task-1',
      assignmentId: 'assignment-1',
      fromResourceId: 'resource-1',
      toResourceId: 'resource-1',
      startDate: '2026-04-02',
      endDate: '2026-04-04',
      commands: [{ type: 'move_task', taskId: 'task-1', startDate: '2026-04-02' }],
    });
  });

  it('builds resize commands for start, end, and both-edge date changes', () => {
    expect(classifyResourcePlannerMove(move({
      startDate: new Date(Date.UTC(2026, 2, 31)),
      endDate: new Date(Date.UTC(2026, 3, 3)),
    }))).toMatchObject({
      kind: 'date-only',
      commands: [{ type: 'resize_task', taskId: 'task-1', anchor: 'start', date: '2026-03-31' }],
    });

    expect(classifyResourcePlannerMove(move({
      startDate: new Date(Date.UTC(2026, 3, 1)),
      endDate: new Date(Date.UTC(2026, 3, 5)),
    }))).toMatchObject({
      kind: 'date-only',
      commands: [{ type: 'resize_task', taskId: 'task-1', anchor: 'end', date: '2026-04-05' }],
    });

    expect(classifyResourcePlannerMove(move({
      startDate: new Date(Date.UTC(2026, 2, 31)),
      endDate: new Date(Date.UTC(2026, 3, 5)),
    }))).toMatchObject({
      kind: 'date-only',
      commands: [
        { type: 'resize_task', taskId: 'task-1', anchor: 'end', date: '2026-04-05' },
        { type: 'resize_task', taskId: 'task-1', anchor: 'start', date: '2026-03-31' },
      ],
    });
  });

  it('classifies resource-only and combined moves', () => {
    expect(classifyResourcePlannerMove(move({
      toResourceId: 'resource-2',
      startDate: new Date(Date.UTC(2026, 3, 1)),
      endDate: new Date(Date.UTC(2026, 3, 3)),
    }))).toMatchObject({
      kind: 'resource-only',
      commands: [],
      fromResourceId: 'resource-1',
      toResourceId: 'resource-2',
    });

    expect(classifyResourcePlannerMove(move({ toResourceId: 'resource-2' }))).toMatchObject({
      kind: 'combined',
      commands: [{ type: 'move_task', taskId: 'task-1', startDate: '2026-04-02' }],
      fromResourceId: 'resource-1',
      toResourceId: 'resource-2',
    });
  });

  it('classifies no-op moves without commands or reassignment', () => {
    expect(classifyResourcePlannerMove(move({
      startDate: new Date(Date.UTC(2026, 3, 1)),
      endDate: new Date(Date.UTC(2026, 3, 3)),
    }))).toEqual({
      kind: 'no-op',
      itemId: 'assignment-1',
      taskId: 'task-1',
      assignmentId: 'assignment-1',
      fromResourceId: 'resource-1',
      toResourceId: 'resource-1',
      startDate: '2026-04-01',
      endDate: '2026-04-03',
      commands: [],
    });
  });

  it('rejects locked items and missing typed metadata', () => {
    expect(classifyResourcePlannerMove(move({ item: item({ locked: true }) }))).toEqual({
      kind: 'rejected',
      reason: 'locked',
    });

    expect(classifyResourcePlannerMove(move({ item: { ...item(), metadata: null as unknown as ResourcePlannerTimelineItem['metadata'] } }))).toEqual({
      kind: 'rejected',
      reason: 'missing-metadata',
    });

    expect(classifyResourcePlannerMove(move({ item: item({ taskId: undefined, metadata: { ...item().metadata, taskId: '' } }) }))).toEqual({
      kind: 'rejected',
      reason: 'missing-task-id',
    });
  });

  it('replaces only the moved resource and dedupes while preserving other assignments', () => {
    expect(buildReplacementResourceIds(['resource-1', 'resource-3', 'resource-2'], 'resource-1', 'resource-2')).toEqual([
      'resource-2',
      'resource-3',
    ]);
  });
});
