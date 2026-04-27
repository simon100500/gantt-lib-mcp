import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Package, Funnel, LoaderCircle, Plus, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { GanttChart } from 'gantt-lib';
import type { ResourceTimelineMove } from 'gantt-lib';

import type { PlannerScope, ProjectLoadResponse, ProjectResource, ResourcePlannerInterval, ResourcePlannerResult, ResourceType, TaskAssignmentRecord } from '../../lib/apiTypes.ts';
import { useCommandCommit } from '../../hooks/useCommandCommit.ts';
import { createHistoryGroup } from '../../hooks/useProjectCommands.ts';
import { cn } from '../../lib/utils.ts';
import { useAuthStore } from '../../stores/useAuthStore.ts';
import { useProjectStore } from '../../stores/useProjectStore.ts';
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
  getPlannerItemMetadata,
  mapResourcePlannerResultToTimelineResources,
} from './resourcePlannerAdapter.ts';
import type { ResourcePlannerTimelineItem } from './resourcePlannerAdapter.ts';
import { ResourceCatalogPanel, type ResourceCatalogRowStats } from './ResourceCatalogPanel.tsx';
import { ResourceAssignmentDetailsPanel } from './ResourceAssignmentDetailsPanel.tsx';
import { filterResourceTimelineResources, type ResourcePlannerFilters } from './resourcePlannerFilters.ts';
import { buildReplacementResourceIds, classifyResourcePlannerMove, type ResourcePlannerMoveClassification } from './resourcePlannerMoves.ts';

interface ResourcePlannerWorkspaceProps {
  accessToken?: string | null;
  projectId: string;
  ganttDayMode?: 'business' | 'calendar';
  onBackToProject: () => void;
  onCorrectConflict: (target: PlannerCorrectionTarget) => void;
}

type PlannerState =
  | { status: 'loading'; data: ResourcePlannerResult | null; error: null }
  | { status: 'error'; data: ResourcePlannerResult | null; error: string }
  | { status: 'ready'; data: ResourcePlannerResult; error: null };

type OptimisticPlannerMove = ResourcePlannerMoveClassification & {
  kind: 'date-only' | 'resource-only' | 'combined';
};

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

function countPlannerAssignments(data: ResourcePlannerResult | null): number {
  return data?.resources.reduce((total, resource) => total + resource.intervals.length, 0) ?? 0;
}

function refreshResourceConflictSummary(resource: ResourcePlannerResult['resources'][number]): ResourcePlannerResult['resources'][number] {
  const conflictCount = resource.intervals.filter((interval) => interval.hasConflict).length;
  return {
    ...resource,
    hasConflicts: conflictCount > 0,
    conflictCount,
  };
}

function isOptimisticPlannerMove(classification: ResourcePlannerMoveClassification): classification is OptimisticPlannerMove {
  return classification.kind === 'date-only'
    || classification.kind === 'resource-only'
    || classification.kind === 'combined';
}

function applyOptimisticPlannerMove(
  data: ResourcePlannerResult,
  move: OptimisticPlannerMove,
): ResourcePlannerResult {
  const sourceResource = data.resources.find((resource) => (
    resource.intervals.some((interval) => interval.assignmentId === move.assignmentId)
  ));
  const sourceInterval = sourceResource?.intervals.find((interval) => interval.assignmentId === move.assignmentId);
  if (!sourceInterval) {
    return data;
  }

  const targetResource = data.resources.find((resource) => resource.resourceId === move.toResourceId);
  const targetResourceName = targetResource?.resourceName ?? move.toResourceId;
  const placedInterval: ResourcePlannerInterval = {
    ...sourceInterval,
    resourceId: move.toResourceId,
    resourceName: targetResourceName,
    startDate: move.startDate,
    endDate: move.endDate,
  };

  const resourcesWithoutMovedInterval = data.resources.map((resource) => {
    const nextIntervals = resource.intervals.filter((interval) => interval.assignmentId !== move.assignmentId);

    return refreshResourceConflictSummary({ ...resource, intervals: nextIntervals });
  });

  const resourceExists = resourcesWithoutMovedInterval.some((resource) => resource.resourceId === move.toResourceId);
  const nextResources = resourceExists
    ? resourcesWithoutMovedInterval.map((resource) => (
      resource.resourceId === move.toResourceId
        ? refreshResourceConflictSummary({ ...resource, intervals: [...resource.intervals, placedInterval] })
        : resource
    ))
    : [
      ...resourcesWithoutMovedInterval,
      refreshResourceConflictSummary({
        resourceId: move.toResourceId,
        resourceName: targetResourceName,
        hasConflicts: Boolean(placedInterval.hasConflict),
        conflictCount: placedInterval.hasConflict ? 1 : 0,
        intervals: [placedInterval],
      }),
    ];

  return {
    ...data,
    resources: nextResources,
  };
}

function applyPlannerAssignmentRecord(
  data: ResourcePlannerResult,
  oldAssignmentId: string,
  assignment: TaskAssignmentRecord,
): ResourcePlannerResult {
  return {
    ...data,
    resources: data.resources.map((resource) => refreshResourceConflictSummary({
      ...resource,
      intervals: resource.intervals.map((interval) => (
        interval.assignmentId === oldAssignmentId
          ? {
            ...interval,
            assignmentId: assignment.id,
            resourceId: assignment.resourceId,
            assignmentCreatedAt: assignment.createdAt,
          }
          : interval
      )),
    })),
  };
}

export function ResourcePlannerWorkspace({ accessToken = null, projectId, ganttDayMode = 'calendar', onBackToProject, onCorrectConflict }: ResourcePlannerWorkspaceProps) {
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
  const projects = useAuthStore((store) => store.projects);
  const resources = useProjectStore((store) => store.resources);
  const setResources = useProjectStore((store) => store.setResources);
  const setAssignments = useProjectStore((store) => store.setAssignments);
  const setConfirmed = useProjectStore((store) => store.setConfirmed);
  const { commitCommand } = useCommandCommit(accessToken);
  const [resourceNameDraft, setResourceNameDraft] = useState('');
  const [resourceTargetDraft, setResourceTargetDraft] = useState('shared');
  const [resourceTypeDraft, setResourceTypeDraft] = useState<ResourceType>('human');
  const [resourceListError, setResourceListError] = useState<string | null>(null);
  const [resourceCreateError, setResourceCreateError] = useState<string | null>(null);
  const [resourceMutationError, setResourceMutationError] = useState<string | null>(null);
  const [resourceListLoading, setResourceListLoading] = useState(false);
  const [creatingResource, setCreatingResource] = useState(false);
  const [pendingCatalogResourceId, setPendingCatalogResourceId] = useState<string | null>(null);
  const [pendingMoveIds, setPendingMoveIds] = useState<Set<string>>(() => new Set());
  const [plannerSaveError, setPlannerSaveError] = useState<string | null>(null);
  const [showCatalogPanel, setShowCatalogPanel] = useState(false);
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
    setResourceMutationError(null);

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

  const patchCatalogResource = useCallback(async (resource: ProjectResource, payload: { name?: string; type?: ResourceType; isActive?: boolean }) => {
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

      await loadResourceCatalog(updated.projectId ?? projectId);
      await loadPlanner(plannerScope, { keepData: true });
    } catch (error) {
      setResourceMutationError(error instanceof Error ? error.message : 'Не удалось сохранить изменение. Данные возвращены к последнему состоянию сервера.');
    } finally {
      setPendingCatalogResourceId(null);
    }
  }, [accessToken, loadPlanner, loadResourceCatalog, pendingCatalogResourceId, plannerScope, projectId]);

  const handleRenameResource = useCallback(async (resource: ProjectResource, nameDraft: string) => {
    const name = nameDraft.trim();
    if (!name) {
      setResourceMutationError('Введите название ресурса.');
      return;
    }

    if (name === resource.name) {
      return;
    }

    await patchCatalogResource(resource, { name });
  }, [patchCatalogResource]);

  const handleChangeResourceType = useCallback(async (resource: ProjectResource, type: ResourceType) => {
    if (type === resource.type) {
      return;
    }

    await patchCatalogResource(resource, { type });
  }, [patchCatalogResource]);

  const handleSetResourceActive = useCallback(async (resource: ProjectResource, isActive: boolean) => {
    if (isActive === resource.isActive) {
      return;
    }

    await patchCatalogResource(resource, { isActive });
  }, [patchCatalogResource]);

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
      throw new Error('assignment_replacement_failed');
    }

    const nextAssignments = normalizeAssignmentMutationPayload(body);
    if (!nextAssignments) {
      await reloadProjectSnapshot();
      return null;
    }

    const currentAssignments = useProjectStore.getState().assignments;
    setAssignments([
      ...currentAssignments.filter((assignment) => assignment.taskId !== taskId),
      ...nextAssignments,
    ]);
    return nextAssignments;
  }, [accessToken, getTaskResourceIds, reloadProjectSnapshot, setAssignments]);

  const persistPlannerMove = useCallback(async (move: ResourceTimelineMove<ResourcePlannerTimelineItem>) => {
    if (!accessToken || pendingMoveIds.has(move.itemId) || move.item.locked) {
      return;
    }

    const classification = classifyResourcePlannerMove(move);
    if (!isOptimisticPlannerMove(classification)) {
      return;
    }

    setPendingMoveIds((current) => new Set(current).add(classification.itemId));
    setPlannerSaveError(null);
    setState((current) => {
      if (!current.data) {
        return current;
      }

      const optimisticData = applyOptimisticPlannerMove(current.data, classification);
      setResourcePlannerCache(projectId, plannerScope, optimisticData);
      return current.status === 'error'
        ? { status: 'error', data: optimisticData, error: current.error }
        : { status: 'ready', data: optimisticData, error: null };
    });
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

    let datePersisted = false;
    try {
      if (classification.commands.length > 0) {
        const historySeed = {
          groupId: crypto.randomUUID(),
          requestContextId: crypto.randomUUID(),
        };

        for (const [index, command] of classification.commands.entries()) {
          const result = await commitCommand(
            command,
            createHistoryGroup('Перенос назначения', index === classification.commands.length - 1, historySeed),
          );
          if (!result.accepted) {
            throw new Error('date_command_rejected');
          }
        }
        datePersisted = true;
      }

      if (classification.kind === 'resource-only' || classification.kind === 'combined') {
        try {
          const replacementAssignments = await persistResourceReplacement(classification.taskId, classification.fromResourceId, classification.toResourceId);
          const replacementAssignment = replacementAssignments?.find((assignment) => (
            assignment.taskId === classification.taskId && assignment.resourceId === classification.toResourceId
          ));
          if (!replacementAssignments) {
            await loadPlanner(plannerScope, { keepData: true });
          } else if (replacementAssignment) {
            setState((current) => {
              if (!current.data) {
                return current;
              }

              const nextData = applyPlannerAssignmentRecord(current.data, classification.assignmentId, replacementAssignment);
              setResourcePlannerCache(projectId, plannerScope, nextData);
              return current.status === 'error'
                ? { status: 'error', data: nextData, error: current.error }
                : { status: 'ready', data: nextData, error: null };
            });
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
          }
        } catch (error) {
          if (classification.kind === 'combined' && datePersisted) {
            setPlannerSaveError('Даты назначения сохранены, но ресурс не изменён. Календарь обновлён по данным сервера.');
            await loadPlanner(plannerScope, { keepData: true });
            return;
          }
          throw error;
        }
      }
    } catch {
      setPlannerSaveError('Не удалось сохранить изменение. Данные возвращены к последнему состоянию сервера.');
      await loadPlanner(plannerScope, { keepData: true });
    } finally {
      setPendingMoveIds((current) => {
        const next = new Set(current);
        next.delete(classification.itemId);
        return next;
      });
    }
  }, [accessToken, commitCommand, loadPlanner, pendingMoveIds, persistResourceReplacement, plannerScope, projectId, setResourcePlannerCache, state.data]);

  const handleDetailsDateChange = useCallback((input: { assignmentId: string; startDate: string; endDate: string }) => {
    if (!selectedItem || input.assignmentId !== selectedItem.id) {
      return;
    }

    void persistPlannerMove({
      item: selectedItem,
      itemId: selectedItem.id,
      fromResourceId: selectedItem.resourceId,
      toResourceId: selectedItem.resourceId,
      startDate: new Date(`${input.startDate}T00:00:00.000Z`),
      endDate: new Date(`${input.endDate}T00:00:00.000Z`),
    });
  }, [persistPlannerMove, selectedItem]);

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

  const handleRemoveResource = useCallback(async (input: { assignmentId: string; resourceId: string }) => {
    if (!accessToken || !selectedItem || input.assignmentId !== selectedItem.id) {
      return;
    }

    if (!window.confirm('Ресурс будет снят с этой задачи. Продолжить?')) {
      return;
    }

    setPendingMoveIds((current) => new Set(current).add(selectedItem.id));
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
        const currentAssignments = useProjectStore.getState().assignments;
        setAssignments([
          ...currentAssignments.filter((assignment) => assignment.taskId !== selectedItem.taskId),
          ...nextAssignments,
        ]);
      } else {
        await reloadProjectSnapshot();
      }

      await loadPlanner(plannerScope, { keepData: true });
    } catch {
      setPlannerSaveError('Не удалось сохранить изменение. Данные возвращены к последнему состоянию сервера.');
      await loadPlanner(plannerScope, { keepData: true });
    } finally {
      setPendingMoveIds((current) => {
        const next = new Set(current);
        next.delete(selectedItem.id);
        return next;
      });
    }
  }, [accessToken, getTaskResourceIds, loadPlanner, plannerScope, reloadProjectSnapshot, selectedItem, setAssignments]);

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
  const readonly = !accessToken;
  const disableResourceReassignment = true;
  const plannerResourceCount = displayedPlannerData?.resources.length ?? 0;
  const plannerAssignmentCount = countPlannerAssignments(displayedPlannerData ?? null);
  const pendingMoveCount = pendingMoveIds.size;
  const viewMode = projectStates[projectId]?.viewMode ?? globalViewMode;
  const plannerDayWidth = getPlannerDayWidth(viewMode);
  const hasActiveFilters = filters.query.trim().length > 0
    || filters.resourceTypes.length > 0
    || filters.conflictOnly
    || filters.includeInactive;
  const toolbarButtonClassName = 'h-8 rounded-md border border-transparent bg-transparent px-2.5 text-[12px] font-medium text-slate-600 hover:border-primary hover:text-primary';
  const toolbarPrimaryButtonClassName = 'h-8 rounded-md border border-primary/40 bg-primary/5 px-2.5 text-[12px] font-medium text-primary hover:border-primary hover:bg-primary/10';
  const getTimelineItemClassName = useCallback((item: ResourcePlannerTimelineItem) => {
    const metadata = getPlannerItemMetadata(item);
    if (!metadata) {
      return 'resource-planner-item';
    }

    const selectedClassName = selectedItem?.id === item.id ? ' resource-planner-item--selected' : '';
    const pendingClassName = pendingMoveIds.has(item.id) ? ' resource-planner-item--pending' : '';
    return metadata.hasConflict
      ? `resource-planner-item resource-planner-item--conflict${selectedClassName}${pendingClassName}`
      : `resource-planner-item resource-planner-item--normal${selectedClassName}${pendingClassName}`;
  }, [pendingMoveIds, selectedItem]);
  const handleSelectTimelineItem = useCallback((item: ResourcePlannerTimelineItem) => {
    setShowCatalogPanel(false);
    setSelectedItem(item);
  }, []);
  const handleOpenCatalogPanel = useCallback(() => {
    setSelectedItem(null);
    setShowCatalogPanel(true);
    window.setTimeout(() => {
      document.getElementById('resource-create-name')?.focus();
    }, 0);
  }, []);
  const handleViewModeChange = useCallback((nextViewMode: ViewMode) => {
    setGlobalViewMode(nextViewMode);
    setProjectState(projectId, { viewMode: nextViewMode });
  }, [projectId, setGlobalViewMode, setProjectState]);
  const showSidePanel = Boolean(selectedItem || showCatalogPanel);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f5f7]">
      <div className="px-3 md:px-4">
        <div className="flex min-h-[46px] flex-wrap items-center gap-2 bg-[#f4f5f7] py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={toolbarPrimaryButtonClassName}
              onClick={handleOpenCatalogPanel}
            >
              <Plus className="h-4 w-4" />
              <span>Создать</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    toolbarButtonClassName,
                    hasActiveFilters && 'border-primary bg-primary/5 text-primary',
                  )}
                  data-testid="planner-open-filter"
                >
                  <Funnel className="h-4 w-4" />
                  <span>Фильтр</span>
                  {hasActiveFilters ? (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {Number(filters.query.trim().length > 0) + filters.resourceTypes.length + Number(filters.conflictOnly) + Number(filters.includeInactive)}
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
                      className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm font-normal text-slate-900 outline-none transition-colors focus:border-slate-400"
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
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
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
                  className="h-8 w-full"
                  disabled={!hasActiveFilters}
                  onClick={() => setFilters({
                    query: '',
                    resourceTypes: [],
                    conflictOnly: false,
                    includeInactive: false,
                  })}
                >
                  Сбросить фильтр
                </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

          </div>

          <div className="ml-auto flex items-center gap-2">
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
              className={cn(toolbarButtonClassName, showCatalogPanel && !selectedItem && 'border-primary bg-primary/5 text-primary')}
              data-testid="planner-open-catalog"
              onClick={() => {
                setSelectedItem(null);
                setShowCatalogPanel((current) => !current);
              }}
            >
              <Package className="h-4 w-4" />
              <span>Ресурсы</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className={toolbarButtonClassName}
              onClick={() => { void loadPlanner(plannerScope, { keepData: true }); void loadResourceCatalog(); }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-0.5 flex min-w-0 flex-1 flex-col gap-3 overflow-auto px-3 md:px-4 lg:flex-row lg:overflow-hidden">
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-white">
            <input
              className="sr-only"
              data-testid="planner-filter-query"
              aria-hidden="true"
              tabIndex={-1}
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            />
            {state.status === 'loading' && (
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

            {state.status === 'ready' && displayedPlannerData && filteredTimelineResources.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600" data-testid="planner-empty-state">
                <div className="font-semibold text-slate-900">Нет ресурсов для отображения</div>
                <div className="mt-1">Создайте ресурс или скорректируйте фильтр.</div>
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

            {state.status === 'ready' && displayedPlannerData && filteredTimelineResources.length > 0 && (
              <div className="flex min-h-0 flex-1" data-testid="planner-data-state">
                <section
                  aria-label="Ресурсный календарь"
                  className="min-h-0 flex-1 overflow-hidden bg-white [&_.gantt-resourceTimeline-scrollContainer]:h-full"
                  data-testid="resource-planner-gantt-section"
                >
                  <GanttChart
                    mode="resource-planner"
                    resources={filteredTimelineResources}
                    dayWidth={plannerDayWidth}
                    laneHeight={42}
                    rowHeaderWidth={220}
                    headerHeight={40}
                    viewMode={viewMode}
                    allowVerticalPan
                    businessDays={ganttDayMode !== 'calendar'}
                    readonly={readonly}
                    disableResourceReassignment={disableResourceReassignment}
                    getItemClassName={getTimelineItemClassName}
                    onResourceItemClick={handleSelectTimelineItem}
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

                {readonly && (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-amber-600">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    Только для чтения
                  </span>
                )}

                {!readonly && plannerSaveError && (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-red-600">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                    Ошибка сохранения
                  </span>
                )}

                {!readonly && !plannerSaveError && pendingMoveCount > 0 && (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-amber-600">
                    <LoaderCircle className="h-3 w-3 shrink-0 animate-spin" />
                    Сохранение...
                  </span>
                )}

                {!readonly && !plannerSaveError && pendingMoveCount === 0 && (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-600">
                    <Check className="h-3 w-3 shrink-0" />
                    Сохранено
                  </span>
                )}
              </footer>
            )}

          </div>
        </div>

        <div className={cn('w-full max-w-[420px] overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)]', !showSidePanel && 'hidden')}>
          {selectedItem ? (
            <ResourceAssignmentDetailsPanel
              item={selectedItem}
              resource={selectedResource}
              resources={resources}
              readonly={readonly}
              onClose={() => setSelectedItem(null)}
              onCorrectConflict={onCorrectConflict}
              onDateChange={handleDetailsDateChange}
              onResourceChange={handleDetailsResourceChange}
              onRemoveResource={handleRemoveResource}
            />
          ) : (
            <div className={cn('h-full overflow-auto p-4', !showCatalogPanel && 'hidden')}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Каталог ресурсов</div>
                  <div className="text-xs text-slate-500">Создание и правка ресурсов скрыты от основного canvas.</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-slate-600"
                  onClick={() => setShowCatalogPanel(false)}
                >
                  Закрыть
                </Button>
              </div>

              <ResourceCatalogPanel
                resources={resources}
                activeProjects={activeProjects}
                readonly={readonly}
                loading={resourceListLoading}
                creating={creatingResource}
                error={resourceListError}
                createError={resourceCreateError}
                mutationError={resourceMutationError}
                pendingResourceId={pendingCatalogResourceId}
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
                onRenameResource={handleRenameResource}
                onChangeResourceType={handleChangeResourceType}
                onSetResourceActive={handleSetResourceActive}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
