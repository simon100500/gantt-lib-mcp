import type { ResourceTimelineItem, ResourceTimelineResource } from 'gantt-lib';

import type { ProjectResource, ResourcePlannerInterval, ResourcePlannerResult, ResourceScope, ResourceType } from '../../lib/apiTypes.ts';

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
