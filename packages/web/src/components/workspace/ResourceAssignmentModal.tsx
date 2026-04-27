import type { FormEvent } from 'react';

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
}

function toggleSelection(current: string[], resourceId: string, checked: boolean): string[] {
  if (checked) {
    return current.includes(resourceId) ? current : [...current, resourceId];
  }

  return current.filter((id) => id !== resourceId);
}

function formatResourceLabel(resource: ProjectResource): string {
  return resource.name?.trim() || resource.id;
}

export function ResourceAssignmentModal({
  task,
  activeAssignedResources,
  inactiveAssignedResources,
  assignableResources,
  selectedResourceIds,
  pending = false,
  error = null,
  onSelectionChange,
  onCancel,
  onSubmit,
}: ResourceAssignmentModalProps) {
  const selectedIds = Array.isArray(selectedResourceIds) ? selectedResourceIds : [];
  const selectedIdSet = new Set(selectedIds);
  const hasAssignableResources = assignableResources.length > 0;
  const isSubmitDisabled = pending || !task || !hasAssignableResources;
  const taskName = task?.name?.trim() || 'Задача не выбрана';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitDisabled) {
      return;
    }

    onSubmit(selectedIds);
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

          <section aria-labelledby="assignment-active-heading" className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900" id="assignment-active-heading">
              Текущие активные назначения
            </h3>
            {activeAssignedResources.length > 0 ? (
              <ul className="space-y-1" data-testid="assignment-modal-active-assigned">
                {activeAssignedResources.map(({ resource, assignment }) => (
                  <li className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-900" data-testid={`assigned-active-resource-${resource.id}`} key={assignment.id}>
                    {formatResourceLabel(resource)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-500" data-testid="assignment-modal-no-active-assigned">
                Активные ресурсы пока не назначены.
              </p>
            )}
          </section>

          <section aria-labelledby="assignment-historical-heading" className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900" id="assignment-historical-heading">
              Исторические неактивные назначения
            </h3>
            {inactiveAssignedResources.length > 0 ? (
              <ul className="space-y-1" data-testid="assignment-modal-inactive-assigned">
                {inactiveAssignedResources.map(({ resource, assignment }) => (
                  <li className="rounded-md bg-amber-50 px-3 py-2 text-amber-900" data-testid={`assigned-inactive-resource-${resource.id}`} key={assignment.id}>
                    {formatResourceLabel(resource)} недоступен для новых назначений
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-500" data-testid="assignment-modal-no-inactive-assigned">
                Неактивных исторических назначений нет.
              </p>
            )}
          </section>

          <fieldset className="space-y-2" disabled={pending || !task}>
            <legend className="text-sm font-semibold text-slate-900">Активные ресурсы для назначения</legend>
            {hasAssignableResources ? (
              <div className="space-y-2" data-testid="assignment-modal-resource-options">
                {assignableResources.map((resource) => {
                  const checked = selectedIdSet.has(resource.id);
                  return (
                    <label
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800 transition-colors hover:bg-slate-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                      data-testid={`assignment-resource-option-${resource.id}`}
                      key={resource.id}
                    >
                      <input
                        checked={checked}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                        data-testid={`assignment-resource-checkbox-${resource.id}`}
                        disabled={pending || !task}
                        onChange={(event) => onSelectionChange(toggleSelection(selectedIds, resource.id, event.target.checked))}
                        type="checkbox"
                        value={resource.id}
                      />
                      <span>{formatResourceLabel(resource)}</span>
                    </label>
                  );
                })}
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
