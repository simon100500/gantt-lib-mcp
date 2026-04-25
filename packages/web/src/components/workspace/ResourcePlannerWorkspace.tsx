import { useCallback, useEffect, useMemo, useState } from 'react';
import { GanttChart } from 'gantt-lib';
import type { ResourceTimelineMove } from 'gantt-lib';

import type { PlannerScope, ProjectResource, ResourcePlannerResult, ResourceType } from '../../lib/apiTypes.ts';
import { useAuthStore } from '../../stores/useAuthStore.ts';
import { useProjectStore } from '../../stores/useProjectStore.ts';
import type { PlannerCorrectionTarget } from '../../stores/useUIStore.ts';
import {
  getPlannerItemMetadata,
  mapResourcePlannerResultToTimelineResources,
} from './resourcePlannerAdapter.ts';
import type { ResourcePlannerTimelineItem } from './resourcePlannerAdapter.ts';
import { ResourceCatalogPanel, type ResourceCatalogRowStats } from './ResourceCatalogPanel.tsx';
import { ResourceAssignmentDetailsPanel } from './ResourceAssignmentDetailsPanel.tsx';
import { filterResourceTimelineResources, type ResourcePlannerFilters } from './resourcePlannerFilters.ts';

interface ResourcePlannerWorkspaceProps {
  accessToken?: string | null;
  projectId: string;
  onBackToProject: () => void;
  onCorrectConflict: (target: PlannerCorrectionTarget) => void;
}

type PlannerState =
  | { status: 'loading'; data: ResourcePlannerResult | null; error: null }
  | { status: 'error'; data: ResourcePlannerResult | null; error: string }
  | { status: 'ready'; data: ResourcePlannerResult; error: null };

const PLANNER_SCOPE_OPTIONS: Array<{ scope: PlannerScope; label: string; description: string; emptyCopy: string }> = [
  {
    scope: 'current-project',
    label: 'Текущий проект',
    description: 'Показывает shared-ресурсы и проектные ресурсы только выбранного проекта.',
    emptyCopy: 'В текущем проекте пока нет ресурсов с назначениями для planner view.',
  },
  {
    scope: 'all-projects',
    label: 'Все проекты',
    description: 'Показывает shared-ресурсы workspace и их интервалы по доступным проектам.',
    emptyCopy: 'Во всех доступных проектах пока нет shared-ресурсов с назначениями в planner view.',
  },
];

const RESOURCE_TYPE_OPTIONS: Array<{ type: ResourceType; label: string }> = [
  { type: 'human', label: 'Люди' },
  { type: 'equipment', label: 'Оборудование' },
  { type: 'material', label: 'Материалы' },
  { type: 'other', label: 'Другое' },
];

function getPlannerScopeCopy(scope: PlannerScope) {
  return PLANNER_SCOPE_OPTIONS.find((option) => option.scope === scope) ?? PLANNER_SCOPE_OPTIONS[1];
}

function normalizePlannerPayload(payload: unknown): ResourcePlannerResult | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Partial<ResourcePlannerResult>;
  if (
    typeof candidate.projectId !== 'string'
    || !(candidate.scope === 'current-project' || candidate.scope === 'all-projects')
    || typeof candidate.workspaceUserId !== 'string'
    || !Array.isArray(candidate.resources)
  ) {
    return null;
  }

  const resources: ResourcePlannerResult['resources'] = [];

  for (const resource of candidate.resources) {
    if (!resource || typeof resource !== 'object') {
      return null;
    }

    const resourceCandidate = resource as ResourcePlannerResult['resources'][number];
    if (
      typeof resourceCandidate.resourceId !== 'string'
      || typeof resourceCandidate.resourceName !== 'string'
      || typeof resourceCandidate.hasConflicts !== 'boolean'
      || typeof resourceCandidate.conflictCount !== 'number'
      || !Array.isArray(resourceCandidate.intervals)
    ) {
      return null;
    }

    const intervals: ResourcePlannerResult['resources'][number]['intervals'] = [];

    for (const interval of resourceCandidate.intervals) {
      if (!interval || typeof interval !== 'object') {
        return null;
      }

      const intervalCandidate = interval as ResourcePlannerResult['resources'][number]['intervals'][number];
      const requiredStringFields = [
        intervalCandidate.assignmentId,
        intervalCandidate.resourceId,
        intervalCandidate.resourceName,
        intervalCandidate.projectId,
        intervalCandidate.projectName,
        intervalCandidate.taskId,
        intervalCandidate.taskName,
        intervalCandidate.startDate,
        intervalCandidate.endDate,
        intervalCandidate.assignmentCreatedAt,
      ];

      if (
        requiredStringFields.some((value) => typeof value !== 'string')
        || typeof intervalCandidate.hasConflict !== 'boolean'
        || typeof intervalCandidate.conflictCount !== 'number'
        || !Array.isArray(intervalCandidate.conflictAssignmentIds)
        || intervalCandidate.conflictAssignmentIds.some((value) => typeof value !== 'string')
      ) {
        return null;
      }

      intervals.push({ ...intervalCandidate });
    }

    resources.push({
      resourceId: resourceCandidate.resourceId,
      resourceName: resourceCandidate.resourceName,
      hasConflicts: resourceCandidate.hasConflicts,
      conflictCount: resourceCandidate.conflictCount,
      intervals,
    });
  }

  return {
    projectId: candidate.projectId,
    scope: candidate.scope,
    workspaceUserId: candidate.workspaceUserId,
    resources,
  };
}

function normalizeProjectResource(payload: unknown): ProjectResource | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const resource = payload as Partial<ProjectResource>;
  if (
    typeof resource.id !== 'string'
    || typeof resource.userId !== 'string'
    || !(typeof resource.projectId === 'string' || resource.projectId === null)
    || !(resource.scope === 'shared' || resource.scope === 'project')
    || typeof resource.name !== 'string'
    || !(resource.type === 'human' || resource.type === 'equipment' || resource.type === 'material' || resource.type === 'other')
    || typeof resource.isActive !== 'boolean'
    || typeof resource.createdAt !== 'string'
    || typeof resource.updatedAt !== 'string'
    || !(typeof resource.deactivatedAt === 'string' || resource.deactivatedAt === null)
  ) {
    return null;
  }

  return resource as ProjectResource;
}

function normalizeResourceListPayload(payload: unknown): ProjectResource[] | null {
  if (!payload || typeof payload !== 'object' || !('resources' in payload)) {
    return null;
  }

  const resources = (payload as { resources?: unknown }).resources;
  if (!Array.isArray(resources)) {
    return null;
  }

  const normalized = resources.map((resource) => normalizeProjectResource(resource));
  return normalized.every((resource): resource is ProjectResource => Boolean(resource)) ? normalized : null;
}

export function ResourcePlannerWorkspace({ accessToken = null, projectId, onBackToProject, onCorrectConflict }: ResourcePlannerWorkspaceProps) {
  const [plannerScope, setPlannerScope] = useState<PlannerScope>('all-projects');
  const [state, setState] = useState<PlannerState>({ status: 'loading', data: null, error: null });
  const projects = useAuthStore((store) => store.projects);
  const resources = useProjectStore((store) => store.resources);
  const setResources = useProjectStore((store) => store.setResources);
  const [resourceNameDraft, setResourceNameDraft] = useState('');
  const [resourceTargetDraft, setResourceTargetDraft] = useState('shared');
  const [resourceTypeDraft, setResourceTypeDraft] = useState<ResourceType>('human');
  const [resourceListError, setResourceListError] = useState<string | null>(null);
  const [resourceCreateError, setResourceCreateError] = useState<string | null>(null);
  const [resourceListLoading, setResourceListLoading] = useState(false);
  const [creatingResource, setCreatingResource] = useState(false);
  const [filters, setFilters] = useState<ResourcePlannerFilters>({
    query: '',
    resourceTypes: [],
    conflictOnly: false,
    includeInactive: false,
  });
  const [selectedItem, setSelectedItem] = useState<ResourcePlannerTimelineItem | null>(null);

  const loadResourceCatalog = useCallback(async (catalogProjectId = projectId) => {
    if (!accessToken) {
      return;
    }

    setResourceListLoading(true);
    setResourceListError(null);

    try {
      const response = await fetch(`/api/resources?projectId=${encodeURIComponent(catalogProjectId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const errorMessage = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const normalized = normalizeResourceListPayload(body);
      if (!normalized) {
        throw new Error('Resource list payload was malformed.');
      }

      setResources(normalized);
    } catch (error) {
      setResourceListError(error instanceof Error ? error.message : 'Resource list failed to load.');
    } finally {
      setResourceListLoading(false);
    }
  }, [accessToken, projectId, setResources]);

  const loadPlanner = useCallback(async (scope: PlannerScope, options: { keepData?: boolean } = {}) => {
    if (!accessToken) {
      setState({ status: 'error', data: null, error: 'Planner requires an authenticated project session.' });
      return;
    }

    setState((current) => ({
      status: 'loading',
      data: options.keepData ? current.data : null,
      error: null,
    }));

    try {
      const response = await fetch(`/api/resources/planner?scope=${encodeURIComponent(scope)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const errorMessage = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const normalized = normalizePlannerPayload(body);
      if (!normalized || normalized.scope !== scope || normalized.projectId !== projectId) {
        throw new Error('Planner payload was malformed for the selected scope.');
      }

      setState({ status: 'ready', data: normalized, error: null });
    } catch (error) {
      setState((current) => ({
        status: 'error',
        data: options.keepData ? current.data : null,
        error: error instanceof Error ? error.message : 'Planner failed to load.',
      }));
    }
  }, [accessToken, projectId]);

  useEffect(() => {
    void loadPlanner(plannerScope);
  }, [loadPlanner, plannerScope]);

  useEffect(() => {
    void loadResourceCatalog();
  }, [loadResourceCatalog]);

  const handleCreateResource = useCallback(async () => {
    if (!accessToken || creatingResource) {
      return;
    }

    const name = resourceNameDraft.trim();
    if (!name) {
      setResourceCreateError('Введите название ресурса.');
      return;
    }

    setCreatingResource(true);
    setResourceCreateError(null);

    try {
      const response = await fetch('/api/resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(resourceTargetDraft === 'shared'
          ? { name, type: resourceTypeDraft, scope: 'shared' }
          : { name, type: resourceTypeDraft, scope: 'project', projectId: resourceTargetDraft }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const errorMessage = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const created = normalizeProjectResource(body);
      if (!created) {
        throw new Error('Resource payload was malformed.');
      }

      setResourceNameDraft('');
      await loadResourceCatalog(resourceTargetDraft === 'shared' ? projectId : resourceTargetDraft);
      await loadPlanner(plannerScope, { keepData: true });
    } catch (error) {
      setResourceCreateError(error instanceof Error ? error.message : 'Не удалось создать ресурс.');
    } finally {
      setCreatingResource(false);
    }
  }, [accessToken, creatingResource, loadPlanner, loadResourceCatalog, plannerScope, projectId, resourceNameDraft, resourceTargetDraft, resourceTypeDraft]);

  const selectedScopeCopy = getPlannerScopeCopy(plannerScope);
  const displayedPlannerData = state.data;
  const timelineResources = useMemo(
    () => displayedPlannerData ? mapResourcePlannerResultToTimelineResources(displayedPlannerData) : [],
    [displayedPlannerData],
  );
  const filteredTimelineResources = useMemo(
    () => filterResourceTimelineResources(
      timelineResources,
      resources,
      filters,
      selectedItem ? { preserveResourceIds: [selectedItem.resourceId] } : undefined,
    ),
    [filters, resources, selectedItem, timelineResources],
  );
  const selectedResource = useMemo(
    () => selectedItem ? resources.find((resource) => resource.id === selectedItem.resourceId) ?? null : null,
    [resources, selectedItem],
  );
  const resourceCount = filteredTimelineResources.length;
  const activeProjects = useMemo(() => projects.filter((project) => project.status === 'active'), [projects]);
  const catalogRowStats = useMemo(() => {
    const stats = new Map<string, ResourceCatalogRowStats>();

    for (const resource of timelineResources) {
      stats.set(resource.id, {
        assignmentCount: resource.items.length,
        conflictCount: resource.items.filter((item) => getPlannerItemMetadata(item)?.hasConflict).length,
      });
    }

    return stats;
  }, [timelineResources]);
  const intervalCount = useMemo(() => {
    return filteredTimelineResources.reduce((total, resource) => total + resource.items.length, 0);
  }, [filteredTimelineResources]);
  const conflictingResourceCount = useMemo(() => {
    return filteredTimelineResources.filter((resource) => resource.items.some((item) => getPlannerItemMetadata(item)?.hasConflict)).length;
  }, [filteredTimelineResources]);
  const conflictIntervalCount = useMemo(() => {
    return filteredTimelineResources.reduce(
      (total, resource) => total + resource.items.filter((item) => getPlannerItemMetadata(item)?.hasConflict).length,
      0,
    );
  }, [filteredTimelineResources]);
  const readonly = !accessToken;
  const disableResourceReassignment = false;
  const handleResourceItemMove = useCallback((_move: ResourceTimelineMove<ResourcePlannerTimelineItem>) => {
    // Move persistence is implemented in a later Phase 48 plan; resource mode remains controlled.
  }, []);
  const getTimelineItemClassName = useCallback((item: ResourcePlannerTimelineItem) => {
    const metadata = getPlannerItemMetadata(item);
    if (!metadata) {
      return 'resource-planner-item';
    }

    const selectedClassName = selectedItem?.id === item.id ? ' resource-planner-item--selected' : '';
    return metadata.hasConflict
      ? `resource-planner-item resource-planner-item--conflict${selectedClassName}`
      : `resource-planner-item resource-planner-item--normal${selectedClassName}`;
  }, [selectedItem]);
  const renderTimelineItem = useCallback((item: ResourcePlannerTimelineItem) => {
    const metadata = getPlannerItemMetadata(item);
    const conflictCount = metadata?.conflictCount ?? 0;
    const conflictCopy = metadata?.hasConflict ? 'есть конфликт' : 'без конфликтов';
    const openSelectedItem = () => {
      setSelectedItem(item);
    };

    return (
      <div
        aria-label={`${item.title}, ${metadata?.resourceName ?? item.resourceId}, ${String(item.startDate)} - ${String(item.endDate)}, ${conflictCopy}`}
        className="flex h-full min-w-0 cursor-pointer flex-col justify-center gap-1 px-2 py-1 text-left text-[11px] leading-tight focus:outline-none focus:ring-2 focus:ring-[#6158e0]"
        data-testid={`resource-planner-open-${item.id}`}
        role="button"
        tabIndex={0}
        onClick={openSelectedItem}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openSelectedItem();
          }
        }}
      >
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate font-semibold">{item.title}</span>
          {metadata?.hasConflict && (
            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">
              Конфликт{conflictCount > 1 ? ` ${conflictCount}` : ''}
            </span>
          )}
        </div>
        {item.subtitle && <div className="truncate opacity-80">{item.subtitle}</div>}
        <div className="flex min-w-0 items-center gap-1 tabular-nums opacity-80">
          <span className="truncate">{String(item.startDate)} → {String(item.endDate)}</span>
        </div>
        {metadata?.hasConflict && (
          <div className="flex min-w-0 items-center gap-2">
            {metadata.conflictAssignmentIds.length > 0 && (
              <span className="truncate opacity-80">{metadata.conflictAssignmentIds.join(', ')}</span>
            )}
            <button
              type="button"
              className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 font-semibold text-amber-900 shadow-sm"
              data-testid={`resource-planner-correct-${metadata.assignmentId}`}
              onClick={(event) => {
                event.stopPropagation();
                onCorrectConflict({
                  projectId: metadata.projectId,
                  taskId: metadata.taskId,
                  assignmentId: metadata.assignmentId,
                  resourceId: metadata.resourceId,
                });
              }}
            >
              Исправить конфликт
            </button>
          </div>
        )}
      </div>
    );
  }, [onCorrectConflict]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f5f7]">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-slate-900" data-testid="planner-title">Ресурсы</h1>
            <p className="text-sm text-slate-600" data-testid="planner-subtitle">
              {plannerScope === 'current-project' ? 'Текущий проект' : 'Все проекты workspace'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md bg-[#6158e0] px-3 text-sm font-medium text-white transition-colors hover:bg-[#5148c8]"
              onClick={() => document.getElementById('resource-create-name')?.focus()}
            >
              Создать ресурс
            </button>
            <button
              type="button"
              onClick={() => { void loadPlanner(plannerScope, { keepData: true }); void loadResourceCatalog(); }}
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Обновить
            </button>
            <button
              type="button"
              onClick={onBackToProject}
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              data-testid="planner-back-button"
            >
              Вернуться в проект
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="min-w-0 flex-1 overflow-auto p-4">
        <ResourceCatalogPanel
          resources={resources}
          activeProjects={activeProjects}
          readonly={readonly}
          loading={resourceListLoading}
          creating={creatingResource}
          error={resourceListError}
          createError={resourceCreateError}
          nameDraft={resourceNameDraft}
          targetDraft={resourceTargetDraft}
          typeDraft={resourceTypeDraft}
          rowStats={catalogRowStats}
          onNameDraftChange={(value) => {
            setResourceNameDraft(value);
            setResourceCreateError(null);
          }}
          onTargetDraftChange={(value) => {
            setResourceTargetDraft(value);
            setResourceCreateError(null);
          }}
          onTypeDraftChange={(value) => {
            setResourceTypeDraft(value);
            setResourceCreateError(null);
          }}
          onCreate={handleCreateResource}
        />

        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4" data-testid="planner-scope-controls">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-900">Область planner</legend>
            <p className="text-xs text-slate-500" id="planner-scope-help">
              Переключение всегда отправляет явный scope в planner API и не меняет каталог ресурсов.
            </p>
            <div className="grid gap-2 md:grid-cols-2" role="radiogroup" aria-describedby="planner-scope-help">
              {PLANNER_SCOPE_OPTIONS.map((option) => (
                <label
                  key={option.scope}
                  className={option.scope === plannerScope
                    ? 'flex cursor-pointer flex-col gap-1 rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-white'
                    : 'flex cursor-pointer flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50'}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="radio"
                      name="planner-scope"
                      value={option.scope}
                      checked={plannerScope === option.scope}
                      onChange={() => setPlannerScope(option.scope)}
                      className="accent-slate-900"
                      data-testid={`planner-scope-${option.scope}`}
                    />
                    {option.label}
                  </span>
                  <span className={option.scope === plannerScope ? 'text-xs text-slate-200' : 'text-xs text-slate-500'}>{option.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4" data-testid="planner-filter-controls">
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_auto_auto]">
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              Поиск
              <input
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6158e0]"
                data-testid="planner-filter-query"
                placeholder="Ресурс, задача или проект"
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              />
            </label>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="mb-1 text-sm text-slate-700">Тип ресурса</legend>
              {RESOURCE_TYPE_OPTIONS.map((option) => (
                <label key={option.type} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={filters.resourceTypes.includes(option.type)}
                    onChange={(event) => setFilters((current) => ({
                      ...current,
                      resourceTypes: event.target.checked
                        ? [...current.resourceTypes, option.type]
                        : current.resourceTypes.filter((type) => type !== option.type),
                    }))}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col justify-end gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.conflictOnly}
                  onChange={(event) => setFilters((current) => ({ ...current, conflictOnly: event.target.checked }))}
                />
                Только конфликты
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.includeInactive}
                  onChange={(event) => setFilters((current) => ({ ...current, includeInactive: event.target.checked }))}
                />
                Показывать неактивные
              </label>
            </div>
          </div>
        </section>

        {state.status === 'loading' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600" data-testid="planner-loading-state">
            Загружаем ресурсный календарь… {selectedScopeCopy.label}
          </div>
        )}

        {state.status === 'error' && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700" data-testid="planner-error-state" role="alert">
            <div>Не удалось загрузить ресурсный календарь. Проверьте соединение и повторите загрузку. {state.error}</div>
            <button
              type="button"
              className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-red-300 bg-white px-3 text-sm font-medium text-red-800 transition-colors hover:bg-red-50"
              data-testid="planner-retry-button"
              onClick={() => { void loadPlanner(plannerScope, { keepData: true }); }}
            >
              Повторить загрузку
            </button>
          </div>
        )}

        {state.status === 'ready' && displayedPlannerData && filteredTimelineResources.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600" data-testid="planner-empty-state">
            <div className="font-semibold text-slate-900">Нет ресурсов для отображения</div>
            <div className="mt-1">Создайте ресурс или измените фильтры, чтобы увидеть назначения на календаре.</div>
          </div>
        )}

        {state.status === 'ready' && displayedPlannerData && filteredTimelineResources.length > 0 && (
          <div className="space-y-4" data-testid="planner-data-state">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Ресурсов</div>
                <div className="mt-1 text-lg font-semibold text-slate-900" data-testid="planner-resource-count">{resourceCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Интервалов</div>
                <div className="mt-1 text-lg font-semibold text-slate-900" data-testid="planner-interval-count">{intervalCount}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <div className="text-xs uppercase tracking-[0.08em] text-amber-600">Ресурсов с конфликтами</div>
                <div className="mt-1 text-lg font-semibold" data-testid="planner-conflict-resource-count">{conflictingResourceCount}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <div className="text-xs uppercase tracking-[0.08em] text-amber-600">Конфликтных интервалов</div>
                <div className="mt-1 text-lg font-semibold" data-testid="planner-conflict-interval-count">{conflictIntervalCount}</div>
              </div>
            </div>

            <section
              aria-label="Ресурсный календарь"
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              data-testid="resource-planner-gantt-section"
            >
              <GanttChart
                mode="resource-planner"
                resources={filteredTimelineResources}
                dayWidth={36}
                laneHeight={40}
                rowHeaderWidth={220}
                headerHeight={40}
                readonly={readonly}
                disableResourceReassignment={disableResourceReassignment}
                renderItem={renderTimelineItem}
                getItemClassName={getTimelineItemClassName}
                onResourceItemMove={handleResourceItemMove}
              />
            </section>
          </div>
        )}
      </div>
      {selectedItem && (
        <ResourceAssignmentDetailsPanel
          item={selectedItem}
          resource={selectedResource}
          resources={resources}
          readonly={readonly}
          onClose={() => setSelectedItem(null)}
          onCorrectConflict={onCorrectConflict}
        />
      )}
      </div>
    </div>
  );
}

