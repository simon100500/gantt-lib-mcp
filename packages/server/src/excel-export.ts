import ExcelJS from 'exceljs';
import { getPrisma } from '@gantt/runtime-core/prisma';
import { getProjectCalendarSettings } from '@gantt/mcp/services';
import type { CalendarWeeklyPattern, DependencyType } from '@gantt/mcp/types';

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
  workVolume?: number | null;
  workUnit?: string | null;
  completedVolume?: number;
  progressEntries?: Array<{ entryDate: string; amount: number }>;
  dependencies: ExportDependency[];
};

export type ProjectExcelExportMode = 'gantt' | 'plan-fact';

export type ProjectExcelExportData = {
  projectName: string;
  ganttDayMode: 'business' | 'calendar';
  calendarWeeklyPattern: CalendarWeeklyPattern;
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
const PLAN_FACT_PAIR_BORDER = 'FFCCCCCC';
const PARENT_TASKLIST_FILLS = ['FF64748B', 'FF94A3B8', 'FFCBD5E1'] as const;
const PARENT_TIMELINE_FILLS = ['FF475569', 'FF6B7280', 'FF94A3B8'] as const;
const GROUP_SEPARATOR_BORDER = 'FF4B5563';
const DEFAULT_TASK_FILL = 'FF93C5FD';
const EMPTY_STATE_FILL = 'FFF8FAFC';
const STATIC_COLUMN_WIDTHS = [8, 44, 14, 14, 12, 8, 20];
const DAY_WIDTH = 21 / 7;
const PLAN_FACT_DAY_WIDTH = 28 / 7;
const A4_PAPER_SIZE = 9;
const GETGANTT_THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="GetGantt Theme">
  <a:themeElements>
    <a:clrScheme name="GetGantt">
      <a:dk1><a:srgbClr val="1E293B"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="475569"/></a:dk2>
      <a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="64748B"/></a:accent1>
      <a:accent2><a:srgbClr val="2563EB"/></a:accent2>
      <a:accent3><a:srgbClr val="DC2626"/></a:accent3>
      <a:accent4><a:srgbClr val="22C55E"/></a:accent4>
      <a:accent5><a:srgbClr val="475569"/></a:accent5>
      <a:accent6><a:srgbClr val="CBD5E1"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink>
      <a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont><a:latin typeface="Cambria"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="35000"><a:schemeClr val="phClr"><a:tint val="37000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="100000"/><a:shade val="100000"/><a:satMod val="130000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="50000"/><a:shade val="100000"/><a:satMod val="350000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"><a:shade val="95000"/><a:satMod val="105000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>
        <a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>
        <a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="40000"><a:schemeClr val="phClr"><a:tint val="45000"/><a:shade val="99000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="20000"/><a:satMod val="255000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="-80000" r="50000" b="180000"/></a:path></a:gradFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/><a:satMod val="200000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>`;

const THEME = {
  light1: 0,
  dark1: 1,
  light2: 2,
  dark2: 3,
  accent1: 4,
  accent2: 5,
} as const;

type ThemeColor = Partial<ExcelJS.Color> & { tint?: number };
type AccentVariant = 'base' | 'lighter80' | 'lighter60' | 'lighter40' | 'darker25' | 'darker50';

const ACCENT_TINT = {
  base: undefined,
  lighter80: 0.7999816888943144,
  lighter60: 0.5999938962981048,
  lighter40: 0.3999755851924192,
  darker25: -0.249977111117893,
  darker50: -0.499984740745262,
} as const;

function themeColor(theme: number, tint?: number): ThemeColor {
  return tint === undefined ? { theme } : { theme, tint };
}

function solidFill(color: Partial<ExcelJS.Color>): ExcelJS.FillPattern {
  return { type: 'pattern', pattern: 'solid', fgColor: color };
}

function accentColor(accent: 1 | 2, variant: AccentVariant = 'base'): ThemeColor {
  return themeColor(accent === 1 ? THEME.accent1 : THEME.accent2, ACCENT_TINT[variant]);
}

function accentFill(accent: 1 | 2, variant: AccentVariant = 'base'): ExcelJS.FillPattern {
  return solidFill(accentColor(accent, variant));
}

function themeFillForArgb(argb: string): ExcelJS.FillPattern | null {
  switch (argb) {
    case 'FF64748B':
      return accentFill(1);
    case 'FF94A3B8':
      return accentFill(1, 'lighter40');
    case 'FFCBD5E1':
      return accentFill(1, 'lighter80');
    case 'FF475569':
      return accentFill(1, 'darker25');
    case 'FF6B7280':
      return accentFill(1, 'darker50');
    case 'FF2563EB':
      return accentFill(2);
    case 'FF93C5FD':
      return accentFill(2, 'lighter60');
    default:
      return null;
  }
}

function boxBorder(style: ExcelJS.BorderStyle, color: Partial<ExcelJS.Color>): Partial<ExcelJS.Borders> {
  return {
    top: { style, color },
    left: { style, color },
    bottom: { style, color },
    right: { style, color },
  };
}

function cloneStyle(style: Partial<ExcelJS.Style>): Partial<ExcelJS.Style> {
  return {
    ...style,
    font: style.font ? { ...style.font } : undefined,
    alignment: style.alignment ? { ...style.alignment } : undefined,
    border: style.border
      ? {
        top: style.border.top ? { ...style.border.top } : undefined,
        left: style.border.left ? { ...style.border.left } : undefined,
        bottom: style.border.bottom ? { ...style.border.bottom } : undefined,
        right: style.border.right ? { ...style.border.right } : undefined,
      }
      : undefined,
    fill: style.fill
      ? {
        ...style.fill,
        fgColor: 'fgColor' in style.fill && style.fill.fgColor ? { ...style.fill.fgColor } : undefined,
        bgColor: 'bgColor' in style.fill && style.fill.bgColor ? { ...style.fill.bgColor } : undefined,
      } as ExcelJS.Fill
      : undefined,
  };
}

function mergeStyle(base: Partial<ExcelJS.Style>, extra: Partial<ExcelJS.Style>): Partial<ExcelJS.Style> {
  return {
    ...cloneStyle(base),
    ...cloneStyle(extra),
  };
}

function createWorkbookStyles() {
  const textPrimary = themeColor(THEME.dark1);
  const sheetBase = themeColor(THEME.light1);
  const gridBorder = { argb: GRID_BORDER };
  const monthBorder = accentColor(1);
  const weekBorder = { argb: WEEK_BORDER };
  const separatorBorder = { argb: GROUP_SEPARATOR_BORDER };

  const alignLeft: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'left', wrapText: true };
  const alignCenter: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'center', wrapText: true };
  const alignHeaderLeft: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'left', wrapText: false };
  const alignHeaderCenter: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'center' };

  const borderGrid = boxBorder('thin', gridBorder);
  const baseHeaderFont: Partial<ExcelJS.Font> = { bold: true, color: textPrimary };
  const headerFill = solidFill(sheetBase);
  const headerLevel2Fill = solidFill(sheetBase);
  const headerLevel3Fill = solidFill(sheetBase);
  const timelineBaseFill = solidFill(sheetBase);

  const parentTasklistPalette = [
    accentFill(1, 'lighter60'),
    accentFill(1, 'lighter80'),
    accentFill(1, 'lighter80'),
  ] as const;
  const parentTimelinePalette = [
    accentFill(1, 'darker25'),
    accentFill(1, 'lighter40'),
    accentFill(1, 'lighter60'),
  ] as const;
  const taskTimelinePalette = {
    default: accentFill(2, 'lighter40'),
    strong: accentFill(2, 'lighter60'),
  } as const;

  return {
    colors: {
      gridBorder,
      monthBorder,
      weekBorder,
      separatorBorder,
      textPrimary,
      weekendHeader: { argb: WEEKEND_HEADER_FONT },
      today: { argb: TODAY_FILL },
      todayFont: themeColor(THEME.light1),
    },
    alignments: {
      left: alignLeft,
      center: alignCenter,
      headerLeft: alignHeaderLeft,
      headerCenter: alignHeaderCenter,
    },
    styles: {
      headerStatic: { fill: headerFill, font: baseHeaderFont, alignment: alignHeaderCenter },
      headerTimeline: { fill: headerLevel3Fill, font: baseHeaderFont, alignment: alignHeaderCenter, border: borderGrid },
      headerTimelineLevel2: { fill: headerLevel2Fill, font: baseHeaderFont, alignment: alignHeaderCenter, border: borderGrid },
      title: {
        font: { bold: true, size: 12, color: textPrimary },
        alignment: { vertical: 'middle', horizontal: 'left', wrapText: false } as Partial<ExcelJS.Alignment>,
      },
      emptyState: { fill: solidFill(themeColor(THEME.light2)), border: borderGrid },
      timelineBase: { fill: timelineBaseFill, border: borderGrid, alignment: alignCenter },
      parentTasklist: parentTasklistPalette,
      parentTimeline: parentTimelinePalette,
      taskTimeline: taskTimelinePalette,
    },
  };
}

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
  if (hex === 'DBEAFE' || hex === '93C5FD') return DEFAULT_TASK_FILL;
  return `FF${hex}`;
}

function parentTasklistFill(depth: number): string {
  return PARENT_TASKLIST_FILLS[Math.min(depth, PARENT_TASKLIST_FILLS.length - 1)]!;
}

function parentTimelineFill(depth: number): string {
  return PARENT_TIMELINE_FILLS[Math.min(depth, PARENT_TIMELINE_FILLS.length - 1)]!;
}

function normalizeProgressValue(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  if (progress <= 0) return 0;
  if (progress <= 1) return progress;
  return Math.min(progress / 100, 1);
}

function buildDateKeysInRange(startIso: string, endIso: string): string[] {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  const cursor = start.getTime() <= end.getTime() ? start : end;
  const last = start.getTime() <= end.getTime() ? end : start;
  const dates: string[] = [];

  while (cursor.getTime() <= last.getTime()) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function buildPlanByDate(task: ExportTask, parentTaskIds: Set<string>): Record<string, number> | undefined {
  if (parentTaskIds.has(task.id) || !task.workVolume || task.workVolume <= 0) {
    return undefined;
  }

  const dateKeys = buildDateKeysInRange(task.startDate, task.endDate);
  if (dateKeys.length === 0) {
    return undefined;
  }

  const dailyValue = task.workVolume / dateKeys.length;
  return Object.fromEntries(dateKeys.map((dateKey) => [dateKey, Number(dailyValue.toFixed(6))]));
}

function buildFactByDate(task: ExportTask): Record<string, number> | undefined {
  const values: Record<string, number> = {};

  for (const entry of task.progressEntries ?? []) {
    if (!entry.entryDate || !Number.isFinite(entry.amount)) {
      continue;
    }
    values[entry.entryDate] = (values[entry.entryDate] ?? 0) + entry.amount;
  }

  return Object.keys(values).length > 0 ? values : undefined;
}

function getFactDateKeys(factByDate: Record<string, number> | undefined): string[] {
  return Object.keys(factByDate ?? {})
    .filter((dateKey) => Number.isFinite(factByDate?.[dateKey]))
    .sort((left, right) => left.localeCompare(right));
}

function getFactSummary(task: ExportTask, factByDate: Record<string, number> | undefined): {
  total: number | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  percent: number | null;
  isComplete: boolean;
} {
  const factEntries = Object.entries(factByDate ?? {}).filter(([, value]) => Number.isFinite(value));
  const factTotal = factEntries.reduce((sum, [, value]) => sum + value, 0);
  const factDateKeys = getFactDateKeys(factByDate);
  const planTotal = task.workVolume ?? null;
  const percent = planTotal && planTotal > 0 ? factTotal / planTotal : null;
  const isComplete = percent !== null && percent >= 1;

  return {
    total: factEntries.length > 0 ? factTotal : null,
    actualStartDate: factDateKeys[0] ?? null,
    actualEndDate: isComplete ? (factDateKeys[factDateKeys.length - 1] ?? null) : null,
    percent,
    isComplete,
  };
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
        progressValue: typeof task.progress === 'number' ? normalizeProgressValue(task.progress) : 0,
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
    cell.fill = solidFill(themeColor(THEME.light1));
    cell.font = { bold: true, color: themeColor(THEME.dark1) };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
}

function styleTimelineCell(cell: ExcelJS.Cell, fillColor: string): void {
  cell.fill = solidFill(fillColor.startsWith('FF') ? { argb: fillColor } : { argb: fillColor });
  applyCellBorder(cell);
}

function applyGroupSeparatorTop(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: 'thin', color: { argb: GROUP_SEPARATOR_BORDER } },
    left: cell.border?.left,
    bottom: cell.border?.bottom,
    right: cell.border?.right,
  };
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
        ? { style: 'medium' as const, color: themeColor(THEME.accent1) }
        : kind === 'week'
          ? { style: 'thin' as const, color: { argb: WEEK_BORDER } }
          : undefined
      : kind === 'month'
        ? { style: 'medium' as const, color: themeColor(THEME.accent1) }
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

function isPatternWeekend(dateIso: string, pattern: CalendarWeeklyPattern): boolean {
  switch (parseIsoDate(dateIso).getUTCDay()) {
    case 0:
      return !pattern.sun;
    case 1:
      return !pattern.mon;
    case 2:
      return !pattern.tue;
    case 3:
      return !pattern.wed;
    case 4:
      return !pattern.thu;
    case 5:
      return !pattern.fri;
    case 6:
      return !pattern.sat;
    default:
      return isWeekendFallback(dateIso);
  }
}

function buildNonWorkingSet(
  ganttDayMode: 'business' | 'calendar',
  calendarWeeklyPattern: CalendarWeeklyPattern,
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
    if (ganttDayMode === 'business' && isPatternWeekend(date, calendarWeeklyPattern)) {
      result.add(date);
    }
  }
  return result;
}

function buildHeaderWeekendSet(
  calendarWeeklyPattern: CalendarWeeklyPattern,
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
    if (isPatternWeekend(date, calendarWeeklyPattern)) {
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
          progressEntries: {
            select: {
              entryDate: true,
              amount: true,
            },
            orderBy: [{ entryDate: 'asc' }],
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
    calendarWeeklyPattern: projectCalendar.calendarWeeklyPattern,
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
      workVolume: task.workVolume ?? null,
      workUnit: task.workUnit ?? null,
      completedVolume: task.completedVolume ?? 0,
      progressEntries: task.progressEntries.map((entry) => ({
        entryDate: toIsoDate(entry.entryDate),
        amount: Number(entry.amount),
      })),
      dependencies: task.dependencies.map((dependency) => ({
        predecessorTaskId: dependency.depTaskId,
        predecessorTaskName: dependency.depTask?.name ?? null,
        type: dependency.type,
        lag: Math.trunc(dependency.lag),
      })),
    })),
  };
}

function applyPlanFactPairEdge(cell: ExcelJS.Cell, edge: 'top' | 'bottom'): void {
  cell.border = {
    top: edge === 'top' ? { style: 'medium', color: { argb: PLAN_FACT_PAIR_BORDER } } : cell.border?.top,
    left: cell.border?.left,
    bottom: edge === 'bottom' ? { style: 'medium', color: { argb: PLAN_FACT_PAIR_BORDER } } : cell.border?.bottom,
    right: cell.border?.right,
  };
}

function buildPlanFactTimelineData(tasks: ExportTask[]) {
  const parentTaskIds = new Set(tasks.filter((task) => task.parentId).map((task) => task.parentId!));
  const planByTaskId = new Map<string, Record<string, number> | undefined>();
  const factByTaskId = new Map<string, Record<string, number> | undefined>();
  const rangeTasks: ExportTask[] = [];

  for (const task of tasks) {
    rangeTasks.push(task);
    const planByDate = buildPlanByDate(task, parentTaskIds);
    const factByDate = buildFactByDate(task);
    planByTaskId.set(task.id, planByDate);
    factByTaskId.set(task.id, factByDate);
    for (const dateKey of Object.keys(planByDate ?? {})) {
      rangeTasks.push({
        id: `${task.id}:plan:${dateKey}`,
        name: '',
        parentId: null,
        startDate: dateKey,
        endDate: dateKey,
        sortOrder: 0,
        color: null,
        dependencies: [],
      });
    }
    for (const dateKey of Object.keys(factByDate ?? {})) {
      rangeTasks.push({
        id: `${task.id}:fact:${dateKey}`,
        name: '',
        parentId: null,
        startDate: dateKey,
        endDate: dateKey,
        sortOrder: 0,
        color: null,
        dependencies: [],
      });
    }
  }

  const timelineDates = buildTimelineRange(rangeTasks);
  return { parentTaskIds, planByTaskId, factByTaskId, timelineDates };
}

async function buildPlanFactExcelExportBuffer(data: ProjectExcelExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  (workbook as ExcelJS.Workbook & { _themes?: Record<string, string> })._themes = { theme1: GETGANTT_THEME_XML };
  workbook.creator = 'GetGantt';
  const exportDate = new Date();
  const todayIso = toIsoDate(exportDate);
  workbook.created = exportDate;
  const workbookStyles = createWorkbookStyles();

  const sheet = workbook.addWorksheet('План-факт', {
    views: [{ state: 'frozen', xSplit: STATIC_COLUMN_COUNT, ySplit: HEADER_ROW_COUNT, showGridLines: false }],
  });
  sheet.properties.defaultRowHeight = 18;

  const flattenedRows = buildFlattenedRows(data.tasks);
  const { parentTaskIds, planByTaskId, factByTaskId, timelineDates } = buildPlanFactTimelineData(data.tasks);
  const monthHeaders = suppressRepeatedLabels(timelineDates.map(formatMonthLabel));
  const totalColumnCount = STATIC_COLUMN_COUNT + timelineDates.length;
  const nonWorkingDates = buildNonWorkingSet(data.ganttDayMode, data.calendarWeeklyPattern, data.calendarDays, timelineDates);
  const headerWeekendDates = buildHeaderWeekendSet(data.calendarWeeklyPattern, data.calendarDays, timelineDates);
  const planFactColumnWidths = [8, 48, 14, 14, 8, 10, 9];
  const approximateWidth = planFactColumnWidths.reduce((sum, width) => sum + width, 0) + timelineDates.length * PLAN_FACT_DAY_WIDTH;
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
    { width: planFactColumnWidths[0] },
    { width: planFactColumnWidths[1] },
    { width: planFactColumnWidths[2] },
    { width: planFactColumnWidths[3] },
    { width: planFactColumnWidths[4] },
    { width: planFactColumnWidths[5] },
    { width: planFactColumnWidths[6] },
    ...timelineDates.map(() => ({ width: PLAN_FACT_DAY_WIDTH })),
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

  sheet.addRow([`ГетГант / ${data.projectName} / План-факт`]);
  sheet.addRow([null, null, null, null, null, null, null, ...monthHeaders.map((value) => value || null)]);
  sheet.addRow(['№', 'Задача', 'Начало', 'Оконч.', '', 'Объём', '', ...timelineDates.map((value) => formatDayNumber(value))]);

  sheet.getRow(TITLE_ROW_INDEX).getCell(1).style = cloneStyle(workbookStyles.styles.title);

  for (let rowIndex = MONTH_ROW_INDEX; rowIndex <= HEADER_ROW_COUNT; rowIndex += 1) {
    styleHeaderRow(sheet.getRow(rowIndex));
    for (let columnIndex = 1; columnIndex <= STATIC_COLUMN_COUNT; columnIndex += 1) {
      const cell = sheet.getRow(rowIndex).getCell(columnIndex);
      cell.style = mergeStyle(
        rowIndex === MONTH_ROW_INDEX ? workbookStyles.styles.headerTimelineLevel2 : workbookStyles.styles.headerStatic,
        {
          alignment: rowIndex === HEADER_LABEL_ROW_INDEX
            ? columnIndex === 1
              ? workbookStyles.alignments.headerLeft
              : workbookStyles.alignments.headerCenter
            : workbookStyles.alignments.headerLeft,
        },
      );
      if (rowIndex === HEADER_LABEL_ROW_INDEX) {
        cell.font = { ...(cell.font ?? {}), bold: true };
      }
    }

    for (let columnIndex = STATIC_COLUMN_COUNT + 1; columnIndex <= totalColumnCount; columnIndex += 1) {
      const cell = sheet.getRow(rowIndex).getCell(columnIndex);
      const timelineDate = timelineDates[columnIndex - STATIC_COLUMN_COUNT - 1];
      const isToday = timelineDate === todayIso;
      const separatorKind = separatorKinds[columnIndex - STATIC_COLUMN_COUNT - 1] ?? 'day';
      const headerSeparatorKind = rowIndex === MONTH_ROW_INDEX && separatorKind === 'week' ? 'day' : separatorKind;
      cell.style = cloneStyle(
        rowIndex === MONTH_ROW_INDEX ? workbookStyles.styles.headerTimelineLevel2 : workbookStyles.styles.headerTimeline,
      );
      cell.font = {
        bold: rowIndex === HEADER_LABEL_ROW_INDEX,
        color: rowIndex === HEADER_LABEL_ROW_INDEX && isToday
          ? workbookStyles.colors.todayFont
          : timelineDate && headerWeekendDates.has(timelineDate)
            ? workbookStyles.colors.weekendHeader
            : workbookStyles.colors.textPrimary,
      };
      if (rowIndex === HEADER_LABEL_ROW_INDEX && isToday) {
        cell.fill = solidFill(workbookStyles.colors.today);
      }
      cell.alignment = rowIndex === MONTH_ROW_INDEX
        ? workbookStyles.alignments.headerLeft
        : workbookStyles.alignments.headerCenter;
      applyTimelineSeparator(cell, headerSeparatorKind, {
        verticalLines: false,
        todayLine: rowIndex !== MONTH_ROW_INDEX && isToday,
      });
    }
  }

  if (flattenedRows.length === 0) {
    const emptyRow = sheet.addRow(['', 'Нет задач']);
    for (let columnIndex = 1; columnIndex <= STATIC_COLUMN_COUNT; columnIndex += 1) {
      const cell = emptyRow.getCell(columnIndex);
      cell.style = mergeStyle(
        workbookStyles.styles.emptyState,
        { alignment: baseAlignment(columnIndex === 2 ? 'center' : 'left') },
      );
    }
    emptyRow.getCell(2).font = { italic: true, color: workbookStyles.colors.textPrimary };
    setRowHeightFromContent(emptyRow, 'Нет задач', planFactColumnWidths[1], 0);
    sheet.pageSetup.printArea = `A1:${columnNumberToName(Math.max(STATIC_COLUMN_COUNT, totalColumnCount))}${emptyRow.number}`;
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  const timelineIndexByDate = new Map(timelineDates.map((date, index) => [date, STATIC_COLUMN_COUNT + 1 + index]));
  const planFill = workbookStyles.styles.taskTimeline.default;
  const factFill = solidFill({ argb: 'FFE0F2E9' });
  const factWarningFill = solidFill({ argb: 'FFFCE7F3' });
  const positiveFontColor = { argb: 'FF15803D' };
  const negativeFontColor = { argb: 'FFDC2626' };

  for (const rowData of flattenedRows) {
    const planByDate = planByTaskId.get(rowData.task.id);
    const factByDate = factByTaskId.get(rowData.task.id);
    const planTotal = rowData.task.workVolume ?? null;
    const factSummary = getFactSummary(rowData.task, factByDate);

    const planRow = sheet.addRow([
      rowData.outlineNumber,
      rowData.task.name,
      rowData.task.startDate,
      rowData.task.endDate,
      rowData.isParent ? null : 'План',
      rowData.isParent ? null : planTotal,
      rowData.isParent ? null : rowData.task.workUnit ?? null,
    ]);

    const factRow = rowData.isParent
      ? null
      : sheet.addRow([
        rowData.outlineNumber,
        rowData.task.name,
        factSummary.actualStartDate,
        factSummary.actualEndDate,
        'Факт',
        factSummary.total,
        factSummary.percent,
      ]);

    for (const row of factRow ? [planRow, factRow] : [planRow]) {
      row.height = 18;
      row.getCell(1).alignment = baseAlignment('left');
      row.getCell(2).alignment = { ...baseAlignment('left'), indent: rowData.depth };
      row.getCell(3).alignment = baseAlignment('center');
      row.getCell(4).alignment = baseAlignment('center');
      row.getCell(5).alignment = baseAlignment('center');
      row.getCell(6).alignment = baseAlignment('center');
      row.getCell(7).alignment = baseAlignment('center');

      const startValue = row.getCell(3).value;
      const endValue = row.getCell(4).value;
      if (typeof startValue === 'string' && startValue) {
        row.getCell(3).numFmt = 'dd.mm.yyyy';
        row.getCell(3).value = parseIsoDate(startValue);
      }
      if (typeof endValue === 'string' && endValue) {
        row.getCell(4).numFmt = 'dd.mm.yyyy';
        row.getCell(4).value = parseIsoDate(endValue);
      }
      if (row === factRow && factSummary.percent !== null) {
        row.getCell(7).numFmt = '0%';
      }
      if (row === planRow && !rowData.isParent) {
        row.getCell(3).font = { ...(row.getCell(3).font ?? {}), bold: true, color: workbookStyles.colors.textPrimary };
        row.getCell(4).font = { ...(row.getCell(4).font ?? {}), bold: true, color: workbookStyles.colors.textPrimary };
        row.getCell(5).font = { ...(row.getCell(5).font ?? {}), bold: true };
        row.getCell(6).font = { ...(row.getCell(6).font ?? {}), bold: true };
        row.getCell(7).font = { ...(row.getCell(7).font ?? {}), bold: true };
      }
      if (row === planRow && rowData.isParent) {
        row.getCell(3).font = { ...(row.getCell(3).font ?? {}), bold: true, color: workbookStyles.colors.textPrimary };
        row.getCell(4).font = { ...(row.getCell(4).font ?? {}), bold: true, color: workbookStyles.colors.textPrimary };
      }

      for (let columnIndex = 1; columnIndex <= totalColumnCount; columnIndex += 1) {
        const cell = row.getCell(columnIndex);
        cell.alignment = columnIndex > STATIC_COLUMN_COUNT ? baseAlignment('center') : cell.alignment ?? baseAlignment('left');
        if (columnIndex > STATIC_COLUMN_COUNT) {
          cell.style = mergeStyle(workbookStyles.styles.timelineBase, { alignment: baseAlignment('center') });
          if (rowData.isParent) {
            const timelineDate = timelineDates[columnIndex - STATIC_COLUMN_COUNT - 1];
            const separatorKind = separatorKinds[columnIndex - STATIC_COLUMN_COUNT - 1] ?? 'day';
            cell.border = {
              top: { style: 'thin', color: { argb: GRID_BORDER } },
              bottom: { style: 'thin', color: { argb: GRID_BORDER } },
              left: timelineDate === todayIso
                ? { style: 'medium', color: { argb: TODAY_BORDER } }
                : separatorKind === 'month'
                  ? { style: 'medium', color: themeColor(THEME.accent1) }
                  : undefined,
              right: undefined,
            };
          } else {
            applyTimelineSeparator(cell, separatorKinds[columnIndex - STATIC_COLUMN_COUNT - 1] ?? 'day', {
              verticalLines: true,
              todayLine: timelineDates[columnIndex - STATIC_COLUMN_COUNT - 1] === todayIso,
            });
          }
        } else {
          applyCellBorder(cell);
        }
      }
    }

    if (rowData.isParent) {
      const paletteIndex = Math.min(rowData.depth, workbookStyles.styles.parentTasklist.length - 1);
      const sharedParentFill = workbookStyles.styles.parentTasklist[paletteIndex];
      for (const row of factRow ? [planRow, factRow] : [planRow]) {
        row.getCell(2).font = { bold: true, color: workbookStyles.colors.textPrimary };
        for (let columnIndex = 1; columnIndex <= STATIC_COLUMN_COUNT; columnIndex += 1) {
          const cell = row.getCell(columnIndex);
          cell.border = boxBorder('thin', workbookStyles.colors.gridBorder);
          cell.fill = sharedParentFill;
        }
        for (let columnIndex = STATIC_COLUMN_COUNT + 1; columnIndex <= totalColumnCount; columnIndex += 1) {
          const cell = row.getCell(columnIndex);
          cell.fill = sharedParentFill;
        }
      }
    }

    if (factRow) {
      sheet.mergeCells(planRow.number, 1, factRow.number, 1);
      sheet.mergeCells(planRow.number, 2, factRow.number, 2);
      planRow.getCell(1).value = rowData.outlineNumber;
      planRow.getCell(2).value = rowData.task.name;
      planRow.getCell(1).alignment = { ...baseAlignment('left'), vertical: 'middle' };
      planRow.getCell(2).alignment = { ...baseAlignment('left'), indent: rowData.depth, vertical: 'middle' };
    }

    for (let columnIndex = 1; columnIndex <= totalColumnCount; columnIndex += 1) {
      applyPlanFactPairEdge(planRow.getCell(columnIndex), 'top');
      if (factRow) {
        applyPlanFactPairEdge(factRow.getCell(columnIndex), 'bottom');
      } else {
        applyPlanFactPairEdge(planRow.getCell(columnIndex), 'bottom');
      }
    }

    for (const [dateKey, columnIndex] of timelineIndexByDate) {
      const planValue = planByDate?.[dateKey];
      const factValue = factByDate?.[dateKey];
      const isPastReportDate = dateKey < todayIso;
      const hasPlannedWork = (planValue ?? 0) > 0;
      const isMissingOrZeroFact = factValue === undefined || factValue === 0;
      const isFactBelowPlan = factValue !== undefined && planValue !== undefined && factValue < planValue;
      const isPastDueMissingFact = isPastReportDate && hasPlannedWork && isMissingOrZeroFact;

      if (!rowData.isParent && dateKey >= rowData.task.startDate && dateKey <= rowData.task.endDate) {
        planRow.getCell(columnIndex).fill = planFill;
      }
      if (planValue !== undefined) {
        planRow.getCell(columnIndex).value = planValue;
      }

      if (factRow) {
        if (isFactBelowPlan || isPastDueMissingFact) {
          factRow.getCell(columnIndex).fill = factWarningFill;
          factRow.getCell(columnIndex).font = { color: negativeFontColor };
        } else if (factValue !== undefined) {
          factRow.getCell(columnIndex).fill = factFill;
          factRow.getCell(columnIndex).font = { color: positiveFontColor };
        }
        if (factValue !== undefined) {
          factRow.getCell(columnIndex).value = factValue;
        }
      }
    }

    if (factRow) {
      const isStartDelayed = factSummary.actualStartDate !== null && factSummary.actualStartDate > rowData.task.startDate;
      const isEndDelayed = factSummary.actualEndDate !== null && factSummary.actualEndDate > rowData.task.endDate;
      if (factSummary.actualStartDate !== null) {
        factRow.getCell(3).font = { color: isStartDelayed ? negativeFontColor : positiveFontColor, italic: true };
      }
      if (factSummary.actualEndDate !== null) {
        factRow.getCell(4).font = { color: isEndDelayed ? negativeFontColor : positiveFontColor, italic: true };
      }
      if (factSummary.total !== null) {
        factRow.getCell(6).font = {
          color: (planTotal !== null && factSummary.total < planTotal) ? negativeFontColor : positiveFontColor,
          italic: true,
        };
      }
      if (factSummary.percent !== null) {
        factRow.getCell(7).font = {
          color: factSummary.percent < 1 ? negativeFontColor : positiveFontColor,
          italic: true,
        };
      }
      factRow.getCell(5).font = { italic: true, color: workbookStyles.colors.textPrimary };
    }

    if (rowData.isParent && rowData.depth === 0) {
      for (const row of factRow ? [planRow, factRow] : [planRow]) {
        for (let columnIndex = 1; columnIndex <= totalColumnCount; columnIndex += 1) {
          applyGroupSeparatorTop(row.getCell(columnIndex));
        }
      }
    }
  }

  sheet.pageSetup.printArea = `A1:${columnNumberToName(totalColumnCount)}${sheet.rowCount}`;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildProjectExcelExportBuffer(
  data: ProjectExcelExportData,
  options: { mode?: ProjectExcelExportMode } = {},
): Promise<Buffer> {
  if (options.mode === 'plan-fact') {
    return buildPlanFactExcelExportBuffer(data);
  }

  const workbook = new ExcelJS.Workbook();
  (workbook as ExcelJS.Workbook & { _themes?: Record<string, string> })._themes = { theme1: GETGANTT_THEME_XML };
  workbook.creator = 'GetGantt';
  const exportDate = new Date();
  const todayIso = toIsoDate(exportDate);
  workbook.created = exportDate;
  const workbookStyles = createWorkbookStyles();

  const sheet = workbook.addWorksheet('Gantt', {
    views: [{ state: 'frozen', xSplit: STATIC_COLUMN_COUNT, ySplit: HEADER_ROW_COUNT, showGridLines: false }],
  });
  sheet.properties.defaultRowHeight = 29 / 1.333;

  const flattenedRows = buildFlattenedRows(data.tasks);
  const timelineDates = buildTimelineRange(data.tasks);
  const monthHeaders = suppressRepeatedLabels(timelineDates.map(formatMonthLabel));
  const totalColumnCount = STATIC_COLUMN_COUNT + timelineDates.length;
  const nonWorkingDates = buildNonWorkingSet(data.ganttDayMode, data.calendarWeeklyPattern, data.calendarDays, timelineDates);
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
  titleRow.getCell(1).style = cloneStyle(workbookStyles.styles.title);

  for (let rowIndex = MONTH_ROW_INDEX; rowIndex <= HEADER_ROW_COUNT; rowIndex += 1) {
    styleHeaderRow(sheet.getRow(rowIndex));
    for (let columnIndex = 1; columnIndex <= STATIC_COLUMN_COUNT; columnIndex += 1) {
      const cell = sheet.getRow(rowIndex).getCell(columnIndex);
      cell.style = mergeStyle(
        rowIndex === MONTH_ROW_INDEX ? workbookStyles.styles.headerTimelineLevel2 : workbookStyles.styles.headerStatic,
        {
          alignment: rowIndex === HEADER_LABEL_ROW_INDEX
            ? columnIndex === 1
              ? workbookStyles.alignments.headerLeft
              : workbookStyles.alignments.headerCenter
            : workbookStyles.alignments.headerLeft,
        },
      );
      if (rowIndex === HEADER_LABEL_ROW_INDEX) {
        cell.font = { ...(cell.font ?? {}), bold: true };
      }
    }

    for (let columnIndex = STATIC_COLUMN_COUNT + 1; columnIndex <= totalColumnCount; columnIndex += 1) {
      const cell = sheet.getRow(rowIndex).getCell(columnIndex);
      const timelineDate = timelineDates[columnIndex - STATIC_COLUMN_COUNT - 1];
      const isToday = timelineDate === todayIso;
      const separatorKind = separatorKinds[columnIndex - STATIC_COLUMN_COUNT - 1] ?? 'day';
      const headerSeparatorKind = rowIndex === MONTH_ROW_INDEX && separatorKind === 'week' ? 'day' : separatorKind;
      cell.style = cloneStyle(
        rowIndex === MONTH_ROW_INDEX ? workbookStyles.styles.headerTimelineLevel2 : workbookStyles.styles.headerTimeline,
      );
      cell.font = {
        bold: true,
        color: rowIndex === HEADER_LABEL_ROW_INDEX && isToday
          ? workbookStyles.colors.todayFont
          : rowIndex === HEADER_LABEL_ROW_INDEX && timelineDate && nonWorkingDates.has(timelineDate)
            ? workbookStyles.colors.weekendHeader
            : workbookStyles.colors.textPrimary,
      };
      if (rowIndex === HEADER_LABEL_ROW_INDEX && isToday) {
        cell.fill = solidFill(workbookStyles.colors.today);
      }
      cell.alignment = rowIndex === MONTH_ROW_INDEX
        ? workbookStyles.alignments.headerLeft
        : workbookStyles.alignments.headerCenter;
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
      cell.style = mergeStyle(
        workbookStyles.styles.emptyState,
        { alignment: baseAlignment(columnIndex === 2 ? 'center' : 'left') },
      );
    }
    emptyRow.getCell(2).font = { italic: true, color: workbookStyles.colors.textPrimary };
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

    row.getCell(1).alignment = baseAlignment('left');
    row.getCell(2).alignment = { ...baseAlignment('left'), indent: rowData.depth };
    row.getCell(3).alignment = baseAlignment('center');
    row.getCell(4).alignment = baseAlignment('center');
    row.getCell(5).alignment = baseAlignment('center');
    row.getCell(6).alignment = baseAlignment('center');
    row.getCell(7).alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };

    if (rowData.isParent) {
      row.getCell(2).font = { bold: true, color: workbookStyles.colors.textPrimary };
    }

    row.getCell(3).numFmt = 'dd.mm.yyyy';
    row.getCell(4).numFmt = 'dd.mm.yyyy';
    row.getCell(3).value = parseIsoDate(rowData.task.startDate);
    row.getCell(4).value = parseIsoDate(rowData.task.endDate);
    row.getCell(6).numFmt = '0%';
    row.getCell(6).value = rowData.progressValue;

    for (let columnIndex = 1; columnIndex <= totalColumnCount; columnIndex += 1) {
      const cell = row.getCell(columnIndex);
      cell.alignment = columnIndex > STATIC_COLUMN_COUNT ? baseAlignment('center') : cell.alignment ?? baseAlignment('left');
      if (columnIndex > STATIC_COLUMN_COUNT) {
        cell.style = mergeStyle(workbookStyles.styles.timelineBase, { alignment: baseAlignment('center') });
        applyTimelineSeparator(cell, separatorKinds[columnIndex - STATIC_COLUMN_COUNT - 1] ?? 'day', {
          verticalLines: true,
          todayLine: timelineDates[columnIndex - STATIC_COLUMN_COUNT - 1] === todayIso,
        });
      } else {
        applyCellBorder(cell);
      }
    }

    if (rowData.isParent) {
      for (let columnIndex = 1; columnIndex <= STATIC_COLUMN_COUNT; columnIndex += 1) {
        const paletteIndex = Math.min(rowData.depth, workbookStyles.styles.parentTasklist.length - 1);
        const cell = row.getCell(columnIndex);
        cell.border = boxBorder('thin', workbookStyles.colors.gridBorder);
        cell.fill = workbookStyles.styles.parentTasklist[paletteIndex];
      }
    }

    const startColumn = timelineIndexByDate.get(rowData.task.startDate);
    const endColumn = timelineIndexByDate.get(rowData.task.endDate);
    if (startColumn && endColumn) {
      const normalizedTaskColor = normalizeColor(rowData.task.color);
      const fillColor = rowData.isParent
        ? workbookStyles.styles.parentTimeline[Math.min(rowData.depth, workbookStyles.styles.parentTimeline.length - 1)]
        : normalizedTaskColor === DEFAULT_TASK_FILL
          ? workbookStyles.styles.taskTimeline.default
          : (themeFillForArgb(normalizedTaskColor) ?? solidFill({ argb: normalizedTaskColor }));
      for (let columnIndex = startColumn; columnIndex <= endColumn; columnIndex += 1) {
        row.getCell(columnIndex).style = mergeStyle(
          workbookStyles.styles.timelineBase,
          { fill: fillColor, alignment: baseAlignment('center') },
        );
        applyTimelineSeparator(row.getCell(columnIndex), separatorKinds[columnIndex - STATIC_COLUMN_COUNT - 1] ?? 'day', {
          verticalLines: true,
          todayLine: timelineDates[columnIndex - STATIC_COLUMN_COUNT - 1] === todayIso,
        });
      }
    }

    if (rowData.isParent && rowData.depth === 0) {
      for (let columnIndex = 1; columnIndex <= totalColumnCount; columnIndex += 1) {
        applyGroupSeparatorTop(row.getCell(columnIndex));
      }
    }
  }

  sheet.pageSetup.printArea = `A1:${columnNumberToName(totalColumnCount)}${sheet.rowCount}`;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
