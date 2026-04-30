import type { ResourceTimelineItem, ResourceTimelineResource } from 'gantt-lib';

import type { ProjectResource, ResourcePlannerInterval, ResourcePlannerResult, ResourceScope, ResourceType, TaskAssignmentRecord } from '../../lib/apiTypes.ts';
import type { Task } from '../../types.ts';
import { normalizeDateOnly } from '../../lib/scheduleMutationUtils.ts';
import { isResourceVisibleInProject } from './resourceAssignmentUtils.ts';

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

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  human: 'Люди',
  equipment: 'Оборудование',
  material: 'Материалы',
  other: 'Другое',
};

const RESOURCE_SCOPE_LABELS: Record<ResourceScope, string> = {
  shared: 'Shared',
  project: 'Project',
};

export function mapApiResourceTypeToTimelineLabel(type: ResourceType): string {
  return RESOURCE_TYPE_LABELS[type];
}

export function mapApiResourceScopeToTimelineLabel(scope: ResourceScope): string {
  return RESOURCE_SCOPE_LABELS[scope];
}

export function mapTimelineResourceTypeToApiType(value: string | undefined): ResourceType {
  const normalized = value?.trim().toLocaleLowerCase();
  if (normalized === 'люди' || normalized === 'human') {
    return 'human';
  }
  if (normalized === 'оборудование' || normalized === 'equipment') {
    return 'equipment';
  }
  if (normalized === 'материалы' || normalized === 'material') {
    return 'material';
  }
  return 'other';
}

export function mapTimelineResourceScopeToApiScope(value: string | undefined): ResourceScope {
  return value?.trim().toLocaleLowerCase() === 'shared' ? 'shared' : 'project';
}

export function mapTimelineResourceStatusToActive(value: string | undefined): boolean {
  return value?.trim().toLocaleLowerCase() !== 'inactive';
}

function enrichTimelineResource(
  resource: ResourcePlannerTimelineResource,
  catalogResource: ProjectResource | undefined,
): ResourcePlannerTimelineResource {
  if (!catalogResource) {
    return {
      ...resource,
      type: resource.type ?? 'Другое',
      scope: resource.scope ?? 'Project',
      status: resource.status ?? 'Active',
    };
  }

  return {
    ...resource,
    name: catalogResource.name,
    type: mapApiResourceTypeToTimelineLabel(catalogResource.type),
    scope: mapApiResourceScopeToTimelineLabel(catalogResource.scope),
    status: catalogResource.isActive ? 'Active' : 'Inactive',
  };
}

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

function mapIntervalToMetadata(interval: ResourcePlannerInterval): ResourcePlannerItemMetadata {
  return {
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
  };
}

export function applyVisibleTaskDatesToPlannerResult(
  result: ResourcePlannerResult,
  visibleTasks: Task[],
): ResourcePlannerResult {
  const visibleTaskDatesById = new Map(visibleTasks.map((task) => ([
    task.id,
    {
      startDate: normalizeDateOnly(task.startDate),
      endDate: normalizeDateOnly(task.endDate),
    },
  ])));

  let changed = false;
  const resources = result.resources.map((resource) => ({
    ...resource,
    intervals: resource.intervals.map((interval) => {
      const visibleTaskDates = visibleTaskDatesById.get(interval.taskId);
      if (!visibleTaskDates) {
        return interval;
      }

      if (
        visibleTaskDates.startDate === interval.startDate
        && visibleTaskDates.endDate === interval.endDate
      ) {
        return interval;
      }

      changed = true;
      return {
        ...interval,
        startDate: visibleTaskDates.startDate,
        endDate: visibleTaskDates.endDate,
      };
    }),
  }));

  return changed ? { ...result, resources } : result;
}

export function buildCurrentProjectResourceTimeline(
  projectId: string,
  visibleTasks: Task[],
  resources: ProjectResource[],
  assignments: TaskAssignmentRecord[],
  plannerResult: ResourcePlannerResult | null,
): ResourcePlannerTimelineResource[] {
  const visibleTaskById = new Map(visibleTasks.map((task) => [task.id, task]));
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
  const plannerIntervalByAssignmentId = new Map<string, ResourcePlannerInterval>();
  const plannerResourceNameById = new Map<string, string>();

  for (const plannerResource of plannerResult?.resources ?? []) {
    plannerResourceNameById.set(plannerResource.resourceId, plannerResource.resourceName);
    for (const interval of plannerResource.intervals) {
      plannerIntervalByAssignmentId.set(interval.assignmentId, interval);
    }
  }

  const projectedItemsByResourceId = new Map<string, ResourcePlannerTimelineItem[]>();
  for (const assignment of assignments) {
    const task = visibleTaskById.get(assignment.taskId);
    if (!task) {
      continue;
    }

    const plannerInterval = plannerIntervalByAssignmentId.get(assignment.id);
    const catalogResource = resourceById.get(assignment.resourceId);
    const metadata = plannerInterval
      ? mapIntervalToMetadata({
          ...plannerInterval,
          taskId: task.id,
          taskName: task.name,
          resourceId: assignment.resourceId,
          resourceName: catalogResource?.name ?? plannerInterval.resourceName,
          startDate: normalizeDateOnly(task.startDate),
          endDate: normalizeDateOnly(task.endDate),
          assignmentCreatedAt: assignment.createdAt,
        })
      : {
          source: 'resource-planner-result' as const,
          projectId,
          projectName: '',
          taskId: task.id,
          assignmentId: assignment.id,
          resourceId: assignment.resourceId,
          resourceName: catalogResource?.name ?? plannerResourceNameById.get(assignment.resourceId) ?? assignment.resourceId,
          hasConflict: false,
          conflictCount: 0,
          conflictAssignmentIds: [],
          assignmentCreatedAt: assignment.createdAt,
        };

    const nextItem: ResourcePlannerTimelineItem = {
      id: assignment.id,
      resourceId: assignment.resourceId,
      taskId: task.id,
      title: task.name,
      subtitle: metadata.projectName,
      startDate: normalizeDateOnly(task.startDate),
      endDate: normalizeDateOnly(task.endDate),
      locked: task.locked,
      metadata,
    };

    const bucket = projectedItemsByResourceId.get(assignment.resourceId) ?? [];
    bucket.push(nextItem);
    projectedItemsByResourceId.set(assignment.resourceId, bucket);
  }

  const visibleResources = resources.filter((resource) => isResourceVisibleInProject(resource, projectId));
  const visibleResourceIds = new Set(visibleResources.map((resource) => resource.id));

  const timelineResources: ResourcePlannerTimelineResource[] = visibleResources.map((resource) => enrichTimelineResource({
    id: resource.id,
    name: resource.name,
    items: projectedItemsByResourceId.get(resource.id) ?? [],
  }, resource));

  for (const [resourceId, items] of projectedItemsByResourceId.entries()) {
    if (visibleResourceIds.has(resourceId)) {
      continue;
    }

    timelineResources.push(enrichTimelineResource({
      id: resourceId,
      name: plannerResourceNameById.get(resourceId) ?? resourceById.get(resourceId)?.name ?? resourceId,
      items,
    }, resourceById.get(resourceId)));
  }

  const renderedResourceIds = new Set(timelineResources.map((resource) => resource.id));
  for (const plannerResource of plannerResult?.resources ?? []) {
    if (renderedResourceIds.has(plannerResource.resourceId)) {
      continue;
    }

    timelineResources.push(enrichTimelineResource({
      id: plannerResource.resourceId,
      name: plannerResource.resourceName,
      items: projectedItemsByResourceId.get(plannerResource.resourceId) ?? [],
    }, resourceById.get(plannerResource.resourceId)));
  }

  return timelineResources;
}

export function mapResourcePlannerResultToTimelineResources(
  result: ResourcePlannerResult,
  catalogResources: ProjectResource[] = [],
): ResourcePlannerTimelineResource[] {
  const catalogById = new Map(catalogResources.map((resource) => [resource.id, resource]));
  const plannerById = new Map(result.resources.map((resource) => [
    resource.resourceId,
    {
      id: resource.resourceId,
      name: resource.resourceName,
      items: resource.intervals.map((interval) => mapIntervalToTimelineItem(interval)),
    } satisfies ResourcePlannerTimelineResource,
  ]));

  const resources: ResourcePlannerTimelineResource[] = catalogResources.map((catalogResource) => {
    const plannerResource = plannerById.get(catalogResource.id) ?? {
      id: catalogResource.id,
      name: catalogResource.name,
      items: [],
    };

    return enrichTimelineResource(plannerResource, catalogResource);
  });

  for (const plannerResource of plannerById.values()) {
    if (!catalogById.has(plannerResource.id)) {
      resources.push(enrichTimelineResource(plannerResource, undefined));
    }
  }

  return resources;
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
