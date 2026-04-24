import type { ReactNode } from 'react';
import type { TaskListColumn } from 'gantt-lib';

import type { ProjectResource, TaskAssignmentRecord } from '../../lib/apiTypes.ts';
import type { Task } from '../../types.ts';
import type { TaskAssignmentResourceGroups, TaskResourceAssignmentView } from './resourceAssignmentUtils.ts';
import { getTaskAssignmentResourceGroups } from './resourceAssignmentUtils.ts';

export interface AssignedResourcesColumnCellProps {
  task: Task;
  groups: TaskAssignmentResourceGroups;
  editable?: boolean;
  readOnly?: boolean;
  onEdit?: (task: Task) => void;
}

export interface CreateAssignedResourcesColumnOptions {
  resources: ProjectResource[];
  assignments: TaskAssignmentRecord[];
  editable?: boolean;
  readOnly?: boolean;
  onEdit?: (task: Task) => void;
}

function formatResourceLabel(resource: ProjectResource): string {
  return resource.name?.trim() || resource.id;
}

function dedupeAssignmentViews(views: TaskResourceAssignmentView[]): TaskResourceAssignmentView[] {
  const seenResourceIds = new Set<string>();
  const dedupedViews: TaskResourceAssignmentView[] = [];

  for (const view of views) {
    if (seenResourceIds.has(view.resource.id)) {
      continue;
    }

    seenResourceIds.add(view.resource.id);
    dedupedViews.push(view);
  }

  return dedupedViews;
}

function dedupeResourceIds(resourceIds: string[]): string[] {
  return Array.from(new Set(resourceIds.filter(Boolean)));
}

export function normalizeAssignedResourceGroups(groups: TaskAssignmentResourceGroups): TaskAssignmentResourceGroups {
  return {
    activeAssignedResources: dedupeAssignmentViews(groups.activeAssignedResources),
    inactiveAssignedResources: dedupeAssignmentViews(groups.inactiveAssignedResources),
    unknownAssignedResourceIds: dedupeResourceIds(groups.unknownAssignedResourceIds),
  };
}

function renderResourceChips(
  taskId: string,
  resources: TaskResourceAssignmentView[],
  variant: 'active' | 'inactive',
): ReactNode {
  return resources.map(({ resource, assignment }) => {
    const label = formatResourceLabel(resource);
    const variantClasses = variant === 'active'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-amber-200 bg-amber-50 text-amber-800';

    return (
      <span
        className={`inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-[11px] font-medium ${variantClasses}`}
        data-testid={`assigned-resources-${variant}-${taskId}-${resource.id}`}
        key={`${variant}-${assignment.id}-${resource.id}`}
        title={variant === 'inactive' ? `${label} — неактивный ресурс` : label}
      >
        {label}
        {variant === 'inactive' && <span className="ml-1 text-amber-700">неактивен</span>}
      </span>
    );
  });
}

export function AssignedResourcesColumnCell({
  task,
  groups,
  editable = true,
  readOnly = false,
  onEdit,
}: AssignedResourcesColumnCellProps) {
  const normalizedGroups = normalizeAssignedResourceGroups(groups);
  const activeResources = normalizedGroups.activeAssignedResources;
  const inactiveResources = normalizedGroups.inactiveAssignedResources;
  const unknownResourceIds = normalizedGroups.unknownAssignedResourceIds;
  const assignedCount = activeResources.length + inactiveResources.length;
  const totalVisibleCount = assignedCount + unknownResourceIds.length;
  const canEdit = editable && !readOnly && Boolean(onEdit);
  const summaryLabel = totalVisibleCount === 0
    ? 'Ресурсы не назначены'
    : `Назначено ресурсов: ${totalVisibleCount}`;

  return (
    <div
      aria-label={summaryLabel}
      className="flex min-w-0 items-center gap-2 px-2 py-1 text-xs text-slate-700"
      data-assigned-resource-count={String(totalVisibleCount)}
      data-testid={`assigned-resources-cell-${task.id}`}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {totalVisibleCount === 0 ? (
          <span className="text-slate-400" data-testid={`assigned-resources-empty-${task.id}`}>
            Ресурсы не назначены
          </span>
        ) : (
          <>
            <span className="sr-only" data-testid={`assigned-resources-count-${task.id}`}>
              {summaryLabel}
            </span>
            {renderResourceChips(task.id, activeResources, 'active')}
            {renderResourceChips(task.id, inactiveResources, 'inactive')}
            {unknownResourceIds.map((resourceId) => (
              <span
                className="inline-flex max-w-full items-center truncate rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700"
                data-testid={`assigned-resources-unknown-${task.id}-${resourceId}`}
                key={`unknown-${resourceId}`}
                title={`Неизвестный ресурс: ${resourceId}`}
              >
                Неизвестный ресурс
                <span className="ml-1 font-mono text-[10px]">{resourceId}</span>
              </span>
            ))}
          </>
        )}
      </div>

      {canEdit ? (
        <button
          aria-label={`Изменить назначения ресурсов для задачи ${task.name || task.id}`}
          className="inline-flex h-7 shrink-0 items-center rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          data-testid={`assigned-resources-edit-${task.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onEdit?.(task);
          }}
          type="button"
        >
          Изменить
        </button>
      ) : null}
    </div>
  );
}

export function createAssignedResourcesColumn({
  resources,
  assignments,
  editable = true,
  readOnly = false,
  onEdit,
}: CreateAssignedResourcesColumnOptions): TaskListColumn<Task> {
  return {
    id: 'assigned-resources',
    header: 'Ресурсы',
    width: 240,
    minWidth: 180,
    after: 'name',
    renderCell: ({ task }) => (
      <AssignedResourcesColumnCell
        editable={editable}
        groups={getTaskAssignmentResourceGroups(task.id, resources, assignments)}
        onEdit={onEdit}
        readOnly={readOnly}
        task={task}
      />
    ),
  };
}
