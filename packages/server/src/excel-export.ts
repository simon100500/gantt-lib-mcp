import ExcelJS from 'exceljs';
import { getPrisma } from '@gantt/mcp/prisma';
import { getProjectCalendarSettings } from '@gantt/mcp/services';
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
  ganttDayMode: 'business' | 'calendar';
  calendarDays: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }>;
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
const TITLE_ROW_INDEX = 1;
const MONTH_ROW_INDEX = 2;
const HEADER_LABEL_ROW_INDEX = 3;
const HEADER_FILL = 'FFFFFFFF';
const HEADER_FONT = 'FF1E293B';
const WEEKEND_HEADER_FONT = 'FFDC2626';
const TODAY_FILL = 'FFDC2626';
const TODAY_FONT = 'FFFFFFFF';
const TODAY_BORDER = 'FFDC2626';
const GRID_FILL = 'FFFFFFFF';
const GRID_BORDER = 'FFE2E8F0';
const WEEK_BORDER = 'FF93C5FD';
const MONTH_BORDER = 'FF64748B';
const PARENT_FILL = 'FFCBD5E1';
const DEFAULT_TASK_FILL = 'FF93C5FD';
const EMPTY_STATE_FILL = 'FFF8FAFC';
const STATIC_COLUMN_WIDTHS = [10, 44, 14, 14, 12, 8, 20];
const DAY_WIDTH = 20 / 7;
const A4_PAPER_SIZE = 9;

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

function formatMonthLabel(value: string): string {
  const date = parseIsoDate(value);
  const month = date.toLocaleDateString('ru-RU', { month: 'long' });
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${date.getUTCFullYear()}`;
}

function formatDayNumber(value: string): number {
  return Number(parseIsoDate(value).toLocaleDateString('ru-RU', { day: '2-digit' }));
}

function formatExportDate(value: Date): string {
  return value.toLocaleDateString('ru-RU');
}

function dependencyTypeLabel(type: DependencyType): string {
  if (type === 'FS') return 'ОН';
  if (type === 'SS') return 'НН';
  if (type === 'FF') return 'ОО';
  return 'НО';
}

function formatDependencyLabel(dependency: ExportDependency, outlineNumber: string | undefined): string {
  const reference = outlineNumber ?? dependency.predecessorTaskId;
  const lag = dependency.lag === 0 ? '' : dependency.lag > 0 ? `+${dependency.lag}` : `${dependency.lag}`;
  return `[${reference}]${dependencyTypeLabel(dependency.type)}${lag}`;
}

function normalizeColor(color: string | null): string {
  if (!color) return DEFAULT_TASK_FILL;
  const hex = color.trim().replace('#', '').toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(hex)) return DEFAULT_TASK_FILL;
  if (hex === '94A3B8') return PARENT_FILL;
  if (hex === 'DBEAFE' || hex === '93C5FD') return DEFAULT_TASK_FILL;
  return `FF${hex}`;
}

function buildTimelineRange(tasks: ExportTask[]): string[] {
  if (tasks.length === 0) return [];
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
    if (value === previous) return '';
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
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.name.localeCompare(right.name, 'ru');
    });
  }

  const rows: FlattenedTaskRow[] = [];
  const outlineByTaskId = new Map<string, string>();

  const visit = (parentId: string | null, depth: number, prefix: number[]) => {
    const children = childrenByParent.get(parentId) ?? [];
    for (const [index, task] of children.entries()) {
      const outline = [...prefix, index + 1].join('.');
      outlineByTaskId.set(task.id, outline);
      rows.push({
        task,
        depth,
        isParent: (childrenByParent.get(task.id)?.length ?? 0) > 0,
        outlineNumber: outline,
        linksLabel: '',
        durationDays: diffDaysInclusive(task.startDate, task.endDate),
        progressValue: typeof task.progress === 'number' ? task.progress : 0,
      });
      visit(task.id, depth + 1, [...prefix, index + 1]);
    }
  };

  visit(null, 0, []);

  for (const row of rows) {
    row.linksLabel = row.task.dependencies
      .map((dependency) => formatDependencyLabel(dependency, outlineByTaskId.get(dependency.predecessorTaskId)))
      .join(', ');
  }

  return rows;
}

function applyCellBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: 'thin', color: { argb: GRID_BORDER } },
    left: { style: 'thin', color: { argb: GRID_BORDER } },
    bottom: { style: 'thin', color: { argb: GRID_BORDER } },
    right: { style: 'thin', color: { argb: GRID_BORDER } },
  };
}

function baseAlignment(horizontal: ExcelJS.Alignment['horizontal'] = 'left'): Partial<ExcelJS.Alignment> {
  return { vertical: 'middle', horizontal, wrapText: true };
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
}

function styleTimelineCell(cell: ExcelJS.Cell, fillColor: string): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
  applyCellBorder(cell);
}

function applyTimelineSeparator(
  cell: ExcelJS.Cell,
  kind: 'day' | 'week' | 'month',
  options: { verticalLines?: boolean; todayLine?: boolean } = {},
): void {
  const verticalLines = options.verticalLines ?? true;
  const left = options.todayLine
    ? { style: 'medium' as const, color: { argb: TODAY_BORDER } }
    : !verticalLines
      ? kind === 'month'
        ? { style: 'medium' as const, color: { argb: MONTH_BORDER } }
        : kind === 'week'
          ? { style: 'thin' as const, color: { argb: WEEK_BORDER } }
          : undefined
      : kind === 'month'
        ? { style: 'medium' as const, color: { argb: MONTH_BORDER } }
        : kind === 'week'
          ? { style: 'thin' as const, color: { argb: WEEK_BORDER } }
          : { style: 'thin' as const, color: { argb: GRID_BORDER } };

  cell.border = {
    top: cell.border?.top ?? { style: 'thin', color: { argb: GRID_BORDER } },
    right: verticalLines ? (cell.border?.right ?? { style: 'thin', color: { argb: GRID_BORDER } }) : undefined,
    bottom: cell.border?.bottom ?? { style: 'thin', color: { argb: GRID_BORDER } },
    left,
  };
}

function estimateWrappedLines(value: string, columnWidth: number): number {
  if (!value.trim()) return 1;
  const safeWidth = Math.max(6, Math.floor(columnWidth * 0.82) - 1);
  const words = value.trim().split(/\s+/u);
  let lines = 1;
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
  return lines;
}

function estimateRowHeight(taskLabel: string, taskColumnWidth: number, taskDepth: number = 0): number {
  const effectiveWidth = Math.max(12, taskColumnWidth - (taskDepth * 2.5));
  const lineCount = estimateWrappedLines(taskLabel, effectiveWidth);
  return lineCount <= 1 ? 20 : 31;
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

function isWeekendFallback(dateIso: string): boolean {
  const weekday = parseIsoDate(dateIso).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function buildNonWorkingSet(
  ganttDayMode: 'business' | 'calendar',
  calendarDays: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }>,
  timelineDates: string[],
): Set<string> {
  const overrides = new Map(calendarDays.map((day) => [day.date.slice(0, 10), day.kind]));
  const result = new Set<string>();
  for (const date of timelineDates) {
    const override = overrides.get(date);
    if (override === 'non_working') {
      result.add(date);
      continue;
    }
    if (override === 'working' || override === 'shortened') {
      continue;
    }
    if (ganttDayMode === 'business' && isWeekendFallback(date)) {
      result.add(date);
    }
  }
  return result;
}

function columnNumberToName(columnNumber: number): string {
  let current = columnNumber;
  let label = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return label;
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
              depTask: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      },
    },
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const projectCalendar = await getProjectCalendarSettings(prisma, projectId);

  return {
    projectName: project.name,
    ganttDayMode: projectCalendar.ganttDayMode,
    calendarDays: projectCalendar.calendarDays,
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
  const exportDate = new Date();
  const todayIso = toIsoDate(exportDate);
  workbook.created = exportDate;

  const sheet = workbook.addWorksheet('Gantt', {
    views: [{ state: 'frozen', xSplit: STATIC_COLUMN_COUNT, ySplit: HEADER_ROW_COUNT, showGridLines: false }],
  });
  sheet.properties.defaultRowHeight = 29 / 1.333;

  const flattenedRows = buildFlattenedRows(data.tasks);
  const timelineDates = buildTimelineRange(data.tasks);
  const monthHeaders = suppressRepeatedLabels(timelineDates.map(formatMonthLabel));
  const totalColumnCount = STATIC_COLUMN_COUNT + timelineDates.length;
  const nonWorkingDates = buildNonWorkingSet(data.ganttDayMode, data.calendarDays, timelineDates);
  const approximateWidth = STATIC_COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0) + timelineDates.length * DAY_WIDTH;
  const useLandscape = approximateWidth > 170 || timelineDates.length > 32;

  sheet.pageSetup = {
    paperSize: A4_PAPER_SIZE,
    orientation: useLandscape ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: useLandscape ? 0 : 1,
    fitToHeight: useLandscape ? 1 : 0,
    horizontalCentered: false,
    verticalCentered: false,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.3,
      bottom: 0.3,
      header: 0.12,
      footer: 0.12,
    },
  };
  sheet.pageSetup.printTitlesRow = '2:3';
  sheet.headerFooter.oddFooter = `&LGetGantt.ru&CДата экспорта: ${formatExportDate(exportDate)}&RСтраница &P из &N`;

  sheet.columns = [
    { width: STATIC_COLUMN_WIDTHS[0] },
    { width: STATIC_COLUMN_WIDTHS[1] },
    { width: STATIC_COLUMN_WIDTHS[2] },
    { width: STATIC_COLUMN_WIDTHS[3] },
    { width: STATIC_COLUMN_WIDTHS[4] },
    { width: STATIC_COLUMN_WIDTHS[5] },
    { width: STATIC_COLUMN_WIDTHS[6] },
    ...timelineDates.map(() => ({ width: DAY_WIDTH })),
  ];

  const separatorKinds = timelineDates.map((date, index) => {
    const current = parseIsoDate(date);
    const previous = index > 0 ? parseIsoDate(timelineDates[index - 1]!) : null;
    if (!previous) return 'month' as const;
    if (current.getUTCMonth() !== previous.getUTCMonth() || current.getUTCFullYear() !== previous.getUTCFullYear()) {
      return 'month' as const;
    }
    if (current.getUTCDay() === 1) return 'week' as const;
    return 'day' as const;
  });

  sheet.addRow([`ГетГант / ${data.projectName}`]);
  sheet.addRow([null, null, null, null, null, null, null, ...monthHeaders.map((value) => value || null)]);
  sheet.addRow(['№', 'Задача', 'Начало', 'Оконч.', 'Длит.', '%', 'Связи', ...timelineDates.map((value) => formatDayNumber(value))]);

  const titleRow = sheet.getRow(TITLE_ROW_INDEX);
  titleRow.getCell(1).font = { bold: true, size: 12, color: { argb: HEADER_FONT } };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };

  for (let rowIndex = MONTH_ROW_INDEX; rowIndex <= HEADER_ROW_COUNT; rowIndex += 1) {
    styleHeaderRow(sheet.getRow(rowIndex));
    for (let columnIndex = 1; columnIndex <= STATIC_COLUMN_COUNT; columnIndex += 1) {
      const cell = sheet.getRow(rowIndex).getCell(columnIndex);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.font = { bold: true, color: { argb: HEADER_FONT } };
      cell.alignment = { vertical: 'middle', horizontal: rowIndex === HEADER_LABEL_ROW_INDEX ? 'center' : 'left' };
    }

    for (let columnIndex = STATIC_COLUMN_COUNT + 1; columnIndex <= totalColumnCount; columnIndex += 1) {
      const cell = sheet.getRow(rowIndex).getCell(columnIndex);
      const timelineDate = timelineDates[columnIndex - STATIC_COLUMN_COUNT - 1];
      const isToday = timelineDate === todayIso;
      const separatorKind = separatorKinds[columnIndex - STATIC_COLUMN_COUNT - 1] ?? 'day';
      const headerSeparatorKind = rowIndex === MONTH_ROW_INDEX && separatorKind === 'week' ? 'day' : separatorKind;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.font = {
        bold: true,
        color: {
          argb: rowIndex === HEADER_LABEL_ROW_INDEX && isToday
            ? TODAY_FONT
            : rowIndex === HEADER_LABEL_ROW_INDEX && timelineDate && nonWorkingDates.has(timelineDate)
              ? WEEKEND_HEADER_FONT
              : HEADER_FONT,
        },
      };
      if (rowIndex === HEADER_LABEL_ROW_INDEX && isToday) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TODAY_FILL } };
      }
      cell.alignment = rowIndex === MONTH_ROW_INDEX
        ? { vertical: 'middle', horizontal: 'left', wrapText: false }
        : { vertical: 'middle', horizontal: 'center' };
      applyCellBorder(cell);
      applyTimelineSeparator(cell, headerSeparatorKind, {
        verticalLines: false,
        todayLine: isToday,
      });
    }
  }

  if (flattenedRows.length === 0) {
    const emptyRow = sheet.addRow(['', 'Нет задач']);
    for (let columnIndex = 1; columnIndex <= STATIC_COLUMN_COUNT; columnIndex += 1) {
      const cell = emptyRow.getCell(columnIndex);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMPTY_STATE_FILL } };
      cell.alignment = baseAlignment(columnIndex === 2 ? 'center' : 'left');
      applyCellBorder(cell);
    }
    emptyRow.getCell(2).font = { italic: true, color: { argb: HEADER_FONT } };
    setRowHeightFromContent(emptyRow, 'Нет задач', STATIC_COLUMN_WIDTHS[1], 0);
    sheet.pageSetup.printArea = `A1:${columnNumberToName(Math.max(STATIC_COLUMN_COUNT, totalColumnCount))}${emptyRow.number}`;
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
      cell.alignment = columnIndex > STATIC_COLUMN_COUNT ? baseAlignment('center') : cell.alignment ?? baseAlignment('left');
      if (columnIndex > STATIC_COLUMN_COUNT) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRID_FILL } };
        applyTimelineSeparator(cell, separatorKinds[columnIndex - STATIC_COLUMN_COUNT - 1] ?? 'day', {
          verticalLines: true,
          todayLine: timelineDates[columnIndex - STATIC_COLUMN_COUNT - 1] === todayIso,
        });
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
        applyTimelineSeparator(row.getCell(columnIndex), separatorKinds[columnIndex - STATIC_COLUMN_COUNT - 1] ?? 'day', {
          verticalLines: true,
          todayLine: timelineDates[columnIndex - STATIC_COLUMN_COUNT - 1] === todayIso,
        });
      }
    }
  }

  sheet.pageSetup.printArea = `A1:${columnNumberToName(totalColumnCount)}${sheet.rowCount}`;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
