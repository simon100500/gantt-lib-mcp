import type { ProjectResource, TaskAssignmentRecord } from '../../lib/apiTypes.ts';
import type { Task } from '../../types.ts';

export interface TaskResourceAssignmentView {
  resource: ProjectResource;
  assignment: TaskAssignmentRecord;
}

export interface TaskAssignmentResourceGroups {
  activeAssignedResources: TaskResourceAssignmentView[];
  inactiveAssignedResources: TaskResourceAssignmentView[];
  unknownAssignedResourceIds: string[];
}

export function buildResourceById(resources: ProjectResource[]): Map<string, ProjectResource> {
  return new Map(resources.map((resource) => [resource.id, resource]));
}

export function isResourceVisibleInProject(resource: ProjectResource, projectId: string): boolean {
  return resource.scope === 'shared' || resource.projectId === projectId;
}

export function getAssignableResources(resources: ProjectResource[], projectId: string | null): ProjectResource[] {
  return resources.filter((resource) => {
    if (!resource.isActive) {
      return false;
    }

    if (!projectId) {
      return true;
    }

    return isResourceVisibleInProject(resource, projectId);
  });
}

export function getTaskAssignmentResourceGroups(
  taskId: string | null | undefined,
  resources: ProjectResource[],
  assignments: TaskAssignmentRecord[],
): TaskAssignmentResourceGroups {
  if (!taskId) {
    return {
      activeAssignedResources: [],
      inactiveAssignedResources: [],
      unknownAssignedResourceIds: [],
    };
  }

  const resourceById = buildResourceById(resources);
  const activeAssignedResources: TaskResourceAssignmentView[] = [];
  const inactiveAssignedResources: TaskResourceAssignmentView[] = [];
  const unknownAssignedResourceIds: string[] = [];

  for (const assignment of assignments) {
    if (assignment.taskId !== taskId) {
      continue;
    }

    const resource = resourceById.get(assignment.resourceId);
    if (!resource) {
      unknownAssignedResourceIds.push(assignment.resourceId);
      continue;
    }

    const view = { resource, assignment };
    if (resource.isActive) {
      activeAssignedResources.push(view);
    } else {
      inactiveAssignedResources.push(view);
    }
  }

  return {
    activeAssignedResources,
    inactiveAssignedResources,
    unknownAssignedResourceIds,
  };
}

export function assignedResourcesForTask(
  taskId: string,
  resources: ProjectResource[],
  assignments: TaskAssignmentRecord[],
): ProjectResource[] {
  const { activeAssignedResources, inactiveAssignedResources } = getTaskAssignmentResourceGroups(taskId, resources, assignments);
  return [...activeAssignedResources, ...inactiveAssignedResources].map((view) => view.resource);
}

export function getInitialSelectedResourceIds(
  taskId: string | null | undefined,
  resources: ProjectResource[],
  assignments: TaskAssignmentRecord[],
): string[] {
  return getTaskAssignmentResourceGroups(taskId, resources, assignments)
    .activeAssignedResources
    .map((view) => view.resource.id);
}

export function collectDescendantLeafIds(tasks: Task[], taskId: string): string[] {
  const childrenByParent = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const bucket = childrenByParent.get(task.parentId) ?? [];
    bucket.push(task);
    childrenByParent.set(task.parentId, bucket);
  }

  const rootChildren = childrenByParent.get(taskId) ?? [];
  const queue = [...rootChildren];
  const leafIds: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childrenByParent.get(current.id) ?? [];
    if (children.length === 0) {
      leafIds.push(current.id);
      continue;
    }
    queue.push(...children);
  }

  return leafIds;
}
