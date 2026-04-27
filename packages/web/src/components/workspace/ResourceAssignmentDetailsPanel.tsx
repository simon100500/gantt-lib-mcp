import { useEffect, useMemo, useState } from 'react';

import type { ProjectResource } from '../../lib/apiTypes.ts';
import { cn } from '../../lib/utils.ts';
import { getPlannerItemMetadata, type ResourcePlannerTimelineItem } from './resourcePlannerAdapter.ts';

interface ResourceAssignmentDetailsPanelProps {
  item: ResourcePlannerTimelineItem;
  resource: ProjectResource | null;
  resources: ProjectResource[];
  assignedResources: ProjectResource[];
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
      if (seen.has(candidate.id)) {
        return false;
      }
      seen.add(candidate.id);
      return true;
    });
  }, [assignedResources]);

  if (!metadata) {
    return null;
  }

  const disabledReason = readonly
    ? 'Войдите, чтобы изменять ресурсы. Сейчас календарь открыт только для просмотра.'
    : null;
  const currentResourceName = resource?.name ?? metadata.resourceName;
  const selectableResources = resources.length > 0 ? resources : resource ? [resource] : [];

  return (
    <aside
      aria-label="Детали назначения"
      className="flex min-h-0 w-full flex-col bg-white lg:w-[380px]"
      data-testid="assignment-details-panel"
      role="dialog"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Задача</div>
          <h2 className="mt-1 break-words text-base font-semibold leading-snug text-slate-900">{item.title}</h2>
          <div className="mt-2 text-xs tabular-nums text-slate-500">
            {formatDate(item.startDate)} - {formatDate(item.endDate)}
          </div>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="Закрыть детали назначения"
          data-testid="assignment-details-close"
          onClick={onClose}
        >
          X
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 text-sm text-slate-700">
        {disabledReason && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
            {disabledReason}
          </div>
        )}

        <section className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Назначены на задачу</div>
          <div className="space-y-2">
            {uniqueAssignedResources.length > 0 ? uniqueAssignedResources.map((assignedResource) => (
              <div
                key={assignedResource.id}
                className={cn(
                  'flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2',
                  assignedResource.id === metadata.resourceId
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-slate-200 bg-slate-50',
                )}
              >
                <div className="min-w-0">
                  <div className="break-words text-sm font-medium text-slate-900">{assignedResource.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{getResourceTypeLabel(assignedResource)}</div>
                </div>
                {assignedResource.id === metadata.resourceId && (
                  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                    Текущее
                  </span>
                )}
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-sm text-slate-500">
                {currentResourceName}
              </div>
            )}
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
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Сменить назначение</div>
            <div className="max-h-56 space-y-1.5 overflow-auto pr-1">
              {selectableResources.map((candidate) => {
                const selected = candidate.id === selectedResourceId;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    className={cn(
                      'flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60',
                      selected
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                    )}
                    disabled={readonly}
                    onClick={() => setSelectedResourceId(candidate.id)}
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-medium">{candidate.name}</span>
                      <span className={cn('mt-0.5 block text-xs', selected ? 'text-primary/80' : 'text-slate-500')}>
                        {getResourceTypeLabel(candidate)}{candidate.isActive ? '' : ' · неактивен'}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'h-3 w-3 shrink-0 rounded-full border',
                        selected ? 'border-primary bg-primary shadow-[inset_0_0_0_3px_white]' : 'border-slate-300',
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </section>

          <div className="grid gap-2 pt-1">
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={readonly || !onResourceChange || selectedResourceId === metadata.resourceId}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition-colors hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={readonly || !onRemoveResource}
              onClick={() => onRemoveResource?.({ assignmentId: metadata.assignmentId, resourceId: metadata.resourceId })}
            >
              Снять назначение
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
