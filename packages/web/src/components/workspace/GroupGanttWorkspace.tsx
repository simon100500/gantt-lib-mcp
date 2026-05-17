import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { TaskListColumnId, TaskListColumnWidthMap, TaskListMenuCommand } from 'gantt-lib';

import { GanttChart, type GanttChartRef } from '../GanttChart.tsx';
import { Toolbar } from '../layout/Toolbar.tsx';
import { Button } from '../ui/button.tsx';
import type { GroupGanttOverviewResponse, GroupGanttSectionOverview } from '../../lib/apiTypes.ts';
import { TASK_LIST_COLUMN_ROWS, TASK_LIST_COLUMN_WIDTHS } from '../../lib/taskListColumns.ts';
import { useProjectUIStore } from '../../stores/useProjectUIStore.ts';
import { useUIStore } from '../../stores/useUIStore.ts';
import { cn } from '../../lib/utils.ts';
import type { Task } from '../../types.ts';

interface GroupGanttWorkspaceProps {
  accessToken?: string | null;
  groupId: string;
  onOpenProject: (projectId: string, taskId?: string) => void;
}

type GroupGanttTask = Task & {
  sourceProjectId: string;
  sourceTaskId?: string;
  overviewDepth: 1 | 2 | 3;
};

type CollapseLevel = 'project' | 'section' | 'subsection' | 'custom';

type LoadState =
  | { status: 'loading'; data: GroupGanttOverviewResponse | null; error: null }
  | { status: 'ready'; data: GroupGanttOverviewResponse; error: null }
  | { status: 'error'; data: GroupGanttOverviewResponse | null; error: string };

const HIDDEN_COLUMNS: TaskListColumnId[] = [
  'work-volume',
  'completed-volume',
  'status',
  'assigned-resources',
  'dependencies',
] as TaskListColumnId[];

const TASK_LIST_COLUMN_WIDTHS_OVERVIEW: TaskListColumnWidthMap = {
  ...TASK_LIST_COLUMN_WIDTHS,
  name: 260,
  progress: 74,
};

function formatTaskCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod100 >= 11 && mod100 <= 14) return `${count} задач`;
  if (mod10 === 1) return `${count} задача`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} задачи`;
  return `${count} задач`;
}

function buildTasks(data: GroupGanttOverviewResponse): GroupGanttTask[] {
  return data.projects.flatMap((project): GroupGanttTask[] => {
    if (!project.startDate || !project.endDate) {
      return [];
    }

    const projectTask: GroupGanttTask = {
      id: `project:${project.id}`,
      sourceProjectId: project.id,
      name: project.name,
      startDate: project.startDate,
      endDate: project.endDate,
      type: 'task',
      progress: project.progress,
      accepted: project.progress >= 100,
      locked: true,
      sortOrder: 0,
      overviewDepth: 1,
    };

    const buildSectionTasks = (
      sections: GroupGanttSectionOverview[],
      parentId: string,
      indexPrefix: string,
      depth: 2 | 3,
    ): GroupGanttTask[] => sections
      .filter((section) => section.startDate && section.endDate)
      .flatMap((section, index): GroupGanttTask[] => {
        const sectionTask: GroupGanttTask = {
          id: `section:${project.id}:${section.taskId}`,
          sourceProjectId: project.id,
          sourceTaskId: section.taskId,
          parentId,
          name: section.name,
          startDate: section.startDate,
          endDate: section.endDate,
          type: 'task',
          color: section.color ?? undefined,
          status: section.status,
          progress: section.progress,
          accepted: section.progress >= 100,
          locked: true,
          sortOrder: Number(`${indexPrefix}${index + 1}`),
          overviewDepth: depth,
        };

        return [
          sectionTask,
          ...(depth < 3 ? buildSectionTasks(section.children ?? [], sectionTask.id, `${indexPrefix}${index + 1}`, 3) : []),
        ];
      });

    const sectionTasks = buildSectionTasks(project.sections, projectTask.id, '1', 2);

    return [projectTask, ...sectionTasks];
  });
}

function getCollapsedIdsForLevel(
  level: Exclude<CollapseLevel, 'custom'>,
  tasks: GroupGanttTask[],
  parentTaskIds: Set<string>,
): string[] {
  if (level === 'subsection') {
    return [];
  }

  return tasks
    .filter((task) => {
      if (!parentTaskIds.has(task.id)) return false;
      if (level === 'project') return task.overviewDepth >= 1;
      return task.overviewDepth >= 2;
    })
    .map((task) => task.id);
}

function getCollapseLevelFromIds(
  collapsedParentIds: Set<string>,
  tasks: GroupGanttTask[],
  parentTaskIds: Set<string>,
): CollapseLevel {
  const matches = (level: Exclude<CollapseLevel, 'custom'>): boolean => {
    const expected = getCollapsedIdsForLevel(level, tasks, parentTaskIds);
    return expected.length === collapsedParentIds.size
      && expected.every((id) => collapsedParentIds.has(id));
  };

  if (matches('subsection')) return 'subsection';
  if (matches('section')) return 'section';
  if (matches('project')) return 'project';
  return 'custom';
}

export function GroupGanttWorkspace({ accessToken = null, groupId, onOpenProject }: GroupGanttWorkspaceProps) {
  const ganttRef = useRef<GanttChartRef>(null);
  const viewMode = useUIStore((state) => state.viewMode);
  const setViewMode = useUIStore((state) => state.setViewMode);
  const showTaskList = useUIStore((state) => state.showTaskList);
  const showChart = useUIStore((state) => state.showChart);
  const projectStates = useProjectUIStore((state) => state.projectStates);
  const setProjectState = useProjectUIStore((state) => state.setProjectState);
  const [state, setState] = useState<LoadState>({ status: 'loading', data: null, error: null });
  const groupStateId = useMemo(() => `group:${groupId}`, [groupId]);

  const loadOverview = useCallback(async (keepData = false) => {
    if (!accessToken) {
      setState({ status: 'error', data: null, error: 'Нужна авторизация.' });
      return;
    }

    setState((current) => ({
      status: 'loading',
      data: keepData ? current.data : null,
      error: null,
    }));

    try {
      const response = await fetch(`/api/project-groups/${encodeURIComponent(groupId)}/overview-gantt`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `HTTP ${response.status}`;
        throw new Error(message);
      }

      setState({ status: 'ready', data: body as GroupGanttOverviewResponse, error: null });
    } catch (error) {
      setState((current) => ({
        status: 'error',
        data: keepData ? current.data : null,
        error: error instanceof Error ? error.message : 'Не удалось загрузить портфель.',
      }));
    }
  }, [accessToken, groupId]);

  useEffect(() => {
    void loadOverview(false);
  }, [loadOverview]);

  const data = state.data;
  const tasks = useMemo(() => (data ? buildTasks(data) : []), [data]);
  const projectCount = data?.projects.length ?? 0;
  const sectionCount = data?.projects.reduce((sum, project) => sum + project.sectionCount, 0) ?? 0;
  const sourceTaskCount = data?.projects.reduce((sum, project) => sum + project.taskCount, 0) ?? 0;
  const hasRenderableChart = tasks.length > 0;
  const parentTaskIds = useMemo(() => new Set(tasks.flatMap((task) => (task.parentId ? [task.parentId] : []))), [tasks]);
  const collapsedParentIds = useMemo(() => (
    new Set(projectStates[groupStateId]?.collapsedParentIds ?? [])
  ), [groupStateId, projectStates]);
  const collapseLevel = useMemo(
    () => getCollapseLevelFromIds(collapsedParentIds, tasks, parentTaskIds),
    [collapsedParentIds, parentTaskIds, tasks],
  );

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const nextCollapsedParentIds = Array.from(collapsedParentIds)
      .filter((id) => parentTaskIds.has(id));
    if (nextCollapsedParentIds.length !== collapsedParentIds.size) {
      setProjectState(groupStateId, { collapsedParentIds: nextCollapsedParentIds });
    }
  }, [collapsedParentIds, groupStateId, parentTaskIds, setProjectState, state.status]);

  const applyCollapseLevel = useCallback((level: Exclude<CollapseLevel, 'custom'>) => {
    setProjectState(groupStateId, {
      collapsedParentIds: getCollapsedIdsForLevel(level, tasks, parentTaskIds),
    });
  }, [groupStateId, parentTaskIds, setProjectState, tasks]);

  const taskListMenuCommands = useMemo<TaskListMenuCommand<Task>[]>(() => [
    {
      id: 'open-source-project',
      label: 'Открыть проект',
      icon: <ExternalLink className="h-4 w-4" />,
      scope: 'all',
      onSelect: (row) => {
        const overviewRow = row as GroupGanttTask;
        onOpenProject(overviewRow.sourceProjectId, overviewRow.sourceTaskId);
      },
    },
  ], [onOpenProject]);

  const handleCollapseAll = useCallback(() => {
    setProjectState(groupStateId, {
      collapsedParentIds: getCollapsedIdsForLevel('project', tasks, parentTaskIds),
    });
  }, [groupStateId, parentTaskIds, setProjectState, tasks]);

  const handleExpandAll = useCallback(() => {
    setProjectState(groupStateId, { collapsedParentIds: [] });
  }, [groupStateId, setProjectState]);

  const handleToggleCollapse = useCallback((parentId: string) => {
    const next = new Set(collapsedParentIds);
    if (next.has(parentId)) next.delete(parentId);
    else next.add(parentId);
    setProjectState(groupStateId, { collapsedParentIds: Array.from(next) });
  }, [collapsedParentIds, groupStateId, setProjectState]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f5f7]">
      <div className="px-3 md:px-4">
        <Toolbar
          onScrollToToday={() => ganttRef.current?.scrollToToday()}
          onCollapseAll={handleCollapseAll}
          onExpandAll={handleExpandAll}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          ganttDayMode="calendar"
          readOnly
          taskListColumnRows={TASK_LIST_COLUMN_ROWS}
          hiddenTaskListColumns={HIDDEN_COLUMNS}
          hierarchyCollapseRows={[
            { id: 'project', label: 'Проекты' },
            { id: 'section', label: 'Разделы' },
            { id: 'subsection', label: 'Подразделы' },
          ]}
          hierarchyCollapseValue={collapseLevel === 'custom' ? null : collapseLevel}
          onHierarchyCollapseChange={(value) => {
            if (value === 'project' || value === 'section' || value === 'subsection') {
              applyCollapseLevel(value);
            }
          }}
          showStructureControls
          showBaselineControls={false}
          showProjectShiftControl={false}
          showHistoryControl={false}
          showExpiredToggle={false}
          showUndoControl={false}
          showDataMenuControl={false}
          showOverflowMenuControl
          showViewScaleControl
          showTaskChartToggle
        />
      </div>

      <div className="mt-0.5 flex min-w-0 flex-1 flex-col gap-3 overflow-auto px-3 md:px-4 lg:flex-row lg:overflow-hidden">
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-t-xl border-x border-t border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
              {state.status === 'loading' && !data ? (
                <div className="flex flex-1 items-center justify-center bg-white text-sm text-slate-400">
                  Загрузка...
                </div>
              ) : state.status === 'error' && !data ? (
                <div className="flex flex-1 items-center justify-center bg-white px-6">
                  <div className="max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <div>{state.error}</div>
                    <Button type="button" variant="outline" size="sm" className="mt-3 h-8 bg-white" onClick={() => { void loadOverview(false); }}>
                      <RefreshCw className="h-4 w-4" />
                      Повторить
                    </Button>
                  </div>
                </div>
              ) : !hasRenderableChart ? (
                <div className="flex flex-1 items-center justify-center bg-white px-6 text-center text-sm text-slate-500">
                  {projectCount === 0 ? 'В группе пока нет активных проектов.' : 'В проектах группы пока нет задач с датами для портфельного графика.'}
                </div>
              ) : (
                <GanttChart
                  ref={ganttRef}
                  tasks={tasks}
                  mode="gantt"
                  taskListMenuCommands={taskListMenuCommands}
                  hiddenTaskListColumns={HIDDEN_COLUMNS}
                  taskListColumnWidths={TASK_LIST_COLUMN_WIDTHS_OVERVIEW}
                  dayWidth={viewMode === 'week' ? 8 : viewMode === 'month' ? 2 : 24}
                  rowHeight={36}
                  containerHeight="calc(100dvh - 132px)"
                  showTaskList={showTaskList}
                  showChart={showChart}
                  taskListWidth={520}
                  disableTaskNameEditing
                  disableDependencyEditing
                  disableTaskDrag
                  disableConstraints
                  headerHeight={40}
                  viewMode={viewMode}
                  collapsedParentIds={collapsedParentIds}
                  onToggleCollapse={handleToggleCollapse}
                  businessDays={false}
                />
              )}
            </div>

            {(data || state.status === 'loading') && (
              <footer className="flex h-6 shrink-0 select-none items-center gap-3 border-t border-slate-200 bg-white px-3">
                <span className="font-mono text-[11px] text-slate-400">
                  Сводный график
                </span>
                {data && (
                  <>
                    <span className="font-mono text-[11px] text-slate-400">
                      {projectCount} проектов
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {sectionCount} разделов
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {formatTaskCount(sourceTaskCount)}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      Календарные дни
                    </span>
                  </>
                )}
                {state.status === 'loading' && (
                  <span className={cn('flex items-center gap-1.5 font-mono text-[11px] text-amber-600')}>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Обновляем...
                  </span>
                )}
              </footer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
