import type { FormEvent } from 'react';
import { Plus, X } from 'lucide-react';

import type { ProjectResource } from '../../lib/apiTypes.ts';
import type { Task } from '../../types.ts';
import type { TaskResourceAssignmentView } from './resourceAssignmentUtils.ts';

export interface ResourceAssignmentModalProps {
  task: Task | null;
  activeAssignedResources: TaskResourceAssignmentView[];
  inactiveAssignedResources: TaskResourceAssignmentView[];
  assignableResources: ProjectResource[];
  selectedResourceIds: string[];
  pending?: boolean;
  error?: string | null;
  onSelectionChange: (resourceIds: string[]) => void;
  onCancel: () => void;
  onSubmit: (resourceIds: string[]) => void;
  onCreateResource?: () => void;
}

function formatResourceLabel(resource: ProjectResource): string {
  return resource.name?.trim() || resource.id;
}

export function ResourceAssignmentModal({
  task,
  activeAssignedResources,
  assignableResources,
  selectedResourceIds,
  pending = false,
  error = null,
  onSelectionChange,
  onCancel,
  onSubmit,
  onCreateResource,
}: ResourceAssignmentModalProps) {
  const selectedIds = Array.isArray(selectedResourceIds) ? selectedResourceIds : [];
  const selectedIdSet = new Set(selectedIds);
  const hasAssignableResources = assignableResources.length > 0;
  const isSubmitDisabled = pending || !task || !hasAssignableResources;
  const taskName = task?.name?.trim() || 'Задача не выбрана';
  const availableResources = assignableResources.filter((resource) => !selectedIdSet.has(resource.id));
  const resourceLabelsById = new Map<string, string>();

  for (const { resource } of activeAssignedResources) {
    resourceLabelsById.set(resource.id, formatResourceLabel(resource));
  }

  for (const resource of assignableResources) {
    resourceLabelsById.set(resource.id, formatResourceLabel(resource));
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitDisabled) {
      return;
    }

    onSubmit(selectedIds);
  };

  const removeSelectedResource = (resourceId: string) => {
    onSelectionChange(selectedIds.filter((id) => id !== resourceId));
  };

  return (
    <div
      aria-describedby={error ? 'resource-assignment-modal-error' : undefined}
      aria-labelledby="resource-assignment-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6"
      data-testid="resource-assignment-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onCancel();
        }
      }}
      role="dialog"
    >
      <form
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Назначение ресурсов</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900" data-testid="assignment-modal-task-name" id="resource-assignment-modal-title">
            {taskName}
          </h2>
          {!task && (
            <p className="mt-2 text-sm text-amber-700" data-testid="assignment-modal-empty-task">
              Выберите задачу, чтобы изменить назначения.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4 text-sm text-slate-700">
          {error && (
            <div
              aria-atomic="true"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              data-testid="assignment-modal-error"
              id="resource-assignment-modal-error"
              role="alert"
            >
              {error}
            </div>
          )}

          <section aria-labelledby="assignment-current-heading" className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900" id="assignment-current-heading">
              Текущие назначения
            </h3>
            {selectedIds.length > 0 ? (
              <div className="flex flex-wrap gap-2" data-testid="assignment-modal-selected-resources">
                {selectedIds.map((resourceId) => {
                  const label = resourceLabelsById.get(resourceId) ?? resourceId;
                  return (
                    <span
                      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md bg-violet-50 px-2.5 py-1 text-sm font-medium text-violet-800"
                      data-testid={`assigned-selected-resource-${resourceId}`}
                      key={resourceId}
                      title={label}
                    >
                      <span className="min-w-0 truncate">{label}</span>
                      <button
                        aria-label={`Снять ресурс ${label}`}
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-violet-500 transition-colors hover:bg-violet-100 hover:text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                        data-testid={`assignment-selected-resource-remove-${resourceId}`}
                        disabled={pending || !task}
                        onClick={() => removeSelectedResource(resourceId)}
                        type="button"
                      >
                        <X aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-slate-500" data-testid="assignment-modal-no-selected-resources">
                Пока пусто.
              </p>
            )}
          </section>

          <fieldset className="space-y-2" disabled={pending || !task}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">Пул ресурсов</span>
              {onCreateResource && (
                <button
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="assignment-modal-create-resource"
                  disabled={pending || !task}
                  onClick={onCreateResource}
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Ресурс</span>
                </button>
              )}
            </div>
            {hasAssignableResources ? (
              <div className="flex flex-wrap gap-2" data-testid="assignment-modal-resource-options">
                {availableResources.length > 0 ? availableResources.map((resource) => {
                  const label = formatResourceLabel(resource);
                  return (
                    <button
                      className="inline-flex max-w-full items-center rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid={`assignment-resource-option-${resource.id}`}
                      disabled={pending || !task}
                      key={resource.id}
                      onClick={() => onSelectionChange([...selectedIds, resource.id])}
                      type="button"
                    >
                      <span className="min-w-0 truncate">{label}</span>
                    </button>
                  );
                }) : (
                  <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-500" data-testid="assignment-modal-all-resources-selected">
                    Все доступные ресурсы назначены.
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800" data-testid="assignment-modal-no-assignable-resources">
                Нет активных ресурсов для назначения.
              </p>
            )}
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Закрыть окно назначения ресурсов"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            Отмена
          </button>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
            data-testid="assignment-modal-submit"
            aria-busy={pending}
            disabled={isSubmitDisabled}
            type="submit"
          >
            {pending ? 'Сохраняем назначение…' : 'Сохранить назначения'}
          </button>
        </div>
      </form>
    </div>
  );
}
