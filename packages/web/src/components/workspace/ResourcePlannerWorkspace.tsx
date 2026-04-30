import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Funnel, LoaderCircle, Plus, RefreshCw, Search, SlidersHorizontal, Users } from 'lucide-react';
import { GanttChart } from 'gantt-lib';
import type { ResourceTimelineMove, ResourceTimelineResourceMenuCommand } from 'gantt-lib';

import type { PlannerScope, ProjectLoadResponse, ProjectResource, ResourcePlannerInterval, ResourcePlannerResult, ResourceScope, ResourceType, TaskAssignmentRecord } from '../../lib/apiTypes.ts';
import { replayProjectCommand } from '../../lib/projectCommandReplay.ts';
import { buildCustomDays } from '../../lib/projectScheduleOptions.ts';
import type { CalendarDay, FrontendProjectCommand } from '../../types.ts';
import { useCommandCommit } from '../../hooks/useCommandCommit.ts';
import { createHistoryGroup } from '../../hooks/useProjectCommands.ts';
import { normalizeDateOnly } from '../../lib/scheduleMutationUtils.ts';
import { cn } from '../../lib/utils.ts';
import { deriveOptimisticSnapshot, deriveVisibleSnapshot, useProjectStore } from '../../stores/useProjectStore.ts';
import { useProjectUIStore } from '../../stores/useProjectUIStore.ts';
import { useUIStore, type PlannerCorrectionTarget, type ViewMode } from '../../stores/useUIStore.ts';
import { Button } from '../ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.tsx';
import {
  buildCurrentProjectResourceTimeline,
  getPlannerItemMetadata,
  mapTimelineResourceScopeToApiScope,
  mapTimelineResourceStatusToActive,
  mapTimelineResourceTypeToApiType,
  mapResourcePlannerResultToTimelineResources,
} from './resourcePlannerAdapter.ts';
import type { ResourcePlannerTimelineItem, ResourcePlannerTimelineResource } from './resourcePlannerAdapter.ts';
import { ResourceAssignmentDetailsPanel, type AssignmentResourceView } from './ResourceAssignmentDetailsPanel.tsx';
import { filterResourceTimelineResources, type ResourcePlannerFilters } from './resourcePlannerFilters.ts';
import { buildReplacementResourceIds, classifyResourcePlannerMove, type ResourcePlannerMoveClassification } from './resourcePlannerMoves.ts';
import { CreateResourceModal } from './CreateResourceModal.tsx';

interface ResourcePlannerWorkspaceProps {
  accessToken?: string | null;
  projectId: string;
  ganttDayMode?: 'business' | 'calendar';
  calendarDays?: CalendarDay[];
  onBackToProject: () => void;
  onCorrectConflict: (target: PlannerCorrectionTarget) => void;
  onOpenTask?: (target: PlannerCorrectionTarget) => void;
}

type PlannerState =
  | { status: 'loading'; data: ResourcePlannerResult | null; error: null }
  | { status: 'error'; data: ResourcePlannerResult | null; error: string }
  | { status: 'ready'; data: ResourcePlannerResult; error: null };

type OptimisticPlannerMove = ResourcePlannerMoveClassification & {
  kind: 'date-only' | 'resource-only' | 'combined';
};

class AssignmentRequestError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'AssignmentRequestError';
  }
}

const RESOURCE_TYPE_OPTIONS: Array<{ type: ResourceType; label: string }> = [
  { type: 'human', label: 'Люди' },
  { type: 'equipment', label: 'Оборудование' },
  { type: 'material', label: 'Материалы' },
  { type: 'other', label: 'Другое' },
];

const VIEW_MODE_OPTIONS: Array<{ mode: ViewMode; label: string }> = [
  { mode: 'day', label: 'День' },
  { mode: 'week', label: 'Неделя' },
  { mode: 'month', label: 'Месяц' },
];

const AUTO_REFRESH_MIN_INTERVAL_MS = 60_000;
const AUTO_REFRESH_MIN_HIDDEN_MS = 15_000;

function getPlannerDayWidth(viewMode: ViewMode): number {
  return viewMode === 'week' ? 8 : viewMode === 'month' ? 2 : 24;
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
    projectGroupId: typeof candidate.projectGroupId === 'string' ? candidate.projectGroupId : '',
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

  return {
    ...resource,
    projectGroupId: typeof resource.projectGroupId === 'string' ? resource.projectGroupId : null,
  } as ProjectResource;
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

function normalizeResourceMutationPayload(payload: unknown): ProjectResource | null {
  return normalizeProjectResource(payload)
    ?? (payload && typeof payload === 'object' && 'resource' in payload
      ? normalizeProjectResource((payload as { resource?: unknown }).resource)
      : null);
}

function normalizeAssignmentMutationPayload(payload: unknown): TaskAssignmentRecord[] | null {
  if (!payload || typeof payload !== 'object' || !('assignments' in payload)) {
    return null;
  }

  const assignments = (payload as { assignments?: unknown }).assignments;
  if (!Array.isArray(assignments)) {
    return null;
  }

  const normalized: TaskAssignmentRecord[] = [];
  for (const assignment of assignments) {
    if (!assignment || typeof assignment !== 'object') {
      return null;
    }
    const candidate = assignment as Partial<TaskAssignmentRecord>;
    if (
      typeof candidate.id !== 'string'
      || typeof candidate.projectId !== 'string'
      || typeof candidate.taskId !== 'string'
      || typeof candidate.resourceId !== 'string'
      || typeof candidate.createdAt !== 'string'
    ) {
      return null;
    }
    normalized.push(candidate as TaskAssignmentRecord);
  }

  return normalized;
}

function getAssignmentErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('issue' in payload)) {
    return null;
  }

  const issue = (payload as { issue?: unknown }).issue;
  if (!issue || typeof issue !== 'object' || !('code' in issue)) {
    return null;
  }

  const code = (issue as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function countPlannerAssignments(data: ResourcePlannerResult | null): number {
  return data?.resources.reduce((total, resource) => total + resource.intervals.length, 0) ?? 0;
}

function isOptimisticPlannerMove(classification: ResourcePlannerMoveClassification): classification is OptimisticPlannerMove {
  return classification.kind === 'date-only'
    || classification.kind === 'resource-only'
    || classification.kind === 'combined';
}

function patchPlannerResource(
  data: ResourcePlannerResult,
  resourceId: string,
  updater: (resource: ResourcePlannerResult['resources'][number]) => ResourcePlannerResult['resources'][number],
): ResourcePlannerResult {
  return {
    ...data,
    resources: data.resources.map((resource) => (resource.resourceId === resourceId ? updater(resource) : resource)),
  };
}

function removePlannerResource(
  data: ResourcePlannerResult,
  resourceId: string,
): ResourcePlannerResult {
  return {
    ...data,
    resources: data.resources.filter((resource) => resource.resourceId !== resourceId),
  };
}

export function ResourcePlannerWorkspace({
  accessToken = null,
  projectId,
  ganttDayMode = 'calendar',
  calendarDays = [],
  onOpenTask,
}: ResourcePlannerWorkspaceProps) {
  const plannerScope: PlannerScope = 'current-project';
  const cachedPlannerData = useProjectStore((store) => store.resourcePlannerCache[`${projectId}:${plannerScope}`] ?? null);
  const setResourcePlannerCache = useProjectStore((store) => store.setResourcePlannerCache);
  const globalViewMode = useUIStore((store) => store.viewMode);
  const setGlobalViewMode = useUIStore((store) => store.setViewMode);
  const projectStates = useProjectUIStore((store) => store.projectStates);
  const getProjectState = useProjectUIStore((store) => store.getProjectState);
  const setProjectState = useProjectUIStore((store) => store.setProjectState);
  const [state, setState] = useState<PlannerState>(() => (
    cachedPlannerData
      ? { status: 'ready', data: cachedPlannerData, error: null }
      : { status: 'loading', data: null, error: null }
  ));
  const resources = useProjectStore((store) => store.resources);
  const assignments = useProjectStore((store) => store.assignments);
  const pendingCommands = useProjectStore((store) => store.pending);
  const confirmedSnapshot = useProjectStore((store) => store.confirmed.snapshot);
  const dragPreview = useProjectStore((store) => store.dragPreview);
  const scheduleOptions = useProjectStore((store) => store.scheduleOptions);
  const savingState = useUIStore((store) => store.savingState);
  const setResources = useProjectStore((store) => store.setResources);
  const setAssignments = useProjectStore((store) => store.setAssignments);
  const upsertResource = useProjectStore((store) => store.upsertResource);
  const removeResource = useProjectStore((store) => store.removeResource);
  const replaceAssignmentsForTask = useProjectStore((store) => store.replaceAssignmentsForTask);
  const removeAssignmentsByResource = useProjectStore((store) => store.removeAssignmentsByResource);
  const setConfirmed = useProjectStore((store) => store.setConfirmed);
  const setDragPreview = useProjectStore((store) => store.setDragPreview);
  const clearResourcePlannerCache = useProjectStore((store) => store.clearResourcePlannerCache);
  const mutateResourcePlannerCache = useProjectStore((store) => store.mutateResourcePlannerCache);
  const { commitCommand } = useCommandCommit(accessToken);
  const [resourceListError, setResourceListError] = useState<string | null>(null);
  const [resourceMutationError, setResourceMutationError] = useState<string | null>(null);
  const [resourceListLoading, setResourceListLoading] = useState(false);
  const [pendingCatalogResourceId, setPendingCatalogResourceId] = useState<string | null>(null);
  const [pendingMoveCounts, setPendingMoveCounts] = useState<Record<string, number>>({});
  const [plannerSaveError, setPlannerSaveError] = useState<string | null>(null);
  const [showDelayedSyncStatus, setShowDelayedSyncStatus] = useState(false);
  const [showDelayedSavingStatus, setShowDelayedSavingStatus] = useState(false);
  const [filters, setFilters] = useState<ResourcePlannerFilters>({
    query: '',
    resourceTypes: [],
    conflictOnly: false,
    includeInactive: true,
  });
  const [selectedItem, setSelectedItem] = useState<ResourcePlannerTimelineItem | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const lastHiddenAtRef = useRef<number | null>(null);
  const lastAutoRefreshAtRef = useRef(0);
  const plannerSectionRef = useRef<HTMLElement | null>(null);
  const selectionHydratedRef = useRef(false);

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

      setResourcePlannerCache(projectId, scope, normalized);
      setState({ status: 'ready', data: normalized, error: null });
    } catch (error) {
      setState((current) => ({
        status: 'error',
        data: options.keepData ? current.data : null,
        error: error instanceof Error ? error.message : 'Planner failed to load.',
      }));
    }
  }, [accessToken, projectId, setResourcePlannerCache]);

  const reloadProjectSnapshot = useCallback(async (): Promise<ProjectLoadResponse | null> => {
    if (!accessToken) {
      return null;
    }

    const response = await fetch('/api/project', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error('project_reload_failed');
    }
    const project = body as ProjectLoadResponse;
    if (
      typeof project.version !== 'number'
      || !project.snapshot
      || !Array.isArray(project.snapshot.tasks)
      || !Array.isArray(project.snapshot.dependencies)
      || !Array.isArray(project.snapshot.resources)
      || !Array.isArray(project.snapshot.assignments)
    ) {
      throw new Error('malformed_project_snapshot');
    }

    setConfirmed(project.version, project.snapshot);
    setResources(project.snapshot.resources);
    setAssignments(project.snapshot.assignments);
    return project;
  }, [accessToken, setAssignments, setConfirmed, setResources]);

  const syncPlannerCacheState = useCallback((mutate: (data: ResourcePlannerResult) => ResourcePlannerResult) => {
    setState((current) => {
      if (current.status !== 'ready' || !current.data) {
        return current;
      }

      const nextData = mutate(current.data);
      mutateResourcePlannerCache(projectId, plannerScope, () => nextData);
      return { status: 'ready', data: nextData, error: null };
    });
  }, [mutateResourcePlannerCache, plannerScope, projectId]);

  useEffect(() => {
    if (cachedPlannerData?.projectId === projectId && cachedPlannerData.scope === plannerScope) {
      setState({ status: 'ready', data: cachedPlannerData, error: null });
      return;
    }

    void loadPlanner(plannerScope);
  }, [cachedPlannerData, loadPlanner, plannerScope, projectId]);

  useEffect(() => {
    if (resources.length === 0) {
      void loadResourceCatalog();
    }
  }, [loadResourceCatalog, resources.length]);

  useEffect(() => {
    const projectState = getProjectState(projectId);
    if (projectState?.viewMode) {
      setGlobalViewMode(projectState.viewMode);
    }
  }, [getProjectState, projectId, setGlobalViewMode]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let refreshInFlight = false;
    const refreshFromServer = async () => {
      if (refreshInFlight) {
        return;
      }
      refreshInFlight = true;
      try {
        await reloadProjectSnapshot();
        await loadPlanner(plannerScope, { keepData: true });
      } finally {
        refreshInFlight = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAtRef.current = Date.now();
        return;
      }

      const now = Date.now();
      const hiddenAt = lastHiddenAtRef.current;
      lastHiddenAtRef.current = null;

      if (hiddenAt !== null && now - hiddenAt < AUTO_REFRESH_MIN_HIDDEN_MS) {
        return;
      }

      if (now - lastAutoRefreshAtRef.current < AUTO_REFRESH_MIN_INTERVAL_MS) {
        return;
      }

      lastAutoRefreshAtRef.current = now;
      void refreshFromServer();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [accessToken, loadPlanner, plannerScope, reloadProjectSnapshot]);

  const handleAddResource = useCallback(async (resource: ResourcePlannerTimelineResource) => {
    if (!accessToken || pendingCatalogResourceId) {
      return;
    }

    const name = resource.name.trim();
    if (!name) {
      setResourceMutationError('Введите название ресурса.');
      return;
    }

    setPendingCatalogResourceId(resource.id);
    setResourceMutationError(null);

    try {
      const response = await fetch('/api/resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name,
          type: mapTimelineResourceTypeToApiType(resource.type),
          scope: mapTimelineResourceScopeToApiScope(resource.scope),
          projectId,
        }),
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

      upsertResource(created);
      clearResourcePlannerCache();
    } catch (error) {
      setResourceMutationError(error instanceof Error ? error.message : 'Не удалось создать ресурс.');
    } finally {
      setPendingCatalogResourceId(null);
    }
  }, [accessToken, clearResourcePlannerCache, pendingCatalogResourceId, projectId, upsertResource]);

  const patchCatalogResource = useCallback(async (resource: ProjectResource, payload: { name?: string; type?: ResourceType; scope?: 'shared' | 'project'; isActive?: boolean }) => {
    if (!accessToken || pendingCatalogResourceId) {
      return;
    }

    setPendingCatalogResourceId(resource.id);
    setResourceMutationError(null);

    try {
      const response = await fetch(`/api/resources/${encodeURIComponent(resource.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const errorMessage = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const updated = normalizeResourceMutationPayload(body);
      if (!updated) {
        throw new Error('Resource payload was malformed.');
      }

      upsertResource(updated);
      syncPlannerCacheState((data) => patchPlannerResource(data, updated.id, (plannerResource) => ({
        ...plannerResource,
        resourceName: updated.name,
      })));
    } catch (error) {
      setResourceMutationError(error instanceof Error ? error.message : 'Не удалось сохранить изменение. Данные возвращены к последнему состоянию сервера.');
    } finally {
      setPendingCatalogResourceId(null);
    }
  }, [accessToken, pendingCatalogResourceId, syncPlannerCacheState, upsertResource]);

  const handleSetResourceActive = useCallback(async (resource: ProjectResource, isActive: boolean) => {
    if (isActive === resource.isActive) {
      return;
    }

    await patchCatalogResource(resource, { isActive });
  }, [patchCatalogResource]);

  const handleDeleteResource = useCallback(async (resource: ProjectResource) => {
    if (!accessToken || pendingCatalogResourceId) {
      return;
    }

    setPendingCatalogResourceId(resource.id);
    setResourceMutationError(null);

    try {
      const response = await fetch(`/api/resources/${encodeURIComponent(resource.id)}`, {
        method: 'DELETE',
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

      removeResource(resource.id);
      removeAssignmentsByResource(resource.id);
      syncPlannerCacheState((data) => removePlannerResource(data, resource.id));
      if (selectedItem?.resourceId === resource.id) {
        setSelectedItem(null);
      }
    } catch (error) {
      setResourceMutationError(error instanceof Error ? error.message : 'Не удалось удалить ресурс.');
    } finally {
      setPendingCatalogResourceId(null);
    }
  }, [accessToken, pendingCatalogResourceId, removeAssignmentsByResource, removeResource, selectedItem, syncPlannerCacheState]);

  const handleCreateResource = useCallback(async (input: { name: string; type: ResourceType; scope: ResourceScope }) => {
    if (!accessToken || pendingCatalogResourceId) {
      return;
    }

    const name = input.name.trim();
    if (!name) {
      setResourceMutationError('Введите название ресурса.');
      return;
    }

    setPendingCatalogResourceId('new');
    setResourceMutationError(null);
    try {
      const response = await fetch('/api/resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name,
          type: input.type,
          scope: input.scope,
          projectId,
        }),
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

      upsertResource(created);
      clearResourcePlannerCache();
      setCreateModalOpen(false);
    } catch (error) {
      setResourceMutationError(error instanceof Error ? error.message : 'Не удалось создать ресурс.');
    } finally {
      setPendingCatalogResourceId(null);
    }
  }, [accessToken, clearResourcePlannerCache, pendingCatalogResourceId, projectId, upsertResource]);

  const handleResourceChange = useCallback(async (nextResource: ResourcePlannerTimelineResource) => {
    const resource = resources.find((candidate) => candidate.id === nextResource.id);
    if (!resource) {
      setResourceMutationError('Ресурс не найден в текущем пуле.');
      return;
    }

    const name = nextResource.name.trim();
    if (!name) {
      setResourceMutationError('Введите название ресурса.');
      return;
    }

    const nextType = mapTimelineResourceTypeToApiType(nextResource.type);
    const nextScope = mapTimelineResourceScopeToApiScope(nextResource.scope);
    const nextIsActive = mapTimelineResourceStatusToActive(nextResource.status);
    const payload: { name?: string; type?: ResourceType; scope?: 'shared' | 'project'; isActive?: boolean } = {};

    if (name !== resource.name) {
      payload.name = name;
    }
    if (nextType !== resource.type) {
      payload.type = nextType;
    }
    if (nextScope !== resource.scope) {
      payload.scope = nextScope;
    }
    if (nextIsActive !== resource.isActive) {
      payload.isActive = nextIsActive;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    await patchCatalogResource(resource, payload);
  }, [patchCatalogResource, resources]);

  const isActiveAssignableResource = useCallback((resourceId: string) => {
    const catalogResource = resources.find((resource) => resource.id === resourceId);
    if (catalogResource) {
      return catalogResource.isActive;
    }

    return state.data?.resources.some((resource) => resource.resourceId === resourceId) ?? false;
  }, [resources, state.data]);

  const getTaskResourceIds = useCallback(async (taskId: string): Promise<string[]> => {
    let currentAssignments = useProjectStore.getState().assignments;
    let taskResourceIds = currentAssignments
      .filter((assignment) => assignment.taskId === taskId)
      .map((assignment) => assignment.resourceId);

    if (taskResourceIds.length === 0) {
      const project = await reloadProjectSnapshot();
      currentAssignments = project?.snapshot.assignments ?? useProjectStore.getState().assignments;
      taskResourceIds = currentAssignments
        .filter((assignment) => assignment.taskId === taskId)
        .map((assignment) => assignment.resourceId);
    }

    return taskResourceIds;
  }, [reloadProjectSnapshot]);

  const persistResourceReplacement = useCallback(async (
    taskId: string,
    fromResourceId: string,
    toResourceId: string,
  ): Promise<TaskAssignmentRecord[] | null> => {
    if (!accessToken) {
      throw new Error('not_authenticated');
    }

    const currentResourceIds = await getTaskResourceIds(taskId);
    if (currentResourceIds.length === 0) {
      throw new Error('missing_assignment_metadata');
    }

    const resourceIds = buildReplacementResourceIds(currentResourceIds, fromResourceId, toResourceId);
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ resourceIds }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AssignmentRequestError('assignment_replacement_failed', getAssignmentErrorCode(body));
    }

    const nextAssignments = normalizeAssignmentMutationPayload(body);
    if (!nextAssignments) {
      await reloadProjectSnapshot();
      return null;
    }

    replaceAssignmentsForTask(taskId, nextAssignments);
    return nextAssignments;
  }, [accessToken, getTaskResourceIds, reloadProjectSnapshot, replaceAssignmentsForTask]);

  const buildOptimisticReplacementAssignments = useCallback((
    taskId: string,
    fromResourceId: string,
    toResourceId: string,
  ): TaskAssignmentRecord[] => {
    const currentTaskAssignments = assignments.filter((assignment) => assignment.taskId === taskId);
    const nextResourceIds = buildReplacementResourceIds(
      currentTaskAssignments.map((assignment) => assignment.resourceId),
      fromResourceId,
      toResourceId,
    );

    return nextResourceIds.map((resourceId) => {
      const currentAssignment = currentTaskAssignments.find((assignment) => assignment.resourceId === resourceId);
      if (currentAssignment) {
        return currentAssignment;
      }

      const movedAssignment = currentTaskAssignments.find((assignment) => assignment.resourceId === fromResourceId);
      return {
        id: movedAssignment?.id ?? `optimistic:${taskId}:${resourceId}`,
        projectId: movedAssignment?.projectId ?? projectId,
        taskId,
        resourceId,
        createdAt: movedAssignment?.createdAt ?? new Date().toISOString(),
      };
    });
  }, [assignments, projectId]);

  const applyPlannerMoveSelectionPreview = useCallback((classification: OptimisticPlannerMove) => {
    setSelectedItem((current) => {
      if (!current || current.id !== classification.assignmentId) {
        return current;
      }

      const targetResourceName = state.data?.resources.find((resource) => resource.resourceId === classification.toResourceId)?.resourceName
        ?? current.metadata.resourceName;
      return {
        ...current,
        resourceId: classification.toResourceId,
        startDate: classification.startDate,
        endDate: classification.endDate,
        metadata: {
          ...current.metadata,
          resourceId: classification.toResourceId,
          resourceName: targetResourceName,
        },
      };
    });
  }, [state.data]);

  const applyOptimisticAssignmentPreview = useCallback((classification: OptimisticPlannerMove) => {
    if (classification.kind === 'date-only') {
      return;
    }

    replaceAssignmentsForTask(
      classification.taskId,
      buildOptimisticReplacementAssignments(
        classification.taskId,
        classification.fromResourceId,
        classification.toResourceId,
      ),
    );
  }, [buildOptimisticReplacementAssignments, replaceAssignmentsForTask]);

  const setPlannerSchedulePreview = useCallback((commands: FrontendProjectCommand[]) => {
    if (!accessToken || commands.length === 0) {
      return () => {};
    }

    const previewId = crypto.randomUUID();
    const projectState = useProjectStore.getState();
    const baseSnapshot = deriveOptimisticSnapshot(
      projectState.confirmed.snapshot,
      projectState.pending,
      scheduleOptions,
    );
    const previewSnapshot = commands.reduce(
      (snapshot, command, index) => replayProjectCommand(snapshot, command, scheduleOptions, `planner-preview:${index}`),
      baseSnapshot,
    );

    setDragPreview({ id: previewId, commands, snapshot: previewSnapshot });
    return () => {
      const currentPreview = useProjectStore.getState().dragPreview;
      if (currentPreview?.id === previewId) {
        useProjectStore.getState().setDragPreview(undefined);
      }
    };
  }, [accessToken, scheduleOptions, setDragPreview]);

  const incrementPendingMove = useCallback((itemId: string) => {
    setPendingMoveCounts((current) => ({
      ...current,
      [itemId]: (current[itemId] ?? 0) + 1,
    }));
  }, []);

  const decrementPendingMove = useCallback((itemId: string) => {
    setPendingMoveCounts((current) => {
      const nextCount = (current[itemId] ?? 0) - 1;
      if (nextCount > 0) {
        return {
          ...current,
          [itemId]: nextCount,
        };
      }

      const { [itemId]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const commitPlannerScheduleMove = useCallback(async (classification: OptimisticPlannerMove): Promise<boolean> => {
    if (classification.commands.length === 0) {
      return false;
    }

    const historySeed = {
      groupId: crypto.randomUUID(),
      requestContextId: crypto.randomUUID(),
    };

    const clearPreview = setPlannerSchedulePreview(classification.commands);
    try {
      for (const [index, command] of classification.commands.entries()) {
        const result = await commitCommand(
          command,
          createHistoryGroup('Перенос назначения', index === classification.commands.length - 1, historySeed),
        );
        if (!result.accepted) {
          throw new Error('date_command_rejected');
        }
      }
    } finally {
      clearPreview();
    }

    return true;
  }, [commitCommand, setPlannerSchedulePreview]);

  const reconcilePlannerAssignmentPreview = useCallback(async (
    classification: OptimisticPlannerMove,
  ): Promise<boolean> => {
    const replacementAssignments = await persistResourceReplacement(
      classification.taskId,
      classification.fromResourceId,
      classification.toResourceId,
    );
    const replacementAssignment = replacementAssignments?.find((assignment) => (
      assignment.taskId === classification.taskId && assignment.resourceId === classification.toResourceId
    ));

    if (!replacementAssignments) {
      await loadPlanner(plannerScope, { keepData: true });
      return false;
    }

    if (!replacementAssignment) {
      return false;
    }

    setSelectedItem((current) => (
      current?.id === classification.assignmentId
        ? {
          ...current,
          id: replacementAssignment.id,
          metadata: {
            ...current.metadata,
            assignmentId: replacementAssignment.id,
            assignmentCreatedAt: replacementAssignment.createdAt,
          },
        }
        : current
    ));
    void loadPlanner(plannerScope, { keepData: true });

    return true;
  }, [loadPlanner, persistResourceReplacement, plannerScope]);

  const persistPlannerMove = useCallback(async (move: ResourceTimelineMove<ResourcePlannerTimelineItem>) => {
    if (!accessToken || move.item.locked) {
      return;
    }

    const classification = classifyResourcePlannerMove(move);
    if (!isOptimisticPlannerMove(classification)) {
      return;
    }
    if (
      (classification.kind === 'resource-only' || classification.kind === 'combined')
      && !isActiveAssignableResource(classification.toResourceId)
    ) {
      return;
    }

    const previousTaskAssignments = assignments.filter((assignment) => assignment.taskId === classification.taskId);
    const previousSelectedItem = selectedItem?.id === classification.assignmentId ? selectedItem : null;

    incrementPendingMove(classification.itemId);
    setPlannerSaveError(null);
    applyOptimisticAssignmentPreview(classification);
    applyPlannerMoveSelectionPreview(classification);

    let datePersisted = false;
    try {
      datePersisted = await commitPlannerScheduleMove(classification);

      if (classification.kind === 'resource-only' || classification.kind === 'combined') {
        try {
          await reconcilePlannerAssignmentPreview(classification);
        } catch (error) {
          if (classification.kind === 'combined' && datePersisted) {
            replaceAssignmentsForTask(classification.taskId, previousTaskAssignments);
            if (previousSelectedItem) {
              setSelectedItem({
                ...previousSelectedItem,
                startDate: classification.startDate,
                endDate: classification.endDate,
              });
            }
            setPlannerSaveError('Даты назначения сохранены, но ресурс не изменён. Календарь обновлён по данным сервера.');
            await loadPlanner(plannerScope, { keepData: true });
            return;
          }
          throw error;
        }
      }
    } catch (error) {
      if (classification.kind === 'resource-only' || classification.kind === 'combined') {
        replaceAssignmentsForTask(classification.taskId, previousTaskAssignments);
      }
      if (previousSelectedItem) {
        setSelectedItem(previousSelectedItem);
      }
      if (error instanceof AssignmentRequestError && error.code === 'resource_inactive') {
        await loadPlanner(plannerScope, { keepData: true });
        return;
      }
      setPlannerSaveError('Не удалось сохранить изменение. Данные возвращены к последнему состоянию сервера.');
      await loadPlanner(plannerScope, { keepData: true });
    } finally {
      decrementPendingMove(classification.itemId);
    }
  }, [accessToken, applyOptimisticAssignmentPreview, applyPlannerMoveSelectionPreview, assignments, commitPlannerScheduleMove, decrementPendingMove, incrementPendingMove, isActiveAssignableResource, loadPlanner, plannerScope, reconcilePlannerAssignmentPreview, replaceAssignmentsForTask, selectedItem]);

  const handleDetailsResourceChange = useCallback((input: { assignmentId: string; resourceId: string }) => {
    if (!selectedItem || input.assignmentId !== selectedItem.id) {
      return;
    }

    void persistPlannerMove({
      item: selectedItem,
      itemId: selectedItem.id,
      fromResourceId: selectedItem.resourceId,
      toResourceId: input.resourceId,
      startDate: new Date(`${String(selectedItem.startDate).split('T')[0]}T00:00:00.000Z`),
      endDate: new Date(`${String(selectedItem.endDate).split('T')[0]}T00:00:00.000Z`),
    });
  }, [persistPlannerMove, selectedItem]);

  const handleAddAssignment = useCallback(async (input: { taskId: string; resourceId: string }) => {
    if (!accessToken || !selectedItem) {
      return;
    }
    if (!isActiveAssignableResource(input.resourceId)) {
      return;
    }

    incrementPendingMove(selectedItem.id);
    setPlannerSaveError(null);
    try {
      const currentResourceIds = await getTaskResourceIds(input.taskId);
      const resourceIds = [...currentResourceIds, input.resourceId];
      const response = await fetch(`/api/tasks/${encodeURIComponent(input.taskId)}/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ resourceIds }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new AssignmentRequestError('assignment_add_failed', getAssignmentErrorCode(body));
      }

      const nextAssignments = normalizeAssignmentMutationPayload(body);
      if (nextAssignments) {
        replaceAssignmentsForTask(input.taskId, nextAssignments);
        void loadPlanner(plannerScope, { keepData: true });
      } else {
        await reloadProjectSnapshot();
        await loadPlanner(plannerScope, { keepData: true });
      }
    } catch (error) {
      if (error instanceof AssignmentRequestError && error.code === 'resource_inactive') {
        return;
      }
      setPlannerSaveError('Не удалось сохранить изменение. Данные возвращены к последнему состоянию сервера.');
      await loadPlanner(plannerScope, { keepData: true });
    } finally {
      decrementPendingMove(selectedItem.id);
    }
  }, [accessToken, decrementPendingMove, getTaskResourceIds, incrementPendingMove, isActiveAssignableResource, loadPlanner, plannerScope, reloadProjectSnapshot, replaceAssignmentsForTask, selectedItem]);

  const handleRemoveResource = useCallback(async (input: { assignmentId: string; resourceId: string }) => {
    if (!accessToken || !selectedItem) {
      return;
    }

    incrementPendingMove(selectedItem.id);
    setPlannerSaveError(null);
    try {
      const currentResourceIds = await getTaskResourceIds(selectedItem.taskId);
      const resourceIds = currentResourceIds.filter((resourceId) => resourceId !== input.resourceId);
      const response = await fetch(`/api/tasks/${encodeURIComponent(selectedItem.taskId)}/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ resourceIds }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error('assignment_remove_failed');
      }

      const nextAssignments = normalizeAssignmentMutationPayload(body);
      if (nextAssignments) {
        replaceAssignmentsForTask(selectedItem.taskId, nextAssignments);
        setSelectedItem((current) => (
          current?.id === input.assignmentId ? null : current
        ));
        void loadPlanner(plannerScope, { keepData: true });
      } else {
        await reloadProjectSnapshot();
        await loadPlanner(plannerScope, { keepData: true });
      }
    } catch {
      setPlannerSaveError('Не удалось сохранить изменение. Данные возвращены к последнему состоянию сервера.');
      await loadPlanner(plannerScope, { keepData: true });
    } finally {
      decrementPendingMove(selectedItem.id);
    }
  }, [accessToken, decrementPendingMove, getTaskResourceIds, incrementPendingMove, loadPlanner, plannerScope, reloadProjectSnapshot, replaceAssignmentsForTask, selectedItem]);

  const visibleProjectSnapshot = useMemo(
    () => deriveVisibleSnapshot(confirmedSnapshot, pendingCommands, dragPreview, scheduleOptions),
    [confirmedSnapshot, dragPreview, pendingCommands, scheduleOptions],
  );
  const displayedPlannerData = state.data;
  const customDays = useMemo(() => buildCustomDays(calendarDays), [calendarDays]);
  const timelineResources = useMemo(
    () => (
      buildCurrentProjectResourceTimeline(
        projectId,
        visibleProjectSnapshot.tasks,
        resources,
        assignments,
        displayedPlannerData,
      )
    ),
    [assignments, displayedPlannerData, projectId, resources, visibleProjectSnapshot.tasks],
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
  useEffect(() => {
    selectionHydratedRef.current = false;
  }, [projectId]);
  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    const timelineItem = timelineResources
      .flatMap((resource) => resource.items)
      .find((item) => item.id === selectedItem.id);

    if (!timelineItem) {
      setSelectedItem(null);
      return;
    }

    if (
      timelineItem.resourceId === selectedItem.resourceId
      && timelineItem.startDate === selectedItem.startDate
      && timelineItem.endDate === selectedItem.endDate
      && timelineItem.title === selectedItem.title
      && timelineItem.metadata.assignmentId === selectedItem.metadata.assignmentId
    ) {
      return;
    }

    setSelectedItem(timelineItem);
  }, [selectedItem, timelineResources]);
  useEffect(() => {
    if (!selectionHydratedRef.current) {
      return;
    }
    setProjectState(projectId, { plannerSelectedAssignmentId: selectedItem?.id ?? null });
  }, [projectId, selectedItem?.id, setProjectState]);
  useEffect(() => {
    if (selectionHydratedRef.current || selectedItem) {
      return;
    }

    const persistedAssignmentId = getProjectState(projectId)?.plannerSelectedAssignmentId;
    if (!persistedAssignmentId) {
      selectionHydratedRef.current = true;
      return;
    }

    const persistedItem = timelineResources
      .flatMap((resource) => resource.items)
      .find((item) => item.id === persistedAssignmentId);

    if (persistedItem) {
      setSelectedItem(persistedItem);
    }
    selectionHydratedRef.current = true;
  }, [getProjectState, projectId, selectedItem, timelineResources]);
  const selectedResource = useMemo(
    () => selectedItem ? resources.find((resource) => resource.id === selectedItem.resourceId) ?? null : null,
    [resources, selectedItem],
  );
  const selectedAssignedResources = useMemo<AssignmentResourceView[]>(() => {
    if (!selectedItem) {
      return [];
    }

    const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
    const assigned = assignments
      .filter((assignment) => assignment.taskId === selectedItem.taskId)
      .map((assignment) => {
        const assignedResource = resourceById.get(assignment.resourceId);
        return assignedResource ? { assignmentId: assignment.id, resource: assignedResource } : null;
      })
      .filter((entry): entry is AssignmentResourceView => Boolean(entry));

    if (assigned.length === 0 && selectedResource) {
      return [{ assignmentId: selectedItem.id, resource: selectedResource }];
    }

    return assigned;
  }, [assignments, resources, selectedItem, selectedResource]);
  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    const visibleTask = visibleProjectSnapshot.tasks.find((task) => task.id === selectedItem.taskId);
    if (!visibleTask) {
      return;
    }

    const nextStartDate = normalizeDateOnly(visibleTask.startDate);
    const nextEndDate = normalizeDateOnly(visibleTask.endDate);
    if (selectedItem.startDate === nextStartDate && selectedItem.endDate === nextEndDate) {
      return;
    }

    setSelectedItem((current) => (
      current?.id === selectedItem.id
        ? {
          ...current,
          startDate: nextStartDate,
          endDate: nextEndDate,
        }
        : current
    ));
  }, [selectedItem, visibleProjectSnapshot.tasks]);
  const readonly = !accessToken;
  const plannerResourceCount = timelineResources.length;
  const plannerAssignmentCount = timelineResources.reduce((total, resource) => total + resource.items.length, 0);
  const pendingMoveCount = Object.keys(pendingMoveCounts).length;
  const pendingCommandCount = pendingCommands.length;
  const hasBlockedPendingCommand = pendingCommands.some((command) => command.status === 'conflict' || command.status === 'failed');
  const hasRetryingPendingCommand = pendingCommands.some((command) => command.status === 'retrying');
  const isBackgroundRefreshing = state.status === 'loading' && Boolean(displayedPlannerData);
  const showSyncStatus = !readonly && (
    hasBlockedPendingCommand
    || hasRetryingPendingCommand
    || (pendingCommandCount > 0 && showDelayedSyncStatus)
  );
  const showSavingStatus = !readonly
    && pendingCommandCount === 0
    && savingState === 'saving'
    && showDelayedSavingStatus;
  const viewMode = projectStates[projectId]?.viewMode ?? globalViewMode;
  const plannerDayWidth = getPlannerDayWidth(viewMode);
  const hasActiveFilters = filters.query.trim().length > 0
    || filters.resourceTypes.length > 0
    || filters.conflictOnly
    || !filters.includeInactive;
  const toolbarButtonClassName = 'h-8 rounded-md border border-transparent bg-transparent px-2.5 text-[12px] font-medium text-slate-600 hover:border-primary hover:bg-primary/5 hover:text-primary';
  const getTimelineItemClassName = useCallback((item: ResourcePlannerTimelineItem) => {
    const metadata = getPlannerItemMetadata(item);
    if (!metadata) {
      return 'resource-planner-item';
    }

    const selectedClassName = selectedItem?.id === item.id ? ' resource-planner-item--selected' : '';
    const pendingClassName = (pendingMoveCounts[item.id] ?? 0) > 0 ? ' resource-planner-item--pending' : '';
    return metadata.hasConflict
      ? `resource-planner-item resource-planner-item--conflict${selectedClassName}${pendingClassName}`
      : `resource-planner-item resource-planner-item--normal${selectedClassName}${pendingClassName}`;
  }, [pendingMoveCounts, selectedItem]);
  const handleOpenTimelineItemDetails = useCallback((item: ResourcePlannerTimelineItem) => {
    setSelectedItem(item);
  }, []);
  const handleViewModeChange = useCallback((nextViewMode: ViewMode) => {
    setGlobalViewMode(nextViewMode);
    setProjectState(projectId, { viewMode: nextViewMode });
  }, [projectId, setGlobalViewMode, setProjectState]);
  const resourceMenuCommands = useMemo<Array<ResourceTimelineResourceMenuCommand<ResourcePlannerTimelineItem>>>(() => [
    {
      id: 'deactivate',
      label: 'Деактивировать',
      isVisible: (resource) => mapTimelineResourceStatusToActive(resource.status),
      isDisabled: (resource) => readonly || pendingCatalogResourceId === resource.id,
      danger: true,
      onSelect: (resource) => {
        const catalogResource = resources.find((candidate) => candidate.id === resource.id);
        if (catalogResource) {
          void handleSetResourceActive(catalogResource, false);
        }
      },
    },
    {
      id: 'activate',
      label: 'Вернуть в пул',
      isVisible: (resource) => !mapTimelineResourceStatusToActive(resource.status),
      isDisabled: (resource) => readonly || pendingCatalogResourceId === resource.id,
      onSelect: (resource) => {
        const catalogResource = resources.find((candidate) => candidate.id === resource.id);
        if (catalogResource) {
          void handleSetResourceActive(catalogResource, true);
        }
      },
    },
    {
      id: 'delete',
      label: 'Удалить',
      danger: true,
      isDisabled: (resource) => readonly || pendingCatalogResourceId === resource.id,
      onSelect: (resource) => {
        const catalogResource = resources.find((candidate) => candidate.id === resource.id);
        if (!catalogResource) {
          return;
        }
        if (window.confirm(`Удалить ресурс "${catalogResource.name}"? Назначения с ним тоже будут удалены.`)) {
          void handleDeleteResource(catalogResource);
        }
      },
    },
  ], [handleDeleteResource, handleSetResourceActive, pendingCatalogResourceId, readonly, resources]);
  const showSidePanel = Boolean(selectedItem);

  useEffect(() => {
    if (pendingCommandCount === 0 || hasBlockedPendingCommand || hasRetryingPendingCommand) {
      setShowDelayedSyncStatus(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowDelayedSyncStatus(true);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [hasBlockedPendingCommand, hasRetryingPendingCommand, pendingCommandCount]);

  useEffect(() => {
    if (savingState !== 'saving' || pendingCommandCount > 0) {
      setShowDelayedSavingStatus(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowDelayedSavingStatus(true);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [pendingCommandCount, savingState]);

  useEffect(() => {
    const plannerScrollElement = plannerSectionRef.current?.querySelector('.gantt-resourceTimeline-scrollContainer');
    if (!(plannerScrollElement instanceof HTMLElement)) {
      return;
    }

    const persistedState = getProjectState(projectId);
    if (persistedState && (persistedState.plannerScrollLeft !== 0 || persistedState.plannerScrollTop !== 0)) {
      plannerScrollElement.scrollLeft = persistedState.plannerScrollLeft;
      plannerScrollElement.scrollTop = persistedState.plannerScrollTop;
    }

    const handleScroll = () => {
      setProjectState(projectId, {
        plannerScrollLeft: plannerScrollElement.scrollLeft,
        plannerScrollTop: plannerScrollElement.scrollTop,
      });
    };

    plannerScrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      plannerScrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [displayedPlannerData, getProjectState, projectId, setProjectState]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f5f7]">
      <div className="px-3 md:px-4">
        <div className="flex min-h-[46px] flex-wrap items-center gap-2 bg-[#f4f5f7] py-2">
          {!readonly && (
            <Button
              type="button"
              size="sm"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              data-testid="planner-create-resource"
              onClick={() => setCreateModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              <span>Ресурс</span>
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    toolbarButtonClassName,
                    hasActiveFilters && 'border-primary bg-primary/5 text-primary hover:bg-primary/10',
                  )}
                  data-testid="planner-open-filter"
                >
                  <Funnel className="h-4 w-4" />
                  <span>Фильтр</span>
                  {hasActiveFilters ? (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      {Number(filters.query.trim().length > 0) + filters.resourceTypes.length + Number(filters.conflictOnly) + Number(!filters.includeInactive)}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80" data-testid="planner-filter-controls">
                <DropdownMenuLabel className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-slate-500">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Фильтр ресурсов
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="space-y-3 px-2 py-2" onKeyDownCapture={(event) => event.stopPropagation()}>
                  <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
                    Поиск
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm font-normal text-slate-900 outline-none transition-colors focus:border-primary"
                        placeholder="Ресурс, задача или проект"
                        value={filters.query}
                        onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                      />
                    </div>
                  </label>

                  <fieldset className="space-y-2">
                    <legend className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Тип ресурса</legend>
                    <div className="flex flex-wrap gap-2">
                      {RESOURCE_TYPE_OPTIONS.map((option) => {
                        const checked = filters.resourceTypes.includes(option.type);
                        return (
                          <label
                            key={option.type}
                            className={cn(
                              'inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-primary hover:bg-primary/5 hover:text-primary',
                            )}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={checked}
                              onChange={(event) => setFilters((current) => ({
                                ...current,
                                resourceTypes: event.target.checked
                                  ? [...current.resourceTypes, option.type]
                                  : current.resourceTypes.filter((type) => type !== option.type),
                              }))}
                            />
                            {option.label}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={filters.conflictOnly}
                        onChange={(event) => setFilters((current) => ({ ...current, conflictOnly: event.target.checked }))}
                      />
                      Только конфликты
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={filters.includeInactive}
                        onChange={(event) => setFilters((current) => ({ ...current, includeInactive: event.target.checked }))}
                      />
                      Показывать неактивные
                    </label>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full hover:border-primary hover:bg-primary/5 hover:text-primary"
                    disabled={!hasActiveFilters}
                    onClick={() => setFilters({
                      query: '',
                      resourceTypes: [],
                      conflictOnly: false,
                      includeInactive: true,
                    })}
                  >
                    Сбросить фильтр
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="inline-flex rounded-md">
              {VIEW_MODE_OPTIONS.map((option, index) => (
                <button
                  key={option.mode}
                  type="button"
                  className={cn(
                    'flex h-8 items-center border px-3 text-xs font-medium transition-colors focus-visible:outline-none',
                    index === 0 && 'rounded-l-md',
                    index === VIEW_MODE_OPTIONS.length - 1 && 'rounded-r-md',
                    viewMode === option.mode
                      ? 'border-primary bg-primary/5 text-primary hover:bg-primary/10'
                      : 'border-slate-300 text-slate-600 hover:border-primary hover:text-primary',
                  )}
                  onClick={() => handleViewModeChange(option.mode)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className={toolbarButtonClassName}
              data-testid="planner-refresh-button"
              onClick={() => { void loadPlanner(plannerScope, { keepData: true }); void loadResourceCatalog(); }}
            >
              <RefreshCw className={cn('h-4 w-4', isBackgroundRefreshing && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-0.5 flex min-w-0 flex-1 flex-col gap-3 overflow-auto px-3 md:px-4 lg:flex-row lg:overflow-hidden">
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-t-xl rounded-b-none border border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-white">
            <input
              className="sr-only"
              data-testid="planner-filter-query"
              aria-hidden="true"
              tabIndex={-1}
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            />
            {state.status === 'loading' && !displayedPlannerData && (
              <div className="bg-white px-4 py-3 text-sm text-slate-600" data-testid="planner-loading-state">
                Загружаем ресурсный календарь…
              </div>
            )}

            {state.status === 'error' && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="planner-error-state" role="alert">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>Не удалось загрузить ресурсный календарь. {state.error}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-red-200 bg-white text-red-800 hover:bg-red-50"
                    data-testid="planner-retry-button"
                    onClick={() => { void loadPlanner(plannerScope, { keepData: true }); }}
                  >
                    Повторить
                  </Button>
                </div>
              </div>
            )}

            {displayedPlannerData && filteredTimelineResources.length === 0 && (
              <div
                className="flex min-h-[320px] flex-1 items-start justify-center bg-white px-6 pt-12 pb-10"
                data-testid="planner-empty-state"
              >
                <div className="mx-auto flex max-w-md flex-col items-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                    <Users className="h-6 w-6 text-slate-500" />
                  </div>
                  <div className="mt-5 text-lg font-semibold text-slate-900">Ресурсов пока нет</div>
                  <div className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    {hasActiveFilters
                      ? 'По текущим фильтрам ничего не найдено. Добавьте новый ресурс и он сразу появится в календаре.'
                      : 'Добавьте первый ресурс в проект, чтобы начать планирование загрузки и назначений.'}
                  </div>
                  {!readonly && (
                    <Button
                      type="button"
                      size="sm"
                      className="mt-6 h-10 rounded-md px-4"
                      data-testid="planner-empty-create-resource"
                      onClick={() => { setCreateModalOpen(true); setResourceMutationError(null); }}
                    >
                      <Plus className="h-4 w-4" />
                      Создать ресурс
                    </Button>
                  )}
                </div>
              </div>
            )}

            {(resourceListError || resourceMutationError) && (
              <div
                className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                data-testid="resource-mutation-error"
                role="alert"
              >
                {resourceMutationError ?? resourceListError}
              </div>
            )}

            {plannerSaveError && (
              <div
                className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                data-testid="planner-save-error"
                role="alert"
              >
                {plannerSaveError}
              </div>
            )}

            {displayedPlannerData && filteredTimelineResources.length > 0 && (
              <div className="flex min-h-0 flex-1" data-testid="planner-data-state">
                <section
                  aria-label="Ресурсный календарь"
                  className="min-h-0 flex-1 overflow-hidden bg-white [&_.gantt-resourceTimeline-scrollContainer]:h-full"
                  data-testid="resource-planner-gantt-section"
                  ref={(element) => {
                    plannerSectionRef.current = element;
                  }}
                >
                  <GanttChart
                    mode="resource-planner"
                    resources={filteredTimelineResources}
                    dayWidth={plannerDayWidth}
                    laneHeight={42}
                    rowHeaderWidth={420}
                    headerHeight={40}
                    viewMode={viewMode}
                    allowVerticalPan
                    businessDays={ganttDayMode !== 'calendar'}
                    customDays={customDays}
                    readonly={readonly}
                    disableResourceReassignment={false}
                    resourceGrouping="type"
                    onResourceChange={readonly ? undefined : handleResourceChange}
                    onAddResource={readonly ? undefined : handleAddResource}
                    enableAddResource={!readonly}
                    resourceMenuCommands={resourceMenuCommands}
                    getItemClassName={getTimelineItemClassName}
                    activeResourceItemId={selectedItem?.id ?? null}
                    onResourceItemMenuClick={handleOpenTimelineItemDetails}
                    onResourceItemMove={readonly ? undefined : persistPlannerMove}
                  />
                </section>
              </div>
            )}

            {displayedPlannerData && (
              <footer
                className="flex h-6 shrink-0 select-none items-center gap-3 border-t border-slate-200 bg-white px-3"
                data-testid="resource-planner-statusbar"
              >
                <span className="font-mono text-[11px] text-slate-400">
                  {plannerResourceCount} ресурсов
                </span>

                <span className="font-mono text-[11px] text-slate-400">
                  {plannerAssignmentCount} назначений
                </span>

                <span className="font-mono text-[11px] text-slate-400">
                  {ganttDayMode === 'calendar' ? 'Календарные дни' : 'Рабочие дни'}
                </span>

                <span className="font-mono text-[11px] text-slate-400">
                  {plannerScope === 'current-project' ? 'Текущий проект' : 'Все проекты'}
                </span>

                {isBackgroundRefreshing && (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400" data-testid="planner-refreshing-state">
                    <LoaderCircle className="h-3 w-3 shrink-0 animate-spin" />
                    Обновляем...
                  </span>
                )}

                {readonly && (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-amber-600">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    Только для чтения
                  </span>
                )}

                {!readonly && (resourceListLoading || pendingCatalogResourceId) && (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-amber-600">
                    <LoaderCircle className="h-3 w-3 shrink-0 animate-spin" />
                    Ресурсы...
                  </span>
                )}

                {!readonly && plannerSaveError && (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-red-600">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                    Ошибка сохранения
                  </span>
                )}

                {!plannerSaveError && showSyncStatus && (
                  <span
                    className={cn(
                      'flex items-center gap-1.5 font-mono text-[11px] transition-colors',
                      hasBlockedPendingCommand ? 'text-red-600' : 'text-amber-600',
                    )}
                    data-testid="planner-sync-status"
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        hasBlockedPendingCommand ? 'bg-red-400' : 'bg-amber-400 animate-pulse',
                      )}
                    />
                    {hasBlockedPendingCommand
                      ? 'Конфликт версии'
                      : pendingCommandCount > 0
                        ? 'Синхронизация...'
                        : 'Офлайн'}
                  </span>
                )}

                {!plannerSaveError && showSavingStatus && (
                  <span
                    className="flex items-center gap-1.5 font-mono text-[11px] text-amber-600 transition-colors"
                    data-testid="planner-saving-status"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 animate-pulse" />
                    Сохранение...
                  </span>
                )}
              </footer>
            )}

          </div>
        </div>

        <div className={cn('w-full min-w-0 overflow-hidden rounded-t-xl rounded-b-none border border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)] lg:w-[360px] lg:flex-none xl:w-[380px]', !showSidePanel && 'hidden')}>
          {selectedItem && (
            <ResourceAssignmentDetailsPanel
              item={selectedItem}
              resource={selectedResource}
              resources={resources}
              assignedResources={selectedAssignedResources}
              readonly={readonly}
              onClose={() => setSelectedItem(null)}
              onOpenTask={onOpenTask}
              onAddResource={handleAddAssignment}
              onResourceChange={handleDetailsResourceChange}
              onRemoveResource={handleRemoveResource}
            />
          )}
        </div>
      </div>

      {createModalOpen && (
        <CreateResourceModal
          pending={pendingCatalogResourceId === 'new'}
          error={resourceMutationError}
          onSubmit={handleCreateResource}
          onCancel={() => { setCreateModalOpen(false); setResourceMutationError(null); }}
        />
      )}
    </div>
  );
}
