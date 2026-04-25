import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import type { ProjectResource, ResourceScope, ResourceType } from '../../lib/apiTypes.ts';

export interface ResourceCatalogRowStats {
  assignmentCount: number;
  conflictCount: number;
}

export interface ResourceCatalogProjectOption {
  id: string;
  name: string;
}

interface ResourceCatalogPanelProps {
  resources: ProjectResource[];
  activeProjects: ResourceCatalogProjectOption[];
  readonly: boolean;
  loading: boolean;
  creating: boolean;
  error: string | null;
  createError: string | null;
  mutationError: string | null;
  pendingResourceId: string | null;
  nameDraft: string;
  targetDraft: string;
  typeDraft: ResourceType;
  rowStats: Map<string, ResourceCatalogRowStats>;
  onNameDraftChange: (value: string) => void;
  onTargetDraftChange: (value: string) => void;
  onTypeDraftChange: (value: ResourceType) => void;
  onCreate: () => void | Promise<void>;
  onRenameResource: (resource: ProjectResource, name: string) => void | Promise<void>;
  onChangeResourceType: (resource: ProjectResource, type: ResourceType) => void | Promise<void>;
  onSetResourceActive: (resource: ProjectResource, isActive: boolean) => void | Promise<void>;
}

const RESOURCE_TYPE_OPTIONS: Array<{ type: ResourceType; label: string }> = [
  { type: 'human', label: 'Люди' },
  { type: 'equipment', label: 'Оборудование' },
  { type: 'material', label: 'Материалы' },
  { type: 'other', label: 'Другое' },
];

const RESOURCE_SCOPE_LABELS: Record<ResourceScope, string> = {
  shared: 'shared',
  project: 'project',
};

function formatResourceType(type: ResourceType): string {
  return RESOURCE_TYPE_OPTIONS.find((option) => option.type === type)?.label ?? type;
}

function isResourceType(value: string): value is ResourceType {
  return value === 'human' || value === 'equipment' || value === 'material' || value === 'other';
}

export function ResourceCatalogPanel({
  resources,
  activeProjects,
  readonly,
  loading,
  creating,
  error,
  createError,
  mutationError,
  pendingResourceId,
  nameDraft,
  targetDraft,
  typeDraft,
  rowStats,
  onNameDraftChange,
  onTargetDraftChange,
  onTypeDraftChange,
  onCreate,
  onRenameResource,
  onChangeResourceType,
  onSetResourceActive,
}: ResourceCatalogPanelProps) {
  const sharedResourceCount = resources.filter((resource) => resource.scope === 'shared').length;
  const projectResourceCount = resources.filter((resource) => resource.scope === 'project').length;
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setRenameDrafts((current) => {
      const next: Record<string, string> = {};
      for (const resource of resources) {
        next[resource.id] = current[resource.id] ?? resource.name;
      }
      return next;
    });
  }, [resources]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onCreate();
  };

  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4" data-testid="resource-management-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">Создать ресурс</h2>
          <p className="mt-1 text-xs text-slate-500">
            Shared ресурсы видны в planner по всем проектам workspace; проектные ресурсы доступны только выбранному проекту.
          </p>
          {readonly && (
            <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600" data-testid="resource-catalog-readonly">
              Войдите, чтобы изменять ресурсы. Сейчас календарь открыт только для просмотра.
            </div>
          )}
          <form className="mt-3 grid gap-3 md:grid-cols-[minmax(180px,1fr)_220px_180px_auto]" data-testid="resource-create-form" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Название
              <input
                id="resource-create-name"
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                data-testid="resource-create-name-input"
                disabled={readonly || creating}
                placeholder="Например: Бригада 1"
                value={nameDraft}
                onChange={(event) => onNameDraftChange(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Где создать
              <select
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                data-testid="resource-create-target-select"
                disabled={readonly || creating}
                value={targetDraft}
                onChange={(event) => onTargetDraftChange(event.target.value)}
              >
                <option value="shared">Shared workspace</option>
                {activeProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    Проект: {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Тип
              <select
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                data-testid="resource-create-type-select"
                disabled={readonly || creating}
                value={typeDraft}
                onChange={(event) => {
                  if (isResourceType(event.target.value)) {
                    onTypeDraftChange(event.target.value);
                  }
                }}
              >
                {RESOURCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.type} value={option.type}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 md:self-end"
              data-testid="resource-create-submit"
              disabled={readonly || creating || nameDraft.trim().length === 0}
            >
              {creating ? 'Создание...' : 'Создать ресурс'}
            </button>
          </form>
          {createError && (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="resource-create-error" role="alert">
              {createError}
            </div>
          )}
          {mutationError && (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="resource-catalog-mutation-error" role="alert">
              {mutationError}
            </div>
          )}
        </div>
        <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 lg:w-[360px]" data-testid="resource-catalog-summary">
          <div className="font-semibold text-slate-800">Каталог ресурсов</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-2 py-1">Shared: {sharedResourceCount}</span>
            <span className="rounded-full bg-white px-2 py-1">Project: {projectResourceCount}</span>
          </div>
          {loading && <div className="mt-2 text-slate-500">Загрузка списка ресурсов...</div>}
          {error && <div className="mt-2 text-red-700" data-testid="resource-list-error" role="alert">{error}</div>}
          {resources.length > 0 && (
            <div className="mt-3 max-h-56 space-y-2 overflow-auto" data-testid="resource-catalog-list">
              {resources.map((resource) => {
                const stats = rowStats.get(resource.id) ?? { assignmentCount: 0, conflictCount: 0 };
                const isPending = pendingResourceId === resource.id;
                const actionsDisabled = readonly || isPending || creating;
                const renameDraft = renameDrafts[resource.id] ?? resource.name;

                return (
                  <div key={resource.id} className="rounded bg-white px-2 py-2" data-testid={`resource-catalog-row-${resource.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-slate-800">{resource.name}</span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{RESOURCE_SCOPE_LABELS[resource.scope]}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">{formatResourceType(resource.type)}</span>
                      <span className={resource.isActive ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700' : 'rounded-full bg-slate-100 px-2 py-0.5 text-slate-500'}>
                        {resource.isActive ? 'Активен' : 'Неактивен'}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">Назначений: {stats.assignmentCount}</span>
                      <span className={stats.conflictCount > 0 ? 'rounded-full bg-amber-50 px-2 py-0.5 text-amber-700' : 'rounded-full bg-slate-100 px-2 py-0.5'}>
                        Конфликтов: {stats.conflictCount}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <label className="sr-only" htmlFor={`resource-rename-${resource.id}`}>Новое название</label>
                      <input
                        id={`resource-rename-${resource.id}`}
                        className="h-8 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                        data-testid={`resource-rename-input-${resource.id}`}
                        disabled={actionsDisabled}
                        value={renameDraft}
                        onChange={(event) => setRenameDrafts((current) => ({ ...current, [resource.id]: event.target.value }))}
                      />
                      <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        data-testid={`resource-rename-save-${resource.id}`}
                        disabled={actionsDisabled || renameDraft.trim().length === 0 || renameDraft.trim() === resource.name}
                        onClick={() => { void onRenameResource(resource, renameDraft); }}
                      >
                        Переименовать
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <label className="sr-only" htmlFor={`resource-type-${resource.id}`}>Тип ресурса</label>
                      <select
                        id={`resource-type-${resource.id}`}
                        className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                        data-testid={`resource-type-select-${resource.id}`}
                        disabled={actionsDisabled}
                        value={resource.type}
                        onChange={(event) => {
                          if (isResourceType(event.target.value)) {
                            void onChangeResourceType(resource, event.target.value);
                          }
                        }}
                      >
                        {RESOURCE_TYPE_OPTIONS.map((option) => (
                          <option key={option.type} value={option.type}>{option.label}</option>
                        ))}
                      </select>
                      {resource.isActive ? (
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-md border border-red-200 bg-white px-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          data-testid={`resource-deactivate-${resource.id}`}
                          disabled={actionsDisabled}
                          onClick={() => {
                            if (window.confirm('Ресурс станет недоступен для новых назначений. Продолжить?')) {
                              void onSetResourceActive(resource, false);
                            }
                          }}
                        >
                          Деактивировать
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-md border border-emerald-200 bg-white px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          data-testid={`resource-activate-${resource.id}`}
                          disabled={actionsDisabled}
                          onClick={() => { void onSetResourceActive(resource, true); }}
                        >
                          Активировать
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
