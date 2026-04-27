import { useEffect } from 'react';

import type { ProjectResource } from '../../lib/apiTypes.ts';
import { getPlannerItemMetadata, type ResourcePlannerTimelineItem } from './resourcePlannerAdapter.ts';

interface ResourceAssignmentDetailsPanelProps {
  item: ResourcePlannerTimelineItem;
  resource: ProjectResource | null;
  resources: ProjectResource[];
  readonly: boolean;
  onClose: () => void;
  onResourceChange?: (input: { assignmentId: string; resourceId: string }) => void;
  onRemoveResource?: (input: { assignmentId: string; resourceId: string }) => void;
}

export function ResourceAssignmentDetailsPanel({
  item,
  resource,
  resources,
  readonly,
  onClose,
  onResourceChange,
  onRemoveResource,
}: ResourceAssignmentDetailsPanelProps) {
  const metadata = getPlannerItemMetadata(item);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!metadata) {
    return null;
  }

  const disabledReason = readonly
    ? 'Войдите, чтобы изменять ресурсы. Сейчас календарь открыт только для просмотра.'
    : null;

  return (
    <aside
      aria-label="Детали назначения"
      className="flex min-h-0 w-full flex-col border-t border-slate-200 bg-white lg:w-[360px] lg:border-l lg:border-t-0"
      data-testid="assignment-details-panel"
      role="dialog"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Задача</div>
          <h2 className="mt-1 truncate text-base font-semibold leading-tight text-slate-900">{item.title}</h2>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="Закрыть детали назначения"
          data-testid="assignment-details-close"
          onClick={onClose}
        >
          X
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 text-sm text-slate-700">
        {disabledReason && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            {disabledReason}
          </div>
        )}

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            onResourceChange?.({
              assignmentId: metadata.assignmentId,
              resourceId: String(formData.get('resourceId') ?? metadata.resourceId),
            });
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Ресурс
            <select
              name="resourceId"
              defaultValue={metadata.resourceId}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition-colors focus:border-primary disabled:bg-slate-100 disabled:text-slate-500"
              disabled={readonly}
            >
              {resources.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
              {resources.length === 0 && <option value={metadata.resourceId}>{metadata.resourceName}</option>}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={readonly || !onResourceChange}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition-colors hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={readonly || !onRemoveResource}
              onClick={() => onRemoveResource?.({ assignmentId: metadata.assignmentId, resourceId: metadata.resourceId })}
            >
              Удалить
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
