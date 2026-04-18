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
  progress?: number;
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
  outlineNumber: string;
  linksLabel: string;
  durationDays: number;
  progressValue: number;
};

const STATIC_COLUMN_COUNT = 7;
const HEADER_ROW_COUNT = 3;
const HEADER_FILL = 'FFFFFFFF';
const HEADER_FONT = 'FF1E293B';
const GRID_FILL = 'FFFFFFFF';
const GRID_BORDER = 'FFE2E8F0';
const WEEK_BORDER = 'FFCBD5E1';
const MONTH_BORDER = 'FF64748B';
const PARENT_FILL = 'FFCBD5E1';
const DEFAULT_TASK_FILL = 'FF93C5FD';
const EMPTY_STATE_FILL = 'FFF8FAFC';
const STATIC_COLUMN_WIDTHS = [10, 36, 14, 14, 12, 12, 34];

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

function formatYearLabel(value: string): string {
  return String(parseIsoDate(value).getUTCFullYear());
}

function formatMonthLabel(value: string): string {
  const formatted = parseIsoDate(value).toLocaleDateString('ru-RU', { month: 'long' });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatDayLabel(value: string): string {
  return parseIsoDate(value).toLocaleDateString('ru-RU', { day: '2-digit' });
}

function dependencyTypeLabel(type: DependencyType): string {
  if (type === 'FS') return 'ОН';
  if (type === 'SS') return 'НН';
  if (type === 'FF') return 'ОО';
  return 'НО';
}

function formatDependencyLabel(dependency: ExportDependency, outlineNumber: string | undefined): string {
  const reference = outlineNumber ?? dependency.predecessorTaskId;
  const lag = dependency.lag === 0
    ? ''
    : dependency.lag > 0
      ? `+${dependency.lag}`
      : `${dependency.lag}`;
  return `[${reference}]${dependencyTypeLabel(dependency.type)}${lag}`;
}

function normalizeColor(color: string | null): string {
  if (!color) {
    return DEFAULT_TASK_FILL;
  }

  const hex = color.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return DEFAULT_TASK_FILL;
  }

  const normalized = hex.toUpperCase();
  if (normalized === '94A3B8') {
    return PARENT_FILL;
  }
  if (normalized === 'DBEAFE' || normalized === '93C5FD') {
    return DEFAULT_TASK_FILL;
  }

  return `FF${normalized}`;
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

function suppressRepeatedLabels(values: string[]): string[] {
  let previous: string | null = null;
  return values.map((value) => {
    if (value === previous) {
      return '';
    }
    previous = value;
    return value;
  });
}

function buildFlattenedRows(tasks: ExportTask[]): FlattenedTaskRow[] {
  const childrenByParent = new Map<string | null, ExportTask[]>();
  for (const task of tasks) {
    const bucket = childrenByParent.get(task.parentId) ?? [];
    bucket.push(task);
    childrenByParent.set(task.parentId, bucket);
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
  const outlineNumberByTaskId = new Map<string, string>();

  const visit = (parentId: string | null, depth: number, prefix: number[]) => {
    const children = childrenByParent.get(parentId) ?? [];
    for (const [index, task] of children.entries()) {
      const currentPrefix = [...prefix, index + 1];
      const outlineNumber = currentPrefix.join('.');
      outlineNumberByTaskId.set(task.id, outlineNumber);
      rows.push({
        task,
        depth,
        isParent: (childrenByParent.get(task.id)?.length ?? 0) > 0,
        outlineNumber,
        linksLabel: '',
        durationDays: diffDaysInclusive(task.startDate, task.endDate),
        progressValue: typeof task.progress === 'number' ? task.progress : 0,
      });
      visit(task.id, depth + 1, currentPrefix);
    }
  };

  visit(null, 0, []);

  for (const row of rows) {
    row.linksLabel = row.task.dependencies
      .map((dependency) => formatDependencyLabel(dependency, outlineNumberByTaskId.get(dependency.predecessorTaskId)))
      .join(', ');
  }

  return rows;
}

function applyCellBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: GRID_BORDER } },
    left: { style: 'thin', color: { argb: GRID_BORDER } },
    bottom: { style: 'thin', color: { argb: GRID_BORDER } },
    right: { style: 'thin', color: { argb: GRID_BORDER } },
  };
}

function baseAlignment(horizontal: ExcelJS.Alignment['horizontal'] = 'left'): Partial<ExcelJS.Alignment> {
  return {
    vertical: 'middle',
    horizontal,
    wrapText: true,
  };
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL },
    };
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
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

function applyTimelineSeparator(cell: ExcelJS.Cell, kind: 'day' | 'week' | 'month') {
  const left = kind === 'month'
    ? { style: 'medium' as const, color: { argb: MONTH_BORDER } }
    : kind === 'week'
      ? { style: 'thin' as const, color: { argb: WEEK_BORDER } }
      : { style: 'thin' as const, color: { argb: GRID_BORDER } };

  cell.border = {
    top: cell.border?.top ?? { style: 'thin', color: { argb: GRID_BORDER } },
    right: cell.border?.right ?? { style: 'thin', color: { argb: GRID_BORDER } },
    bottom: cell.border?.bottom ?? { style: 'thin', color: { argb: GRID_BORDER } },
    left,
  };
}

function estimateWrappedLines(value: string, columnWidth: number): number {
  if (!value.trim()) {
    return 1;
  }

  const safeWidth = Math.max(6, Math.floor(columnWidth * 0.82) - 1);
  const paragraphs = value.split(/\r?\n/u);
  let lines = 0;

  for (const paragraph of paragraphs) {
    const text = paragraph.trim();
    if (!text) {
      lines += 1;
      continue;
    }

    const words = text.split(/\s+/u);
    let currentLength = 0;
    for (const word of words) {
      const nextLength = currentLength === 0 ? word.length : currentLength + 1 + word.length;
      if (nextLength > safeWidth) {
        lines += 1;
        currentLength = word.length;
      } else {
        currentLength = nextLength;
      }
    }
    lines += 1;
  }

  return Math.max(lines, 1);
}

function estimateRowHeight(taskLabel: string, taskColumnWidth: number, taskDepth: number = 0): number {
  const effectiveWidth = Math.max(12, taskColumnWidth - (taskDepth * 2.5));
  const lineCount = estimateWrappedLines(taskLabel, effectiveWidth);
  if (lineCount <= 1) {
    return 20;
  }
  return 31;
}

function setRowHeightFromContent(row: ExcelJS.Row, taskLabel: string, taskColumnWidth: number, taskDepth: number = 0): void {
  row.height = estimateRowHeight(taskLabel, taskColumnWidth, taskDepth);
  row.eachCell((cell) => {
    cell.alignment = {
      ...(cell.alignment ?? {}),
      shrinkToFit: false,
      wrapText: true,
      vertical: 'middle',
    };
  });
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
      progress: task.progress,
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
    views: [{ state: 'frozen', xSplit: STATIC_COLUMN_COUNT, ySplit: HEADER_ROW_COUNT, showGridLines: false }],
  });
  sheet.properties.defaultRowHeight = 29 / 1.333;

  const flattenedRows = buildFlattenedRows(data.tasks);
  const timelineDates = buildTimelineRange(data.tasks);
  const yearHeaders = suppressRepeatedLabels(timelineDates.map(formatYearLabel));
  const monthHeaders = suppressRepeatedLabels(timelineDates.map(formatMonthLabel));
  const totalColumnCount = STATIC_COLUMN_COUNT + timelineDates.length;

  sheet.columns = [
    { width: STATIC_COLUMN_WIDTHS[0] },
    { width: STATIC_COLUMN_WIDTHS[1] },
    { width: STATIC_COLUMN_WIDTHS[2] },
    { width: STATIC_COLUMN_WIDTHS[3] },
    { width: STATIC_COLUMN_WIDTHS[4] },
    { width: STATIC_COLUMN_WIDTHS[5] },
    { width: STATIC_COLUMN_WIDTHS[6] },
    ...timelineDates.map(() => ({ width: 24 / 7 })),
  ];

  const separatorKinds = timelineDates.map((date, index) => {
    const current = parseIsoDate(date);
    const previous = index > 0 ? parseIsoDate(timelineDates[index - 1]!) : null;
    if (!previous) {
      return 'month' as const;
    }
    if (current.getUTCMonth() !== previous.getUTCMonth() || current.getUTCFullYear() !== previous.getUTCFullYear()) {
      return 'month' as const;
    }
    if (current.getUTCDay() === 1) {
      return 'week' as const;
    }
    return 'day' as const;
  });

  sheet.addRow([null, null, null, null, null, null, null, ...yearHeaders.map((value) => value || null)]);
  sheet.addRow([null, null, null, null, null, null, null, ...monthHeaders.map((value) => value || null)]);
  sheet.addRow(['№', 'Задача', 'Начало', 'Окончание', 'Длительность', 'Процент', 'Связи', ...timelineDates.map((value) => Number(formatDayLabel(value)))]);

  for (let rowIndex = 1; rowIndex <= HEADER_ROW_COUNT; rowIndex += 1) {
    styleHeaderRow(sheet.getRow(rowIndex));
    for (let columnIndex = 1; columnIndex <= STATIC_COLUMN_COUNT; columnIndex += 1) {
      const cell = sheet.getRow(rowIndex).getCell(columnIndex);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: HEADER_FILL },
      };
      cell.font = { bold: true, color: { argb: HEADER_FONT } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
    for (let columnIndex = STATIC_COLUMN_COUNT + 1; columnIndex <= totalColumnCount; columnIndex += 1) {
      const cell = sheet.getRow(rowIndex).getCell(columnIndex);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: HEADER_FILL },
      };
      cell.font = { bold: true, color: { argb: HEADER_FONT } };
      cell.alignment = rowIndex < HEADER_ROW_COUNT
        ? { vertical: 'middle', horizontal: 'left', wrapText: false }
        : { vertical: 'middle', horizontal: 'center' };
      applyCellBorder(cell);
      applyTimelineSeparator(cell, separatorKinds[columnIndex - STATIC_COLUMN_COUNT - 1] ?? 'day');
    }
  }

  if (flattenedRows.length === 0) {
    const emptyRow = sheet.addRow(['', 'Нет задач']);
    for (let columnIndex = 1; columnIndex <= STATIC_COLUMN_COUNT; columnIndex += 1) {
      const cell = emptyRow.getCell(columnIndex);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: EMPTY_STATE_FILL },
      };
      cell.alignment = baseAlignment(columnIndex === 2 ? 'center' : 'left');
      applyCellBorder(cell);
    }
    emptyRow.getCell(2).font = { italic: true, color: { argb: HEADER_FONT } };
    setRowHeightFromContent(emptyRow, 'Нет задач', STATIC_COLUMN_WIDTHS[1], 0);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  const timelineIndexByDate = new Map(timelineDates.map((date, index) => [date, STATIC_COLUMN_COUNT + 1 + index]));

  for (const rowData of flattenedRows) {
    const row = sheet.addRow([
      rowData.outlineNumber,
      rowData.task.name,
      rowData.task.startDate,
      rowData.task.endDate,
      rowData.durationDays,
      rowData.progressValue,
      rowData.linksLabel,
    ]);
    setRowHeightFromContent(row, rowData.task.name, STATIC_COLUMN_WIDTHS[1], rowData.depth);

    row.getCell(1).alignment = baseAlignment('center');
    row.getCell(2).alignment = { ...baseAlignment('left'), indent: rowData.depth };
    row.getCell(3).alignment = baseAlignment('center');
    row.getCell(4).alignment = baseAlignment('center');
    row.getCell(5).alignment = baseAlignment('center');
    row.getCell(6).alignment = baseAlignment('center');
    row.getCell(7).alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };

    if (rowData.isParent) {
      row.getCell(2).font = { bold: true, color: { argb: HEADER_FONT } };
    }

    row.getCell(3).numFmt = 'dd.mm.yyyy';
    row.getCell(4).numFmt = 'dd.mm.yyyy';
    row.getCell(3).value = parseIsoDate(rowData.task.startDate);
    row.getCell(4).value = parseIsoDate(rowData.task.endDate);
    row.getCell(6).numFmt = '0%';
    row.getCell(6).value = rowData.progressValue;

    for (let columnIndex = 1; columnIndex <= totalColumnCount; columnIndex += 1) {
      const cell = row.getCell(columnIndex);
      applyCellBorder(cell);
      cell.alignment = columnIndex > STATIC_COLUMN_COUNT
        ? baseAlignment('center')
        : cell.alignment ?? baseAlignment('left');
      if (columnIndex > STATIC_COLUMN_COUNT) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: GRID_FILL },
        };
        applyTimelineSeparator(cell, separatorKinds[columnIndex - STATIC_COLUMN_COUNT - 1] ?? 'day');
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
        applyTimelineSeparator(row.getCell(columnIndex), separatorKinds[columnIndex - STATIC_COLUMN_COUNT - 1] ?? 'day');
      }
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
