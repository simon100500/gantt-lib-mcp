import type { ReactNode } from 'react';
import type { TaskListColumn } from 'gantt-lib';
import { Pencil } from 'lucide-react';

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
        className={`inline-flex min-w-0 flex-1 basis-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-4 ${variantClasses}`}
        data-testid={`assigned-resources-${variant}-${taskId}-${resource.id}`}
        key={`${variant}-${assignment.id}-${resource.id}`}
        title={variant === 'inactive' ? `${label} — неактивный ресурс` : label}
      >
        <span className="min-w-0 truncate">{label}</span>
        {variant === 'inactive' && <span className="ml-1 shrink-0 text-amber-700">неактивен</span>}
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
    ? 'Назначено ресурсов: 0'
    : `Назначено ресурсов: ${totalVisibleCount}`;

  return (
    <div
      aria-label={summaryLabel}
      className="flex min-w-0 items-center gap-1 px-1.5 py-1 text-xs text-slate-700"
      data-assigned-resource-count={String(totalVisibleCount)}
      data-testid={`assigned-resources-cell-${task.id}`}
    >
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden">
        {totalVisibleCount === 0 ? null : (
          <>
            <span className="sr-only" data-testid={`assigned-resources-count-${task.id}`}>
              {summaryLabel}
            </span>
            {renderResourceChips(task.id, activeResources, 'active')}
            {renderResourceChips(task.id, inactiveResources, 'inactive')}
            {unknownResourceIds.map((resourceId) => (
              <span
                className="inline-flex min-w-0 flex-1 basis-0 items-center rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-red-700"
                data-testid={`assigned-resources-unknown-${task.id}-${resourceId}`}
                key={`unknown-${resourceId}`}
                title={`Неизвестный ресурс: ${resourceId}`}
              >
                <span className="min-w-0 truncate">Неизвестный ресурс</span>
                <span className="ml-1 shrink-0 font-mono text-[10px]">{resourceId}</span>
              </span>
            ))}
          </>
        )}
      </div>

      {canEdit ? (
        <button
          aria-label={`Изменить назначения ресурсов для задачи ${task.name || task.id}`}
          className="assigned-resources-edit inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          data-testid={`assigned-resources-edit-${task.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onEdit?.(task);
          }}
          title="Изменить назначения ресурсов"
          type="button"
        >
          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
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
    width: 132,
    minWidth: 108,
    after: 'progress',
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
