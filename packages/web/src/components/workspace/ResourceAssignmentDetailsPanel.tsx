import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import type { ProjectResource } from '../../lib/apiTypes.ts';
import { cn } from '../../lib/utils.ts';
import { getPlannerItemMetadata, type ResourcePlannerTimelineItem } from './resourcePlannerAdapter.ts';

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
  onResourceChange?: (input: { assignmentId: string; resourceId: string }) => void;
  onRemoveResource?: (input: { assignmentId: string; resourceId: string }) => void;
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
  onResourceChange,
  onRemoveResource,
}: ResourceAssignmentDetailsPanelProps) {
  const metadata = getPlannerItemMetadata(item);
  const [selectedResourceId, setSelectedResourceId] = useState(metadata?.resourceId ?? item.resourceId);
  const [resourceToRemove, setResourceToRemove] = useState<AssignmentResourceView | null>(null);

  useEffect(() => {
    setSelectedResourceId(metadata?.resourceId ?? item.resourceId);
  }, [item.resourceId, metadata?.resourceId]);

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
  const selectableResources = resources.length > 0 ? resources : resource ? [resource] : [];

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
          <div className="mt-2 text-[12px] font-medium tabular-nums text-[#5e6c84]">
            {formatDate(item.startDate)} - {formatDate(item.endDate)}
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
                <span className="min-w-0 truncate">{assignedResource.name}</span>
                <span className="font-medium opacity-70">{getResourceTypeLabel(assignedResource)}</span>
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

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            onResourceChange?.({
              assignmentId: metadata.assignmentId,
              resourceId: selectedResourceId,
            });
          }}
        >
          <section className="space-y-2">
            <div className="text-[11px] font-bold uppercase leading-none text-[#44546f]">Сменить на</div>
            <div className="max-h-56 overflow-auto rounded-md border border-[#dfe1e6] bg-white">
              {selectableResources.map((candidate) => {
                const selected = candidate.id === selectedResourceId;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    className={cn(
                      'flex w-full min-w-0 items-center justify-between gap-3 border-b border-[#dfe1e6] px-3 py-2 text-left transition-colors last:border-b-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#4c9aff]/25 disabled:cursor-not-allowed disabled:opacity-60',
                      selected
                        ? 'bg-[#f4f8ff] text-[#0747a6]'
                        : 'bg-white text-[#172b4d] hover:bg-[#f7f8fa]',
                    )}
                    disabled={readonly}
                    onClick={() => setSelectedResourceId(candidate.id)}
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-[13px] font-bold">{candidate.name}</span>
                      <span className={cn('mt-1 block text-[11px] font-medium', selected ? 'text-[#0747a6]/80' : 'text-[#5e6c84]')}>
                        {getResourceTypeLabel(candidate)}{candidate.isActive ? '' : ' · неактивен'}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'h-3 w-3 shrink-0 rounded-full border',
                        selected ? 'border-[#0747a6] bg-[#0747a6] shadow-[inset_0_0_0_3px_white]' : 'border-[#c1c7d0]',
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </section>

          <div className="pt-1">
            <button
              type="submit"
              className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-[12px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={readonly || !onResourceChange || selectedResourceId === metadata.resourceId}
            >
              Сохранить
            </button>
          </div>
        </form>
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
