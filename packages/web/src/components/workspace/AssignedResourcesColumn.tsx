import type { ReactNode } from 'react';
import type { TaskListColumn } from 'gantt-lib';
import { Plus } from 'lucide-react';

import type { ProjectResource, TaskAssignmentRecord } from '../../lib/apiTypes.ts';
import type { Task } from '../../types.ts';
import type { TaskAssignmentResourceGroups, TaskResourceAssignmentView } from './resourceAssignmentUtils.ts';
import { getTaskAssignmentResourceGroups } from './resourceAssignmentUtils.ts';
import { ResourceTypeIcon } from './ResourceTypeIcon.tsx';

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
  onChipClick?: () => void,
): ReactNode {
  return resources.map(({ resource, assignment }) => {
    const label = formatResourceLabel(resource);
    const variantClasses = variant === 'active'
      ? 'border-[#dfe1e6] bg-white text-[#172b4d]'
      : 'border-[#dfe1e6] bg-[#f7f8fa] text-[#6b778c] opacity-75';
    const className = `inline-flex min-w-0 flex-1 basis-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4 ${variantClasses} ${
      onChipClick ? 'cursor-pointer transition-colors hover:border-[#4c9aff] hover:bg-[#f4f8ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4c9aff]/25' : ''
    }`;
    const children = (
      <>
        <ResourceTypeIcon type={resource.type} className="h-3 w-3 shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
        {variant === 'inactive' && <span className="ml-0.5 shrink-0 text-[#6b778c]">неактивен</span>}
      </>
    );

    if (onChipClick) {
      return (
        <button
          aria-label={`Изменить назначения ресурсов для задачи ${taskId}`}
          className={className}
          data-testid={`assigned-resources-${variant}-${taskId}-${resource.id}`}
          key={`${variant}-${assignment.id}-${resource.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onChipClick();
          }}
          title={variant === 'inactive' ? `${label} — неактивный ресурс` : label}
          type="button"
        >
          {children}
        </button>
      );
    }

    return (
      <span
        className={className}
        data-testid={`assigned-resources-${variant}-${taskId}-${resource.id}`}
        key={`${variant}-${assignment.id}-${resource.id}`}
        title={variant === 'inactive' ? `${label} — неактивный ресурс` : label}
      >
        {children}
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
  const openEditor = canEdit ? () => onEdit?.(task) : undefined;

  return (
    <div
      aria-label={summaryLabel}
      className="flex min-w-0 items-center gap-1 px-1.5 py-1 text-xs text-slate-700"
      data-assigned-resource-count={String(totalVisibleCount)}
      data-testid={`assigned-resources-cell-${task.id}`}
    >
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden">
        {totalVisibleCount === 0 ? (
          canEdit ? (
            <button
              aria-label={`Назначить ресурсы для задачи ${task.name || task.id}`}
              className="assigned-resources-add inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-violet-100 px-1 text-violet-700 transition-colors hover:bg-violet-200 hover:text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1"
              data-testid={`assigned-resources-add-${task.id}`}
              onClick={(event) => {
                event.stopPropagation();
                onEdit?.(task);
              }}
              title="Назначить ресурсы"
              type="button"
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null
        ) : (
          <>
            <span className="sr-only" data-testid={`assigned-resources-count-${task.id}`}>
              {summaryLabel}
            </span>
            {renderResourceChips(task.id, activeResources, 'active', openEditor)}
            {renderResourceChips(task.id, inactiveResources, 'inactive', openEditor)}
            {unknownResourceIds.map((resourceId) => (
              openEditor ? (
                <button
                  aria-label={`Изменить назначения ресурсов для задачи ${task.name || task.id}`}
                  className="inline-flex min-w-0 flex-1 basis-0 items-center rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  data-testid={`assigned-resources-unknown-${task.id}-${resourceId}`}
                  key={`unknown-${resourceId}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    openEditor();
                  }}
                  title={`Неизвестный ресурс: ${resourceId}`}
                  type="button"
                >
                  <span className="min-w-0 truncate">Неизвестный ресурс</span>
                  <span className="ml-1 shrink-0 font-mono text-[10px]">{resourceId}</span>
                </button>
              ) : (
                <span
                  className="inline-flex min-w-0 flex-1 basis-0 items-center rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-red-700"
                  data-testid={`assigned-resources-unknown-${task.id}-${resourceId}`}
                  key={`unknown-${resourceId}`}
                  title={`Неизвестный ресурс: ${resourceId}`}
                >
                  <span className="min-w-0 truncate">Неизвестный ресурс</span>
                  <span className="ml-1 shrink-0 font-mono text-[10px]">{resourceId}</span>
                </span>
              )
            ))}
          </>
        )}
      </div>
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
