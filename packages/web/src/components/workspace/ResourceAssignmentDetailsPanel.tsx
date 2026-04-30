import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import type { ProjectResource } from '../../lib/apiTypes.ts';
import { cn } from '../../lib/utils.ts';
import { getPlannerItemMetadata, type ResourcePlannerTimelineItem } from './resourcePlannerAdapter.ts';
import { ResourceTypeIcon } from './ResourceTypeIcon.tsx';

export interface AssignmentResourceView {
  assignmentId: string;
  resource: ProjectResource;
}

interface ResourceAssignmentDetailsPanelProps {
  item: ResourcePlannerTimelineItem;
  resource: ProjectResource | null;
  resources: ProjectResource[];
  assignedResources: AssignmentResourceView[];
  readonly: boolean;
  onClose: () => void;
  onOpenTask?: (input: { projectId: string; taskId: string; assignmentId: string; resourceId: string }) => void;
  onAddResource?: (input: { taskId: string; resourceId: string }) => void;
  onRemoveResource?: (input: { assignmentId: string; resourceId: string }) => void;
  onResourceChange?: (input: { assignmentId: string; resourceId: string }) => void;
}

function formatDate(value: string | Date): string {
  const source = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).split('T')[0] ?? String(value);
  const [year, month, day] = source.split('-');
  return year && month && day ? `${day}.${month}.${year}` : source;
}

function getResourceTypeLabel(resource: ProjectResource): string {
  const labels: Record<ProjectResource['type'], string> = {
    human: 'Люди',
    equipment: 'Оборудование',
    material: 'Материалы',
    other: 'Другое',
  };

  return labels[resource.type];
}

export function ResourceAssignmentDetailsPanel({
  item,
  resource,
  resources,
  assignedResources,
  readonly,
  onClose,
  onOpenTask,
  onAddResource,
  onRemoveResource,
  onResourceChange,
}: ResourceAssignmentDetailsPanelProps) {
  const metadata = getPlannerItemMetadata(item);
  const [resourceToRemove, setResourceToRemove] = useState<AssignmentResourceView | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const uniqueAssignedResources = useMemo(() => {
    const seen = new Set<string>();
    return assignedResources.filter((candidate) => {
      if (seen.has(candidate.resource.id)) {
        return false;
      }
      seen.add(candidate.resource.id);
      return true;
    });
  }, [assignedResources]);

  if (!metadata) {
    return null;
  }

  const disabledReason = readonly
    ? 'Войдите, чтобы изменять ресурсы. Сейчас календарь открыт только для просмотра.'
    : null;
  const assignedResourceIds = new Set(uniqueAssignedResources.map((entry) => entry.resource.id));
  const addableResources = (resources.length > 0 ? resources : resource ? [resource] : [])
    .filter((candidate) => candidate.isActive && !assignedResourceIds.has(candidate.id));
  const resourceGroups = [
    { type: 'human' as const, label: 'Люди', resources: addableResources.filter((candidate) => candidate.type === 'human') },
    { type: 'equipment' as const, label: 'Оборудование', resources: addableResources.filter((candidate) => candidate.type === 'equipment') },
    { type: 'material' as const, label: 'Материалы', resources: addableResources.filter((candidate) => candidate.type === 'material') },
    { type: 'other' as const, label: 'Другое', resources: addableResources.filter((candidate) => candidate.type === 'other') },
  ].filter((group) => group.resources.length > 0);

  return (
    <aside
      aria-label="Детали назначения"
      className="flex min-h-0 w-full min-w-0 flex-col bg-white text-[#172b4d]"
      data-testid="assignment-details-panel"
      role="dialog"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#dfe1e6] px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-[15px] font-bold leading-snug text-[#172b4d]">{item.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-[#deebff] px-1.5 py-0.5 text-[11px] font-bold text-[#0747a6]">
              {Math.ceil((new Date(item.endDate).getTime() - new Date(item.startDate).getTime()) / 86400000) + 1} дн.
            </span>
            <span className="text-[12px] font-medium tabular-nums text-[#5e6c84]">
              {formatDate(item.startDate)} - {formatDate(item.endDate)}
            </span>
            {onOpenTask && (
              <button
                type="button"
                className="inline-flex items-center rounded-sm text-[12px] font-medium text-primary underline-offset-2 transition-colors hover:text-primary/80 hover:underline focus:outline-none focus:ring-2 focus:ring-[#4c9aff]/25"
                data-testid="assignment-details-open-task"
                onClick={() => onOpenTask({
                  projectId: metadata.projectId,
                  taskId: metadata.taskId,
                  assignmentId: metadata.assignmentId,
                  resourceId: metadata.resourceId,
                })}
              >
                Перейти
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-[#6b778c] transition-colors hover:bg-[#f4f5f7] hover:text-[#172b4d] focus:outline-none focus:ring-2 focus:ring-[#4c9aff]/25"
          aria-label="Закрыть детали назначения"
          data-testid="assignment-details-close"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 text-sm">
        {disabledReason && (
          <div className="rounded-md border border-[#dfe1e6] bg-[#f7f8fa] px-3 py-2 text-[12px] text-[#44546f]">
            {disabledReason}
          </div>
        )}

        <section className="space-y-2">
          <div className="text-[11px] font-bold uppercase leading-none text-[#44546f]">Назначены</div>
          <div className="flex flex-wrap gap-2">
            {uniqueAssignedResources.length > 0 ? uniqueAssignedResources.map((entry) => {
              const assignedResource = entry.resource;
              const current = assignedResource.id === metadata.resourceId;
              return (
              <div
                key={assignedResource.id}
                className={cn(
                  'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-bold leading-none',
                  current
                    ? 'border-[#b3d4ff] bg-[#deebff] text-[#0747a6]'
                    : 'border-[#dfe1e6] bg-[#f7f8fa] text-[#44546f]',
                )}
              >
                <ResourceTypeIcon type={assignedResource.type} className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate">{assignedResource.name}</span>
                {!readonly && onRemoveResource && (
                  <button
                    type="button"
                    className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-current opacity-70 hover:bg-white/70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#4c9aff]/25"
                    aria-label={`Снять назначение ${assignedResource.name}`}
                    onClick={() => setResourceToRemove(entry)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              );
            }) : null}
          </div>
        </section>

        <div className="space-y-3">
          <section className="space-y-2">
            <div className="text-[11px] font-bold uppercase leading-none text-[#44546f]">Добавить ресурс</div>
            <div className="max-h-64 overflow-auto rounded-md border border-[#dfe1e6] bg-white">
              {resourceGroups.length > 0 ? resourceGroups.map((group) => (
                <div key={group.type} className="border-b border-[#dfe1e6] last:border-b-0">
                  <div className="flex items-center gap-1.5 bg-[#f7f8fa] px-3 py-1.5 text-[11px] font-bold text-[#44546f]">
                    <span>{group.label}</span>
                    <span className="ml-auto rounded-full bg-[#dfe1e6] px-1.5 py-0.5 text-[10px] text-[#42526e]">
                      {group.resources.length}
                    </span>
                  </div>
                  {group.resources.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className="group flex w-full min-w-0 items-center gap-2 border-t border-[#ebecf0] px-3 py-2 text-left text-[#172b4d] transition-colors hover:bg-[#f4f8ff] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#4c9aff]/25 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={readonly || !onAddResource}
                      onClick={() => onAddResource?.({ taskId: metadata.taskId, resourceId: candidate.id })}
                    >
                      <ResourceTypeIcon type={candidate.type} className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 break-words text-[13px] font-bold">{candidate.name}</span>
                      <span className="shrink-0 text-[11px] font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        Добавить
                      </span>
                    </button>
                  ))}
                </div>
              )) : (
                <div className="px-3 py-3 text-[12px] font-medium text-[#6b778c]">
                  Все ресурсы уже назначены.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {resourceToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6">
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-[#dfe1e6] bg-white shadow-[0_24px_70px_rgba(9,30,66,0.22)]">
            <div className="border-b border-[#dfe1e6] px-4 py-3">
              <div className="text-[15px] font-bold text-[#172b4d]">Снять назначение?</div>
              <div className="mt-1 text-[13px] leading-5 text-[#44546f]">
                {resourceToRemove.resource.name} будет снят с задачи.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 bg-[#f7f8fa] px-4 py-3">
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-md border border-[#dfe1e6] bg-white px-3 text-[12px] font-bold text-[#44546f] transition-colors hover:bg-[#f4f5f7]"
                onClick={() => setResourceToRemove(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-[12px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                onClick={() => {
                  onRemoveResource?.({
                    assignmentId: resourceToRemove.assignmentId,
                    resourceId: resourceToRemove.resource.id,
                  });
                  setResourceToRemove(null);
                }}
              >
                Снять
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
