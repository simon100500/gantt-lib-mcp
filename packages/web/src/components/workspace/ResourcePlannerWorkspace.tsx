import { useEffect, useMemo, useState } from 'react';

import type { ResourcePlannerResult } from '../../lib/apiTypes.ts';
import type { PlannerCorrectionTarget } from '../../stores/useUIStore.ts';

interface ResourcePlannerWorkspaceProps {
  accessToken?: string | null;
  projectId: string;
  onBackToProject: () => void;
  onCorrectConflict: (target: PlannerCorrectionTarget) => void;
}

type PlannerState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'error'; data: null; error: string }
  | { status: 'ready'; data: ResourcePlannerResult; error: null };

function normalizePlannerPayload(payload: unknown): ResourcePlannerResult | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Partial<ResourcePlannerResult>;
  if (typeof candidate.projectId !== 'string' || typeof candidate.workspaceUserId !== 'string' || !Array.isArray(candidate.resources)) {
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
    workspaceUserId: candidate.workspaceUserId,
    resources,
  };
}

function formatIntervalLabel(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} → ${endDate}`;
}

export function ResourcePlannerWorkspace({ accessToken = null, projectId, onBackToProject, onCorrectConflict }: ResourcePlannerWorkspaceProps) {
  const [state, setState] = useState<PlannerState>({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let cancelled = false;

    const loadPlanner = async () => {
      if (!accessToken) {
        if (!cancelled) {
          setState({ status: 'error', data: null, error: 'Planner requires an authenticated project session.' });
        }
        return;
      }

      setState({ status: 'loading', data: null, error: null });

      try {
        const response = await fetch('/api/resources/planner', {
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
        if (!normalized) {
          throw new Error('Planner payload was malformed.');
        }

        if (!cancelled) {
          setState({ status: 'ready', data: normalized, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            data: null,
            error: error instanceof Error ? error.message : 'Planner failed to load.',
          });
        }
      }
    };

    void loadPlanner();

    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId]);

  const resourceCount = state.status === 'ready' ? state.data.resources.length : 0;
  const intervalCount = useMemo(() => {
    if (state.status !== 'ready') {
      return 0;
    }

    return state.data.resources.reduce((total, resource) => total + resource.intervals.length, 0);
  }, [state]);
  const conflictingResourceCount = useMemo(() => {
    if (state.status !== 'ready') {
      return 0;
    }

    return state.data.resources.filter((resource) => resource.hasConflicts).length;
  }, [state]);
  const conflictIntervalCount = useMemo(() => {
    if (state.status !== 'ready') {
      return 0;
    }

    return state.data.resources.reduce(
      (total, resource) => total + resource.intervals.filter((interval) => interval.hasConflict).length,
      0,
    );
  }, [state]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f5f7]">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Planner</p>
            <h1 className="text-lg font-semibold text-slate-900" data-testid="planner-title">Загрузка ресурсов по проектам</h1>
            <p className="text-sm text-slate-600" data-testid="planner-description">
              Planner показывает только shared-ресурсы текущего workspace и их интервалы по sibling-проектам.
            </p>
          </div>
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

      <div className="flex-1 overflow-auto p-4">
        {state.status === 'loading' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600" data-testid="planner-loading-state">
            Загружаем planner view по shared-ресурсам текущего workspace…
          </div>
        )}

        {state.status === 'error' && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700" data-testid="planner-error-state">
            Не удалось загрузить planner: {state.error}
          </div>
        )}

        {state.status === 'ready' && state.data.resources.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600" data-testid="planner-empty-state">
            В текущем workspace пока нет shared-ресурсов с назначениями в planner view.
          </div>
        )}

        {state.status === 'ready' && state.data.resources.length > 0 && (
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

            {state.data.resources.map((resource) => (
              <section
                key={resource.resourceId}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                data-testid={`planner-resource-${resource.resourceId}`}
              >
                <header className="border-b border-slate-200 px-4 py-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">{resource.resourceName}</h2>
                      <p className="text-xs text-slate-500">{resource.intervals.length} интервал(ов) в нескольких проектах workspace</p>
                    </div>
                    <div
                      className={resource.hasConflicts
                        ? 'inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800'
                        : 'inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700'}
                      data-testid={`planner-resource-conflict-badge-${resource.resourceId}`}
                    >
                      {resource.hasConflicts ? `Конфликтов: ${resource.conflictCount}` : 'Без конфликтов'}
                    </div>
                  </div>
                </header>
                <div className="divide-y divide-slate-100">
                  {resource.intervals.map((interval) => (
                    <div
                      key={interval.assignmentId}
                      className={interval.hasConflict
                        ? 'grid gap-3 bg-amber-50/60 px-4 py-3 text-sm text-slate-700 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_auto]'
                        : 'grid gap-3 px-4 py-3 text-sm text-slate-700 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_auto]'}
                      data-testid={`planner-interval-${interval.assignmentId}`}
                    >
                      <div>
                        <div className="font-medium text-slate-900">{formatIntervalLabel(interval.startDate, interval.endDate)}</div>
                        {interval.hasConflict && (
                          <div className="mt-1 text-xs font-medium text-amber-800" data-testid={`planner-interval-conflict-${interval.assignmentId}`}>
                            Пересечение с {interval.conflictCount} назначени(ем/ями)
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Проект</div>
                        <div>{interval.projectName}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Задача</div>
                        <div>{interval.taskName}</div>
                        {interval.hasConflict && interval.conflictAssignmentIds.length > 0 && (
                          <div className="mt-1 text-xs text-slate-500" data-testid={`planner-conflict-peers-${interval.assignmentId}`}>
                            Связанные назначения: {interval.conflictAssignmentIds.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-start justify-start md:justify-end">
                        {interval.hasConflict ? (
                          <button
                            type="button"
                            className="inline-flex h-9 items-center justify-center rounded-md border border-amber-300 bg-white px-3 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-50"
                            data-testid={`planner-correct-${interval.assignmentId}`}
                            onClick={() => onCorrectConflict({
                              projectId: interval.projectId,
                              taskId: interval.taskId,
                              assignmentId: interval.assignmentId,
                              resourceId: interval.resourceId,
                            })}
                          >
                            Открыть задачу для исправления
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Только просмотр</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
