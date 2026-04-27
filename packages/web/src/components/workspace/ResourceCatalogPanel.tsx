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
  readonly: boolean;
  loading: boolean;
  error: string | null;
  mutationError: string | null;
  pendingResourceId: string | null;
  rowStats: Map<string, ResourceCatalogRowStats>;
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
  readonly,
  loading,
  error,
  mutationError,
  pendingResourceId,
  rowStats,
  onRenameResource,
  onChangeResourceType,
  onSetResourceActive,
}: ResourceCatalogPanelProps) {
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

  return (
    <section className="h-full" data-testid="resource-management-panel">
      <div className="flex h-full min-h-0 flex-col">
        {readonly && (
          <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600" data-testid="resource-catalog-readonly">
            Войдите, чтобы изменять ресурсы. Сейчас календарь открыт только для просмотра.
          </div>
        )}

        {mutationError && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="resource-catalog-mutation-error" role="alert">
            {mutationError}
          </div>
        )}

        {loading && <div className="text-xs text-slate-500">Загрузка списка ресурсов...</div>}
        {error && <div className="text-xs text-red-700" data-testid="resource-list-error" role="alert">{error}</div>}

        {resources.length > 0 ? (
          <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1" data-testid="resource-catalog-list">
              {resources.map((resource) => {
                const stats = rowStats.get(resource.id) ?? { assignmentCount: 0, conflictCount: 0 };
                const isPending = pendingResourceId === resource.id;
                const actionsDisabled = readonly || isPending;
                const renameDraft = renameDrafts[resource.id] ?? resource.name;

                return (
                  <div key={resource.id} className="rounded-lg border border-slate-200 bg-white p-2.5" data-testid={`resource-catalog-row-${resource.id}`}>
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900">{resource.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                          <span>{RESOURCE_SCOPE_LABELS[resource.scope]}</span>
                          <span>{formatResourceType(resource.type)}</span>
                          <span>{stats.assignmentCount} назнач.</span>
                          {stats.conflictCount > 0 && <span className="text-amber-700">{stats.conflictCount} конфликт.</span>}
                        </div>
                      </div>
                      <span className={resource.isActive ? 'shrink-0 text-[11px] font-medium text-emerald-700' : 'shrink-0 text-[11px] font-medium text-slate-500'}>
                        {resource.isActive ? 'Активен' : 'Неактивен'}
                      </span>
                    </div>

                    <div className="mt-2 flex gap-1.5">
                      <label className="sr-only" htmlFor={`resource-rename-${resource.id}`}>Новое название</label>
                      <input
                        id={`resource-rename-${resource.id}`}
                        className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none transition-colors focus:border-primary disabled:bg-slate-100 disabled:text-slate-500"
                        data-testid={`resource-rename-input-${resource.id}`}
                        disabled={actionsDisabled}
                        value={renameDraft}
                        onChange={(event) => setRenameDrafts((current) => ({ ...current, [resource.id]: event.target.value }))}
                      />
                      <button
                        type="button"
                        className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:border-primary hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        data-testid={`resource-rename-save-${resource.id}`}
                        disabled={actionsDisabled || renameDraft.trim().length === 0 || renameDraft.trim() === resource.name}
                        onClick={() => { void onRenameResource(resource, renameDraft); }}
                      >
                        Сохранить
                      </button>
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <label className="sr-only" htmlFor={`resource-type-${resource.id}`}>Тип ресурса</label>
                      <select
                        id={`resource-type-${resource.id}`}
                        className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none transition-colors focus:border-primary disabled:bg-slate-100 disabled:text-slate-500"
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
                          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-white px-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
                          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-white px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
        ) : !loading ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
            В пуле пока нет ресурсов.
          </div>
        ) : null}
      </div>
    </section>
  );
}
