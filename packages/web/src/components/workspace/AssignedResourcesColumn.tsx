import { cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { TaskListColumn } from 'gantt-lib';
import { Plus } from 'lucide-react';

import type { ProjectResource, TaskAssignmentRecord } from '../../lib/apiTypes.ts';
import type { Task } from '../../types.ts';
import type { TaskAssignmentResourceGroups, TaskResourceAssignmentView } from './resourceAssignmentUtils.ts';
import { getTaskAssignmentResourceGroups } from './resourceAssignmentUtils.ts';
import { ResourceTypeIcon } from './ResourceTypeIcon.tsx';

const DEFAULT_ASSIGNED_RESOURCES_COLUMN_WIDTH = 132;
const TEXT_CHIP_MIN_WIDTH = 44;
const ICON_ONLY_CHIP_MIN_WIDTH = 26;
const CHIP_GAP_PX = 4;

export interface AssignedResourcesColumnCellProps {
  task: Task;
  groups: TaskAssignmentResourceGroups;
  editable?: boolean;
  readOnly?: boolean;
  estimatedWidth?: number;
  onEdit?: (task: Task) => void;
}

export interface CreateAssignedResourcesColumnOptions {
  resources: ProjectResource[];
  assignments: TaskAssignmentRecord[];
  editable?: boolean;
  readOnly?: boolean;
  width?: number;
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

type ResourceChipSummary = {
  key: string;
  type: ProjectResource['type'] | 'unknown';
  count: number;
  isInactive: boolean;
};

function getResourceSummaryLabel(summary: ResourceChipSummary): string {
  if (summary.type === 'unknown') {
    return `Неизвестных ${summary.count}`;
  }

  const labels: Record<ProjectResource['type'], { active: string; inactive: string }> = {
    human: { active: 'Людей', inactive: 'Неактивных людей' },
    equipment: { active: 'Оборудование', inactive: 'Неактивного оборудования' },
    material: { active: 'Материалов', inactive: 'Неактивных материалов' },
    other: { active: 'Прочих', inactive: 'Неактивных прочих' },
  };

  const entry = labels[summary.type];
  return `${summary.isInactive ? entry.inactive : entry.active} ${summary.count}`;
}

function InlineTooltip({
  content,
  children,
}: {
  content: string;
  children: ReactElement;
}) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!anchor) {
      return undefined;
    }

    const handleHide = () => setAnchor(null);
    window.addEventListener('scroll', handleHide, true);
    window.addEventListener('resize', handleHide);
    return () => {
      window.removeEventListener('scroll', handleHide, true);
      window.removeEventListener('resize', handleHide);
    };
  }, [anchor]);

  if (!isValidElement(children)) {
    return children;
  }

  const showTooltip = (event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAnchor({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    });
  };

  const hideTooltip = () => setAnchor(null);
  const childProps = children.props as Record<string, unknown>;

  return (
    <>
      {cloneElement(children, {
        title: undefined,
        onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
          childProps.onMouseEnter?.(event);
          showTooltip(event);
        },
        onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
          childProps.onMouseLeave?.(event);
          hideTooltip();
        },
        onFocus: (event: React.FocusEvent<HTMLElement>) => {
          childProps.onFocus?.(event);
          showTooltip(event);
        },
        onBlur: (event: React.FocusEvent<HTMLElement>) => {
          childProps.onBlur?.(event);
          hideTooltip();
        },
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
          childProps.onPointerDown?.(event);
          hideTooltip();
        },
      })}
      {anchor && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-full rounded-md border border-[#dfe1e6] bg-white px-2 py-1 text-[10px] font-medium leading-4 text-[#172b4d] shadow-[0_10px_30px_rgba(9,30,66,0.18)]"
            style={{ left: anchor.left, top: anchor.top }}
          >
            {content}
          </div>,
          document.body,
        )
        : null}
    </>
  );
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
  displayMode: 'full' | 'icon',
  onChipClick?: () => void,
): ReactNode {
  return resources.map(({ resource, assignment }) => {
    const label = formatResourceLabel(resource);
    const variantClasses = variant === 'active'
      ? 'border-[#dfe1e6] bg-white text-[#172b4d]'
      : 'border-[#dfe1e6] bg-[#f7f8fa] text-[#6b778c] opacity-75';
    const className = `inline-flex min-w-0 max-w-full flex-1 basis-0 items-center overflow-hidden rounded-md border ${
      displayMode === 'icon' ? 'h-7 justify-center px-1.5 py-0.5' : 'gap-1 px-1.5 py-0.5'
    } text-[10px] font-medium leading-4 ${variantClasses} ${
      onChipClick ? 'cursor-pointer transition-colors hover:border-[#4c9aff] hover:bg-[#f4f8ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4c9aff]/25' : ''
    }`;
    const children = (
      <>
        <span className="inline-flex h-3 w-3 min-w-3 shrink-0 items-center justify-center overflow-hidden">
          <ResourceTypeIcon type={resource.type} className="h-3 w-3 shrink-0" />
        </span>
        {displayMode === 'full' ? <span className="min-w-0 truncate">{label}</span> : null}
        {displayMode === 'full' && variant === 'inactive' ? <span className="ml-0.5 shrink-0 text-[#6b778c]">неактивен</span> : null}
      </>
    );

    if (onChipClick) {
      const button = (
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

      return (
        <InlineTooltip content={variant === 'inactive' ? `${label} — неактивный ресурс` : label} key={`${variant}-${assignment.id}-${resource.id}`}>
          {button}
        </InlineTooltip>
      );
    }

    const chip = (
      <span
        className={className}
        data-testid={`assigned-resources-${variant}-${taskId}-${resource.id}`}
        key={`${variant}-${assignment.id}-${resource.id}`}
      >
        {children}
      </span>
    );

    return (
      <InlineTooltip content={variant === 'inactive' ? `${label} — неактивный ресурс` : label} key={`${variant}-${assignment.id}-${resource.id}`}>
        {chip}
      </InlineTooltip>
    );
  });
}

function buildResourceChipSummaries(
  activeResources: TaskResourceAssignmentView[],
  inactiveResources: TaskResourceAssignmentView[],
  unknownResourceIds: string[],
): ResourceChipSummary[] {
  const summaryMap = new Map<string, ResourceChipSummary>();

  const appendSummary = (type: ResourceChipSummary['type'], isInactive: boolean) => {
    const key = `${isInactive ? 'inactive' : 'active'}-${type}`;
    const existing = summaryMap.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }

    summaryMap.set(key, { key, type, count: 1, isInactive });
  };

  for (const { resource } of activeResources) {
    appendSummary(resource.type, false);
  }

  for (const { resource } of inactiveResources) {
    appendSummary(resource.type, true);
  }

  for (const _resourceId of unknownResourceIds) {
    appendSummary('unknown', false);
  }

  return Array.from(summaryMap.values());
}

function renderSummaryChip(
  task: Task,
  summary: ResourceChipSummary,
  onChipClick?: () => void,
): ReactNode {
  const baseClassName = summary.isInactive
    ? 'border-[#dfe1e6] bg-[#f7f8fa] text-[#6b778c] opacity-80'
    : summary.type === 'unknown'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-[#dfe1e6] bg-white text-[#172b4d]';
  const className = `inline-flex h-5 min-w-0 flex-1 basis-0 items-center gap-1 overflow-hidden rounded-md border px-1.5 text-[10px] font-semibold leading-none ${baseClassName} ${
    onChipClick ? 'cursor-pointer transition-colors hover:border-[#4c9aff] hover:bg-[#f4f8ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4c9aff]/25' : ''
  }`;
  const title = getResourceSummaryLabel(summary);
  const content = (
    <>
      {summary.type === 'unknown' ? (
        <span className="inline-flex h-3 w-3 min-w-3 shrink-0 items-center justify-center rounded-full bg-red-100 text-[9px] font-bold text-red-700">
          ?
        </span>
      ) : (
        <span className="inline-flex h-3 w-3 min-w-3 shrink-0 items-center justify-center overflow-hidden">
          <ResourceTypeIcon type={summary.type} className="h-3 w-3 shrink-0" />
        </span>
      )}
      <span data-testid={`assigned-resources-summary-count-${task.id}-${summary.key}`}>{summary.count}</span>
      {summary.isInactive ? <span className="text-[9px]">архив</span> : null}
    </>
  );

  if (onChipClick) {
    const button = (
      <button
        aria-label={`Изменить назначения ресурсов для задачи ${task.name || task.id}`}
        className={className}
        data-testid={`assigned-resources-summary-${task.id}-${summary.key}`}
        key={summary.key}
        onClick={(event) => {
          event.stopPropagation();
          onChipClick();
        }}
        type="button"
      >
        {content}
      </button>
    );

    return (
      <InlineTooltip content={title} key={summary.key}>
        {button}
      </InlineTooltip>
    );
  }

  const chip = (
    <span
      className={className}
      data-testid={`assigned-resources-summary-${task.id}-${summary.key}`}
      key={summary.key}
    >
      {content}
    </span>
  );

  return (
    <InlineTooltip content={title} key={summary.key}>
      {chip}
    </InlineTooltip>
  );
}

export function AssignedResourcesColumnCell({
  task,
  groups,
  editable = true,
  readOnly = false,
  estimatedWidth = DEFAULT_ASSIGNED_RESOURCES_COLUMN_WIDTH,
  onEdit,
}: AssignedResourcesColumnCellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(estimatedWidth);
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
  const availableWidthPerChip = totalVisibleCount > 0
    ? (containerWidth - CHIP_GAP_PX * Math.max(0, totalVisibleCount - 1)) / totalVisibleCount
    : containerWidth;
  const shouldCollapseToSummary = totalVisibleCount > 0 && availableWidthPerChip < ICON_ONLY_CHIP_MIN_WIDTH;
  const chipDisplayMode: 'full' | 'icon' = !shouldCollapseToSummary && availableWidthPerChip >= TEXT_CHIP_MIN_WIDTH ? 'full' : 'icon';
  const resourceSummaries = shouldCollapseToSummary
    ? buildResourceChipSummaries(activeResources, inactiveResources, unknownResourceIds)
    : [];

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return undefined;
    }

    const updateWidth = () => {
      const host = element.parentElement instanceof HTMLElement ? element.parentElement : element;
      const nextWidth = Math.round(host.getBoundingClientRect().width);
      if (nextWidth > 0) {
        setContainerWidth(nextWidth);
      }
    };

    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateWidth());
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [estimatedWidth]);

  return (
    <div
      aria-label={summaryLabel}
      className="flex w-full min-w-0 items-center gap-1 px-1.5 py-1 text-xs text-slate-700"
      data-assigned-resource-count={String(totalVisibleCount)}
      data-testid={`assigned-resources-cell-${task.id}`}
      ref={containerRef}
    >
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden">
        {totalVisibleCount === 0 ? (
          canEdit ? (
            <button
              aria-label={`Назначить ресурсы для задачи ${task.name || task.id}`}
              className="assigned-resources-add inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-[#dfe1e6] bg-white px-1 text-[#6b778c] transition-colors hover:border-[#4c9aff] hover:bg-[#f4f8ff] hover:text-[#172b4d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4c9aff]/25 focus-visible:ring-offset-1"
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
            {shouldCollapseToSummary ? (
              resourceSummaries.map((summary) => renderSummaryChip(task, summary, openEditor))
            ) : (
              <>
                {renderResourceChips(task.id, activeResources, 'active', chipDisplayMode, openEditor)}
                {renderResourceChips(task.id, inactiveResources, 'inactive', chipDisplayMode, openEditor)}
                {unknownResourceIds.map((resourceId) => (
                  openEditor ? (
                    <InlineTooltip content={`Неизвестный ресурс: ${resourceId}`} key={`unknown-${resourceId}`}>
                      <button
                        aria-label={`Изменить назначения ресурсов для задачи ${task.name || task.id}`}
                        className={`inline-flex min-w-0 max-w-full flex-1 basis-0 items-center overflow-hidden rounded-md bg-red-50 text-[10px] font-medium leading-4 text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
                          chipDisplayMode === 'icon' ? 'h-7 justify-center px-1.5 py-0.5' : 'px-1.5 py-0.5'
                        }`}
                        data-testid={`assigned-resources-unknown-${task.id}-${resourceId}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditor();
                        }}
                        type="button"
                      >
                        {chipDisplayMode === 'icon' ? (
                          <span className="inline-flex h-3 w-3 min-w-3 shrink-0 items-center justify-center rounded-full bg-red-100 text-[9px] font-bold text-red-700">
                            ?
                          </span>
                        ) : (
                          <>
                            <span className="min-w-0 truncate">Неизвестный ресурс</span>
                            <span className="ml-1 shrink-0 font-mono text-[10px]">{resourceId}</span>
                          </>
                        )}
                      </button>
                    </InlineTooltip>
                  ) : (
                    <InlineTooltip content={`Неизвестный ресурс: ${resourceId}`} key={`unknown-${resourceId}`}>
                      <span
                        className={`inline-flex min-w-0 max-w-full flex-1 basis-0 items-center overflow-hidden rounded-md bg-red-50 text-[10px] font-medium leading-4 text-red-700 ${
                          chipDisplayMode === 'icon' ? 'h-7 justify-center px-1.5 py-0.5' : 'px-1.5 py-0.5'
                        }`}
                        data-testid={`assigned-resources-unknown-${task.id}-${resourceId}`}
                      >
                        {chipDisplayMode === 'icon' ? (
                          <span className="inline-flex h-3 w-3 min-w-3 shrink-0 items-center justify-center rounded-full bg-red-100 text-[9px] font-bold text-red-700">
                            ?
                          </span>
                        ) : (
                          <>
                            <span className="min-w-0 truncate">Неизвестный ресурс</span>
                            <span className="ml-1 shrink-0 font-mono text-[10px]">{resourceId}</span>
                          </>
                        )}
                      </span>
                    </InlineTooltip>
                  )
                ))}
              </>
            )}
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
  width = DEFAULT_ASSIGNED_RESOURCES_COLUMN_WIDTH,
  onEdit,
}: CreateAssignedResourcesColumnOptions): TaskListColumn<Task> {
  return {
    id: 'assigned-resources',
    header: 'Ресурсы',
    width,
    minWidth: 108,
    after: 'progress',
    renderCell: ({ task }) => (
      <AssignedResourcesColumnCell
        editable={editable}
        estimatedWidth={width}
        groups={getTaskAssignmentResourceGroups(task.id, resources, assignments)}
        onEdit={onEdit}
        readOnly={readOnly}
        task={task}
      />
    ),
  };
}
