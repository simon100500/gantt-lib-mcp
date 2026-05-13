import type { TaskListColumnId, TaskListColumnWidthMap } from 'gantt-lib';

import type { ToolbarTaskListColumnRow } from '../components/layout/Toolbar.tsx';

export const TASK_LIST_COLUMN_ROWS: ToolbarTaskListColumnRow[] = [
  { id: 'number', label: 'Номер' },
  { id: 'name', label: 'Имя' },
  { id: 'startDate', label: 'Начало' },
  { id: 'endDate', label: 'Окончание' },
  { id: 'duration', label: 'Длительность' },
  { id: 'work-volume', label: 'Объём' },
  { id: 'completed-volume', label: 'Выполнено' },
  { id: 'status', label: 'Статус' },
  { id: 'progress', label: '% выполнения' },
  { id: 'assigned-resources', label: 'Ресурсы' },
  { id: 'dependencies', label: 'Связи' },
];

export const DEFAULT_HIDDEN_TASK_LIST_COLUMNS = [
  'work-volume',
  'completed-volume',
  'status',
  'assigned-resources',
] as const;

export const KNOWN_TASK_LIST_COLUMN_IDS = new Set(TASK_LIST_COLUMN_ROWS.map((column) => column.id));

export const TASK_LIST_COLUMN_WIDTHS: TaskListColumnWidthMap = {
  number: 40,
  name: 200,
  startDate: 90,
  endDate: 90,
  duration: 60,
  progress: 50,
  'work-volume': 96,
  'completed-volume': 82,
  status: 108,
  dependencies: 128,
  'assigned-resources': 132,
};

export function normalizeHiddenTaskListColumns(value: readonly string[] | null | undefined): TaskListColumnId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((columnId) => (
    typeof columnId === 'string' && KNOWN_TASK_LIST_COLUMN_IDS.has(columnId)
      ? [columnId as TaskListColumnId]
      : []
  ));
}

export function resolveHiddenTaskListColumns(input: {
  userOverrideInitialized: boolean;
  userHiddenTaskListColumns?: readonly string[] | null;
  projectHiddenTaskListColumnsDefault?: readonly string[] | null;
}): TaskListColumnId[] {
  if (input.userOverrideInitialized) {
    return normalizeHiddenTaskListColumns(input.userHiddenTaskListColumns);
  }

  if (Array.isArray(input.projectHiddenTaskListColumnsDefault)) {
    return normalizeHiddenTaskListColumns(input.projectHiddenTaskListColumnsDefault);
  }

  return normalizeHiddenTaskListColumns(DEFAULT_HIDDEN_TASK_LIST_COLUMNS);
}
