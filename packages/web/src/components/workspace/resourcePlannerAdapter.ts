import type { ResourceTimelineItem, ResourceTimelineResource } from 'gantt-lib';

import type { ResourcePlannerInterval, ResourcePlannerResult } from '../../lib/apiTypes.ts';

export interface ResourcePlannerItemMetadata {
  projectId: string;
  projectName: string;
  taskId: string;
  assignmentId: string;
  resourceId: string;
  resourceName: string;
  hasConflict: boolean;
  conflictCount: number;
  conflictAssignmentIds: string[];
  assignmentCreatedAt: string;
  source: 'resource-planner-result';
}

export interface ResourcePlannerTimelineItem extends ResourceTimelineItem {
  taskId: string;
  metadata: ResourcePlannerItemMetadata;
}

export type ResourcePlannerTimelineResource = ResourceTimelineResource<ResourcePlannerTimelineItem>;

function mapIntervalToTimelineItem(interval: ResourcePlannerInterval): ResourcePlannerTimelineItem {
  return {
    id: interval.assignmentId,
    resourceId: interval.resourceId,
    taskId: interval.taskId,
    title: interval.taskName,
    subtitle: interval.projectName,
    startDate: interval.startDate,
    endDate: interval.endDate,
    metadata: {
      source: 'resource-planner-result',
      projectId: interval.projectId,
      projectName: interval.projectName,
      taskId: interval.taskId,
      assignmentId: interval.assignmentId,
      resourceId: interval.resourceId,
      resourceName: interval.resourceName,
      hasConflict: interval.hasConflict,
      conflictCount: interval.conflictCount,
      conflictAssignmentIds: [...interval.conflictAssignmentIds],
      assignmentCreatedAt: interval.assignmentCreatedAt,
    },
  };
}

export function mapResourcePlannerResultToTimelineResources(
  result: ResourcePlannerResult,
): ResourcePlannerTimelineResource[] {
  return result.resources.map((resource) => ({
    id: resource.resourceId,
    name: resource.resourceName,
    items: resource.intervals.map((interval) => mapIntervalToTimelineItem(interval)),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isResourcePlannerItemMetadata(value: unknown): value is ResourcePlannerItemMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return value.source === 'resource-planner-result'
    && typeof value.projectId === 'string'
    && typeof value.projectName === 'string'
    && typeof value.taskId === 'string'
    && typeof value.assignmentId === 'string'
    && typeof value.resourceId === 'string'
    && typeof value.resourceName === 'string'
    && typeof value.hasConflict === 'boolean'
    && typeof value.conflictCount === 'number'
    && isStringArray(value.conflictAssignmentIds)
    && typeof value.assignmentCreatedAt === 'string';
}

export function getPlannerItemMetadata(
  item: Pick<ResourceTimelineItem, 'metadata'> | null | undefined,
): ResourcePlannerItemMetadata | null {
  if (!item || !isResourcePlannerItemMetadata(item.metadata)) {
    return null;
  }

  return item.metadata;
}
