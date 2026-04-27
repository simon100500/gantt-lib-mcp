import type { FormEvent } from 'react';
import { Plus, X } from 'lucide-react';

import type { ProjectResource } from '../../lib/apiTypes.ts';
import type { Task } from '../../types.ts';
import type { TaskResourceAssignmentView } from './resourceAssignmentUtils.ts';
import { ResourceTypeIcon } from './ResourceTypeIcon.tsx';

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
  const resourcesById = new Map<string, ProjectResource>();

  for (const { resource } of activeAssignedResources) {
    resourceLabelsById.set(resource.id, formatResourceLabel(resource));
    resourcesById.set(resource.id, resource);
  }

  for (const resource of assignableResources) {
    resourceLabelsById.set(resource.id, formatResourceLabel(resource));
    resourcesById.set(resource.id, resource);
  }

  const resourceGroups = [
    { type: 'human' as const, label: 'Люди', resources: availableResources.filter((resource) => resource.type === 'human') },
    { type: 'equipment' as const, label: 'Оборудование', resources: availableResources.filter((resource) => resource.type === 'equipment') },
    { type: 'material' as const, label: 'Материалы', resources: availableResources.filter((resource) => resource.type === 'material') },
    { type: 'other' as const, label: 'Другое', resources: availableResources.filter((resource) => resource.type === 'other') },
  ].filter((group) => group.resources.length > 0);

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
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#dfe1e6] bg-white text-[#172b4d] shadow-[0_24px_70px_rgba(9,30,66,0.22)]"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#dfe1e6] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase leading-none text-[#44546f]">Назначение ресурсов</p>
            <h2 className="mt-1 break-words text-[15px] font-bold leading-snug text-[#172b4d]" data-testid="assignment-modal-task-name" id="resource-assignment-modal-title">
              {taskName}
            </h2>
          </div>
          <button
            aria-label="Закрыть окно назначения ресурсов"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-[#6b778c] transition-colors hover:bg-[#f4f5f7] hover:text-[#172b4d] focus:outline-none focus:ring-2 focus:ring-[#4c9aff]/25 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
          {!task && (
            <p className="mt-2 text-sm text-amber-700" data-testid="assignment-modal-empty-task">
              Выберите задачу, чтобы изменить назначения.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4 text-sm text-[#44546f]">
          {error && (
            <div
              aria-atomic="true"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700"
              data-testid="assignment-modal-error"
              id="resource-assignment-modal-error"
              role="alert"
            >
              {error}
            </div>
          )}

          <section aria-labelledby="assignment-current-heading" className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase leading-none text-[#44546f]" id="assignment-current-heading">
              Текущие назначения
            </h3>
            {selectedIds.length > 0 ? (
              <div className="flex flex-wrap gap-2" data-testid="assignment-modal-selected-resources">
                {selectedIds.map((resourceId) => {
                  const label = resourceLabelsById.get(resourceId) ?? resourceId;
                  const resource = resourcesById.get(resourceId);
                  return (
                    <span
                      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-[#b3d4ff] bg-[#deebff] px-2 py-1 text-[12px] font-bold leading-none text-[#0747a6]"
                      data-testid={`assigned-selected-resource-${resourceId}`}
                      key={resourceId}
                      title={label}
                    >
                      {resource && <ResourceTypeIcon type={resource.type} className="h-3.5 w-3.5 shrink-0" />}
                      <span className="min-w-0 truncate">{label}</span>
                      <button
                        aria-label={`Снять ресурс ${label}`}
                        className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-current opacity-70 hover:bg-white/70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#4c9aff]/25"
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
              <p className="rounded-md border border-dashed border-[#dfe1e6] bg-[#f7f8fa] px-3 py-2 text-[12px] font-medium text-[#6b778c]" data-testid="assignment-modal-no-selected-resources">
                Пока пусто.
              </p>
            )}
          </section>

          <fieldset className="space-y-2" disabled={pending || !task}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase leading-none text-[#44546f]">Добавить ресурс</span>
              {onCreateResource && (
                <button
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
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
              <div className="max-h-72 overflow-auto rounded-md border border-[#dfe1e6] bg-white" data-testid="assignment-modal-resource-options">
                {resourceGroups.length > 0 ? resourceGroups.map((group) => (
                  <div key={group.type} className="border-b border-[#dfe1e6] last:border-b-0">
                    <div className="flex items-center gap-1.5 bg-[#f7f8fa] px-3 py-1.5 text-[11px] font-bold text-[#44546f]">
                      <span>{group.label}</span>
                      <span className="ml-auto rounded-full bg-[#dfe1e6] px-1.5 py-0.5 text-[10px] text-[#42526e]">
                        {group.resources.length}
                      </span>
                    </div>
                    {group.resources.map((resource) => {
                      const label = formatResourceLabel(resource);
                      return (
                        <button
                          className="group flex w-full min-w-0 items-center gap-2 border-t border-[#ebecf0] px-3 py-2 text-left text-[#172b4d] transition-colors hover:bg-[#f4f8ff] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#4c9aff]/25 disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid={`assignment-resource-option-${resource.id}`}
                          disabled={pending || !task}
                          key={resource.id}
                          onClick={() => onSelectionChange([...selectedIds, resource.id])}
                          type="button"
                        >
                          <ResourceTypeIcon type={resource.type} className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1 break-words text-[13px] font-bold">{label}</span>
                          <span className="shrink-0 text-[11px] font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                            Добавить
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )) : (
                  <p className="px-3 py-3 text-[12px] font-medium text-[#6b778c]" data-testid="assignment-modal-all-resources-selected">
                    Все доступные ресурсы назначены.
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800" data-testid="assignment-modal-no-assignable-resources">
                Нет активных ресурсов для назначения.
              </p>
            )}
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#dfe1e6] bg-[#f7f8fa] px-4 py-3">
          <button
            className="inline-flex h-8 items-center justify-center rounded-md border border-[#dfe1e6] bg-white px-3 text-[12px] font-bold text-[#44546f] transition-colors hover:bg-[#f4f5f7] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            Отмена
          </button>
          <button
            className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-[12px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
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
