import ExcelJS from 'exceljs';
import { getPrisma } from '@gantt/mcp/prisma';
import type { DependencyType } from '@gantt/mcp/types';

type ExportDependency = {
  predecessorTaskId: string;
  predecessorTaskName: string | null;
  type: DependencyType;
  lag: number;
};

type ExportTask = {
  id: string;
  name: string;
  parentId: string | null;
  startDate: string;
  endDate: string;
  sortOrder: number;
  color: string | null;
  dependencies: ExportDependency[];
};

export type ProjectExcelExportData = {
  projectName: string;
  tasks: ExportTask[];
};

type FlattenedTaskRow = {
  task: ExportTask;
  depth: number;
  isParent: boolean;
  linksLabel: string;
  durationDays: number;
};

const STATIC_COLUMN_COUNT = 5;
const HEADER_FILL = 'FFEEF2FF';
const HEADER_FONT = 'FF1E293B';
const GRID_FILL = 'FFF8FAFC';
const GRID_BORDER = 'FFE2E8F0';
const PARENT_FILL = 'FFE2E8F0';
const DEFAULT_TASK_FILL = 'FFDBEAFE';
const EMPTY_STATE_FILL = 'FFF8FAFC';

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

function diffDaysInclusive(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso).getTime();
  const end = parseIsoDate(endIso).getTime();
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

function formatDateLabel(value: string): string {
  const date = parseIsoDate(value);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatDependencyLabel(dependency: ExportDependency): string {
  const title = dependency.predecessorTaskName?.trim() || dependency.predecessorTaskId;
  const lag = dependency.lag === 0
    ? ''
    : dependency.lag > 0
      ? `+${dependency.lag}`
      : `${dependency.lag}`;
  return `${title} (${dependency.type}${lag})`;
}

function normalizeColor(color: string | null): string {
  if (!color) {
    return DEFAULT_TASK_FILL;
  }

  const hex = color.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return DEFAULT_TASK_FILL;
  }

  return `FF${hex.toUpperCase()}`;
}

function buildFlattenedRows(tasks: ExportTask[]): FlattenedTaskRow[] {
  const childrenByParent = new Map<string | null, ExportTask[]>();

  for (const task of tasks) {
    const key = task.parentId;
    const bucket = childrenByParent.get(key) ?? [];
    bucket.push(task);
    childrenByParent.set(key, bucket);
  }

  for (const bucket of childrenByParent.values()) {
    bucket.sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.name.localeCompare(right.name, 'ru');
    });
  }

  const rows: FlattenedTaskRow[] = [];

  const visit = (parentId: string | null, depth: number) => {
    const children = childrenByParent.get(parentId) ?? [];
    for (const task of children) {
      rows.push({
        task,
        depth,
        isParent: (childrenByParent.get(task.id)?.length ?? 0) > 0,
        linksLabel: task.dependencies.map(formatDependencyLabel).join(', '),
        durationDays: diffDaysInclusive(task.startDate, task.endDate),
      });
      visit(task.id, depth + 1);
    }
  };

  visit(null, 0);
  return rows;
}

function buildTimelineRange(tasks: ExportTask[]): string[] {
  if (tasks.length === 0) {
    return [];
  }

  const minDate = tasks.reduce((min, task) => task.startDate < min ? task.startDate : min, tasks[0]!.startDate);
  const maxDate = tasks.reduce((max, task) => task.endDate > max ? task.endDate : max, tasks[0]!.endDate);
  const dates: string[] = [];
  const cursor = parseIsoDate(minDate);
  const end = parseIsoDate(maxDate);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function applyCellBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: GRID_BORDER } },
    left: { style: 'thin', color: { argb: GRID_BORDER } },
    bottom: { style: 'thin', color: { argb: GRID_BORDER } },
    right: { style: 'thin', color: { argb: GRID_BORDER } },
  };
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL },
    };
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    applyCellBorder(cell);
  });
}

function styleTimelineCell(cell: ExcelJS.Cell, fillColor: string) {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: fillColor },
  };
  applyCellBorder(cell);
}

export async function loadProjectExcelExportData(projectId: string): Promise<ProjectExcelExportData> {
  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      tasks: {
        include: {
          dependencies: {
            include: {
              depTask: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      },
    },
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  return {
    projectName: project.name,
    tasks: project.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      parentId: task.parentId,
      startDate: toIsoDate(task.startDate),
      endDate: toIsoDate(task.endDate),
      sortOrder: task.sortOrder,
      color: task.color,
      dependencies: task.dependencies.map((dependency) => ({
        predecessorTaskId: dependency.depTaskId,
        predecessorTaskName: dependency.depTask?.name ?? null,
        type: dependency.type,
        lag: Math.trunc(dependency.lag),
      })),
    })),
  };
}

export async function buildProjectExcelExportBuffer(data: ProjectExcelExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GetGantt';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Gantt', {
    views: [{ state: 'frozen', xSplit: STATIC_COLUMN_COUNT, ySplit: 1 }],
  });

  const flattenedRows = buildFlattenedRows(data.tasks);
  const timelineDates = buildTimelineRange(data.tasks);
  const headers = ['Задача', 'Связи', 'Начало', 'Окончание', 'Длительность', ...timelineDates.map(formatDateLabel)];
  sheet.addRow(headers);
  styleHeaderRow(sheet.getRow(1));

  sheet.columns = [
    { width: 36 },
    { width: 30 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    ...timelineDates.map(() => ({ width: 4 })),
  ];

  if (flattenedRows.length === 0) {
    const emptyRow = sheet.addRow(['Нет задач']);
    sheet.mergeCells(emptyRow.number, 1, emptyRow.number, STATIC_COLUMN_COUNT);
    const cell = emptyRow.getCell(1);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: EMPTY_STATE_FILL },
    };
    cell.font = { italic: true, color: { argb: HEADER_FONT } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    applyCellBorder(cell);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  const timelineIndexByDate = new Map(timelineDates.map((date, index) => [date, STATIC_COLUMN_COUNT + 1 + index]));

  for (const rowData of flattenedRows) {
    const row = sheet.addRow([
      rowData.task.name,
      rowData.linksLabel,
      rowData.task.startDate,
      rowData.task.endDate,
      rowData.durationDays,
    ]);
    row.height = 20;

    const taskCell = row.getCell(1);
    taskCell.alignment = { vertical: 'middle', indent: rowData.depth };
    if (rowData.isParent) {
      taskCell.font = { bold: true, color: { argb: HEADER_FONT } };
    }

    row.getCell(2).alignment = { vertical: 'middle', wrapText: true };
    row.getCell(3).numFmt = 'dd.mm.yyyy';
    row.getCell(4).numFmt = 'dd.mm.yyyy';
    row.getCell(3).value = parseIsoDate(rowData.task.startDate);
    row.getCell(4).value = parseIsoDate(rowData.task.endDate);

    for (let columnIndex = 1; columnIndex <= headers.length; columnIndex += 1) {
      const cell = row.getCell(columnIndex);
      applyCellBorder(cell);
      if (columnIndex > STATIC_COLUMN_COUNT) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: GRID_FILL },
        };
      }
    }

    if (rowData.isParent) {
      for (let columnIndex = 1; columnIndex <= STATIC_COLUMN_COUNT; columnIndex += 1) {
        styleTimelineCell(row.getCell(columnIndex), PARENT_FILL);
      }
    }

    const startColumn = timelineIndexByDate.get(rowData.task.startDate);
    const endColumn = timelineIndexByDate.get(rowData.task.endDate);
    if (startColumn && endColumn) {
      const fillColor = rowData.isParent ? PARENT_FILL : normalizeColor(rowData.task.color);
      for (let columnIndex = startColumn; columnIndex <= endColumn; columnIndex += 1) {
        styleTimelineCell(row.getCell(columnIndex), fillColor);
      }
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
