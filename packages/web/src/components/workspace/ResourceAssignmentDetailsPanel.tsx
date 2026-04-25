import { useEffect } from 'react';

import type { ProjectResource } from '../../lib/apiTypes.ts';
import type { PlannerCorrectionTarget } from '../../stores/useUIStore.ts';
import { getPlannerItemMetadata, type ResourcePlannerTimelineItem } from './resourcePlannerAdapter.ts';

interface ResourceAssignmentDetailsPanelProps {
  item: ResourcePlannerTimelineItem;
  resource: ProjectResource | null;
  resources: ProjectResource[];
  readonly: boolean;
  onClose: () => void;
  onCorrectConflict: (target: PlannerCorrectionTarget) => void;
  onOpenTask?: (taskId: string, projectId: string) => void;
  onDateChange?: (input: { assignmentId: string; startDate: string; endDate: string }) => void;
  onResourceChange?: (input: { assignmentId: string; resourceId: string }) => void;
  onRemoveResource?: (input: { assignmentId: string; resourceId: string }) => void;
}

function formatResourceType(resource: ProjectResource | null): string {
  if (!resource) {
    return 'Не найден в каталоге';
  }

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
  readonly,
  onClose,
  onCorrectConflict,
  onOpenTask,
  onDateChange,
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
      className="flex min-h-0 w-full flex-col border-t border-slate-200 bg-white lg:w-[380px] lg:border-l lg:border-t-0"
      data-testid="assignment-details-panel"
      role="dialog"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold leading-tight text-slate-900">Детали назначения</h2>
          <p className="mt-1 truncate text-sm text-slate-600">{item.title}</p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#6158e0]"
          aria-label="Закрыть детали назначения"
          data-testid="assignment-details-close"
          onClick={onClose}
        >
          X
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 text-sm text-slate-700">
        <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2">
          <dt className="text-slate-500">Задача</dt>
          <dd className="min-w-0 truncate font-semibold text-slate-900">{item.title}</dd>
          <dt className="text-slate-500">Проект</dt>
          <dd className="min-w-0 truncate">{metadata.projectName}</dd>
          <dt className="text-slate-500">Ресурс</dt>
          <dd className="min-w-0 truncate">{metadata.resourceName}</dd>
          <dt className="text-slate-500">Тип</dt>
          <dd>{formatResourceType(resource)}</dd>
          <dt className="text-slate-500">Даты</dt>
          <dd className="tabular-nums">{String(item.startDate)} - {String(item.endDate)}</dd>
          <dt className="text-slate-500">Assignment ID</dt>
          <dd className="min-w-0 truncate font-mono text-xs">{metadata.assignmentId}</dd>
          <dt className="text-slate-500">Конфликты</dt>
          <dd className="min-w-0 truncate">{metadata.conflictAssignmentIds.length > 0 ? metadata.conflictAssignmentIds.join(', ') : 'Нет'}</dd>
        </dl>

        {disabledReason && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            {disabledReason}
          </div>
        )}

        <div className="grid gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => onOpenTask?.(metadata.taskId, metadata.projectId)}
          >
            Открыть задачу
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="assignment-details-correct"
            disabled={!metadata.hasConflict}
            onClick={() => onCorrectConflict({
              projectId: metadata.projectId,
              taskId: metadata.taskId,
              assignmentId: metadata.assignmentId,
              resourceId: metadata.resourceId,
            })}
          >
            Исправить конфликт
          </button>
        </div>

        <form
          className="space-y-3 rounded-md border border-slate-200 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            onDateChange?.({
              assignmentId: metadata.assignmentId,
              startDate: String(formData.get('startDate') ?? item.startDate),
              endDate: String(formData.get('endDate') ?? item.endDate),
            });
          }}
        >
          <h3 className="text-base font-semibold text-slate-900">Сменить даты</h3>
          <label className="flex flex-col gap-1 text-sm">
            Начало
            <input name="startDate" type="date" defaultValue={String(item.startDate)} className="h-9 rounded-md border border-slate-300 px-2" disabled={readonly} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Конец
            <input name="endDate" type="date" defaultValue={String(item.endDate)} className="h-9 rounded-md border border-slate-300 px-2" disabled={readonly} />
          </label>
          <button type="submit" className="inline-flex h-9 items-center justify-center rounded-md bg-[#6158e0] px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={readonly || !onDateChange}>
            Сохранить даты
          </button>
        </form>

        <form
          className="space-y-3 rounded-md border border-slate-200 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            onResourceChange?.({
              assignmentId: metadata.assignmentId,
              resourceId: String(formData.get('resourceId') ?? metadata.resourceId),
            });
          }}
        >
          <h3 className="text-base font-semibold text-slate-900">Сменить ресурс</h3>
          <label className="flex flex-col gap-1 text-sm">
            Ресурс
            <select name="resourceId" defaultValue={metadata.resourceId} className="h-9 rounded-md border border-slate-300 px-2" disabled={readonly}>
              {resources.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
              {resources.length === 0 && <option value={metadata.resourceId}>{metadata.resourceName}</option>}
            </select>
          </label>
          <button type="submit" className="inline-flex h-9 items-center justify-center rounded-md bg-[#6158e0] px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={readonly || !onResourceChange}>
            Сменить ресурс
          </button>
        </form>

        <button
          type="button"
          className="inline-flex h-9 w-full items-center justify-center rounded-md border border-red-300 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={readonly || !onRemoveResource}
          onClick={() => onRemoveResource?.({ assignmentId: metadata.assignmentId, resourceId: metadata.resourceId })}
        >
          Убрать ресурс с задачи
        </button>
      </div>
    </aside>
  );
}
