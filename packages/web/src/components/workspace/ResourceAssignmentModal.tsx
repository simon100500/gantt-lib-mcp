import { useMemo, useState, type FormEvent } from 'react';
import { ExternalLink, Plus, Search, X } from 'lucide-react';

import type { ProjectResource } from '../../lib/apiTypes.ts';
import type { Task } from '../../types.ts';
import { Input } from '../ui/input.tsx';
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
  onOpenPlannerAssignment?: (assignment: TaskResourceAssignmentView) => void;
}

function formatResourceLabel(resource: ProjectResource): string {
  return resource.name?.trim() || resource.id;
}

const RESOURCE_TYPE_FILTERS = [
  { type: 'all' as const, label: 'Все' },
  { type: 'human' as const, label: 'Люди' },
  { type: 'equipment' as const, label: 'Оборудование' },
  { type: 'material' as const, label: 'Материалы' },
  { type: 'other' as const, label: 'Другое' },
];

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
  onOpenPlannerAssignment,
}: ResourceAssignmentModalProps) {
  const [searchValue, setSearchValue] = useState('');
  const [typeFilter, setTypeFilter] = useState<(typeof RESOURCE_TYPE_FILTERS)[number]['type']>('all');
  const selectedIds = Array.isArray(selectedResourceIds) ? selectedResourceIds : [];
  const selectedIdSet = new Set(selectedIds);
  const hasAssignableResources = assignableResources.length > 0;
  const isSubmitDisabled = pending || !task || !hasAssignableResources;
  const taskName = task?.name?.trim() || 'Задача не выбрана';
  const availableResources = assignableResources.filter((resource) => !selectedIdSet.has(resource.id));
  const normalizedSearch = searchValue.trim().toLocaleLowerCase('ru-RU');
  const resourceLabelsById = new Map<string, string>();
  const resourcesById = new Map<string, ProjectResource>();
  const activeAssignmentsByResourceId = new Map<string, TaskResourceAssignmentView>();

  for (const assignmentView of activeAssignedResources) {
    resourceLabelsById.set(assignmentView.resource.id, formatResourceLabel(assignmentView.resource));
    resourcesById.set(assignmentView.resource.id, assignmentView.resource);
    activeAssignmentsByResourceId.set(assignmentView.resource.id, assignmentView);
  }

  for (const resource of assignableResources) {
    resourceLabelsById.set(resource.id, formatResourceLabel(resource));
    resourcesById.set(resource.id, resource);
  }

  const filteredAvailableResources = useMemo(() => availableResources.filter((resource) => {
    if (typeFilter !== 'all' && resource.type !== typeFilter) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return formatResourceLabel(resource).toLocaleLowerCase('ru-RU').includes(normalizedSearch);
  }), [availableResources, normalizedSearch, typeFilter]);

  const resourceGroups = useMemo(() => [
    { type: 'human' as const, label: 'Люди', resources: filteredAvailableResources.filter((resource) => resource.type === 'human') },
    { type: 'equipment' as const, label: 'Оборудование', resources: filteredAvailableResources.filter((resource) => resource.type === 'equipment') },
    { type: 'material' as const, label: 'Материалы', resources: filteredAvailableResources.filter((resource) => resource.type === 'material') },
    { type: 'other' as const, label: 'Другое', resources: filteredAvailableResources.filter((resource) => resource.type === 'other') },
  ].filter((group) => group.resources.length > 0), [filteredAvailableResources]);
  const hasResourceFilters = hasAssignableResources && availableResources.length > 0;
  const hasFilteredResources = resourceGroups.length > 0;
  const hasSearchOrTypeFilter = normalizedSearch.length > 0 || typeFilter !== 'all';

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

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4 text-sm text-[#44546f]">
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
              <div
                className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
                data-testid="assignment-modal-selected-resources"
              >
                {selectedIds.map((resourceId) => {
                  const label = resourceLabelsById.get(resourceId) ?? resourceId;
                  const resource = resourcesById.get(resourceId);
                  const activeAssignment = activeAssignmentsByResourceId.get(resourceId);
                  return (
                    <div
                      className="flex min-w-0 max-w-full items-start justify-between gap-2 rounded-lg border border-[#dfe1e6] bg-[#f7f8fa] px-2.5 py-2 text-[#172b4d]"
                      data-testid={`assigned-selected-resource-${resourceId}`}
                      key={resourceId}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start gap-1.5">
                          {resource && <ResourceTypeIcon type={resource.type} className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                          <span className="min-w-0 whitespace-normal break-words text-[12px] font-semibold leading-4 text-[#172b4d]">{label}</span>
                        </div>
                        {activeAssignment && onOpenPlannerAssignment && (
                          <button
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium leading-none text-[#6b778c] transition-colors hover:text-[#44546f] focus:outline-none focus:ring-2 focus:ring-[#4c9aff]/25"
                            data-testid={`assignment-selected-resource-chip-${resourceId}`}
                            disabled={pending}
                            onClick={() => onOpenPlannerAssignment(activeAssignment)}
                            title={`${label}. Открыть назначение в ресурсах`}
                            type="button"
                          >
                            <span>Перейти</span>
                            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                          </button>
                        )}
                      </div>
                      <button
                        aria-label={`Снять ресурс ${label}`}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-[#6b778c] transition-colors hover:bg-white hover:text-[#172b4d] focus:outline-none focus:ring-2 focus:ring-[#4c9aff]/25"
                        data-testid={`assignment-selected-resource-remove-${resourceId}`}
                        disabled={pending || !task}
                        onClick={() => removeSelectedResource(resourceId)}
                        type="button"
                      >
                        <X aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
            {hasResourceFilters && (
              <div className="space-y-2" data-testid="assignment-modal-resource-filters">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b778c]" />
                  <Input
                    className="h-9 border-[#dfe1e6] pl-8 pr-3 text-[13px] text-[#172b4d] placeholder:text-[#6b778c] focus-visible:ring-[#4c9aff]/25"
                    data-testid="assignment-modal-search-input"
                    disabled={pending || !task}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Поиск по названию ресурса"
                    type="search"
                    value={searchValue}
                  />
                </label>
                <div className="flex flex-wrap gap-1.5" data-testid="assignment-modal-type-filters">
                  {RESOURCE_TYPE_FILTERS.map((filter) => {
                    const selected = filter.type === typeFilter;
                    return (
                      <button
                        key={filter.type}
                        type="button"
                        className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-[#4c9aff]/25 ${
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-[#dfe1e6] bg-white text-[#44546f] hover:bg-[#f7f8fa]'
                        }`}
                        data-testid={`assignment-modal-type-filter-${filter.type}`}
                        disabled={pending || !task}
                        onClick={() => setTypeFilter(filter.type)}
                      >
                        {filter.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {hasAssignableResources ? (
              <div className="max-h-72 overflow-auto rounded-md border border-[#dfe1e6] bg-white p-2" data-testid="assignment-modal-resource-options">
                {hasFilteredResources ? resourceGroups.map((group) => (
                  <section key={group.type} className="not-last:mb-3">
                    <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.02em] text-[#44546f]">
                      <span>{group.label}</span>
                      <span className="ml-auto rounded-full bg-[#f1f2f4] px-1.5 py-0.5 text-[10px] normal-case text-[#42526e]">
                        {group.resources.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {group.resources.map((resource) => {
                        const label = formatResourceLabel(resource);
                        return (
                          <button
                            className="group flex min-w-0 items-start gap-2 rounded-lg border border-[#dfe1e6] bg-[#fcfdff] px-2.5 py-2 text-left text-[#172b4d] transition-colors hover:border-[#b3d4ff] hover:bg-[#f4f8ff] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#4c9aff]/25 disabled:cursor-not-allowed disabled:opacity-60"
                            data-testid={`assignment-resource-option-${resource.id}`}
                            disabled={pending || !task}
                            key={resource.id}
                            onClick={() => onSelectionChange([...selectedIds, resource.id])}
                            type="button"
                          >
                            <ResourceTypeIcon type={resource.type} className="mt-0.5 h-4 w-4 shrink-0" />
                            <span className="min-w-0 flex-1 whitespace-normal break-words text-[12px] font-bold leading-4">{label}</span>
                            <span className="shrink-0 self-center text-[10px] font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                              Добавить
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )) : (
                  <p className="px-3 py-3 text-[12px] font-medium text-[#6b778c]" data-testid="assignment-modal-all-resources-selected">
                    {hasSearchOrTypeFilter ? 'По текущим фильтрам ресурсы не найдены.' : 'Все доступные ресурсы назначены.'}
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
