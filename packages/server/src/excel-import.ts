import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { getPrisma } from '@gantt/runtime-core/prisma';
import { assignmentService, commandService, resourceService } from '@gantt/mcp/services';
import type {
  ActorType,
  CreateTaskInput,
  DependencyType,
  HistoryGroupContext,
  ProjectResource,
  TaskDependency,
  TaskType,
} from '@gantt/mcp/types';

export type ExcelImportField =
  | 'wbsLevel'
  | 'name'
  | 'startDate'
  | 'endDate'
  | 'type'
  | 'progress'
  | 'workVolume'
  | 'workUnit'
  | 'completedVolume'
  | 'dependencies'
  | 'resources';

export type ExcelImportHierarchyMode = 'auto' | 'wbs_level';

export type ExcelImportColumnConfig = {
  columnIndex: number | null;
  enabled: boolean;
};

export type ExcelImportMapping = Record<ExcelImportField, ExcelImportColumnConfig>;

export type ExcelImportIssue = {
  severity: 'error' | 'warning';
  rowNumber?: number;
  importIndex?: number;
  field?: ExcelImportField;
  message: string;
};

export type ExcelImportPreviewRow = {
  rowNumber: number;
  importIndex: number;
  values: Partial<Record<ExcelImportField, string>>;
  normalized: {
    name: string;
    wbsLevel: number;
    parentImportIndex: number | null;
    type: TaskType;
    resourceNames: string[];
    dependencyLabels: string[];
    isLeaf: boolean;
  };
};

export type ExcelImportPreviewResponse = {
  fileName: string;
  sheetName: string;
  columns: Array<{ index: number; header: string }>;
  mapping: ExcelImportMapping;
  supportedFields: Array<{ field: ExcelImportField; label: string; required: boolean }>;
  rows: ExcelImportPreviewRow[];
  issues: ExcelImportIssue[];
  summary: {
    parsedRowCount: number;
    taskCount: number;
    dependencyCount: number;
    resourceNameCount: number;
  };
};

export type ExcelImportCommitResult = {
  importedTaskCount: number;
  createdResourceCount: number;
  assignedTaskCount: number;
  newVersion: number;
};

type ParsedSheet = {
  sheetName: string;
  headers: string[];
  rows: Array<{ rowNumber: number; values: string[] }>;
};

type ParsedDependency = {
  importIndex: number;
  type: DependencyType;
  lag: number;
  label: string;
};

type ParsedImportRow = {
  rowNumber: number;
  importIndex: number;
  name: string;
  wbsLevel: number;
  startDate: string;
  endDate: string;
  type: TaskType;
  progress?: number;
  workVolume?: number | null;
  workUnit?: string | null;
  completedVolume?: number;
  dependencyLabels: string[];
  parsedDependencies: ParsedDependency[];
  resourceNames: string[];
  parentImportIndex: number | null;
  parentTempId?: string;
  tempId: string;
  isLeaf: boolean;
  rawValues: Partial<Record<ExcelImportField, string>>;
};

const FIELD_LABELS: Record<ExcelImportField, string> = {
  wbsLevel: 'Уровень структуры',
  name: 'Название задачи',
  startDate: 'Дата начала',
  endDate: 'Дата окончания',
  type: 'Тип',
  progress: '% выполнения',
  workVolume: 'Объём',
  workUnit: 'Единица',
  completedVolume: 'Выполнено',
  dependencies: 'Связи',
  resources: 'Ресурсы',
};

const REQUIRED_FIELDS: ExcelImportField[] = ['wbsLevel', 'name', 'startDate', 'endDate'];
const ALL_FIELDS: ExcelImportField[] = [
  'wbsLevel',
  'name',
  'startDate',
  'endDate',
  'type',
  'progress',
  'workVolume',
  'workUnit',
  'completedVolume',
  'dependencies',
  'resources',
];

const FIELD_ALIASES: Record<ExcelImportField, string[]> = {
  wbsLevel: ['уровеньструктуры', 'уровеньwbs', 'уровень', 'wbslevel', 'level', 'уровеньwbs/bs'],
  name: ['названиезадачи', 'название', 'задача', 'taskname', 'name'],
  startDate: ['датаначала', 'начало', 'startdate', 'start'],
  endDate: ['датаокончания', 'окончание', 'finish', 'enddate', 'end'],
  type: ['тип', 'type'],
  progress: ['%выполнения', 'прогресс', 'progress', 'percentcomplete'],
  workVolume: ['объем', 'объём', 'workvolume', 'volume'],
  workUnit: ['единица', 'едизм', 'ед.изм', 'unit', 'workunit'],
  completedVolume: ['выполнено', 'completed', 'completedvolume'],
  dependencies: ['связи', 'предшественники', 'dependencies', 'predecessors'],
  resources: ['ресурсы', 'resources'],
};

const TYPE_ALIASES: Record<string, TaskType> = {
  task: 'task',
  задача: 'task',
  milestone: 'milestone',
  веха: 'milestone',
};

const DEPENDENCY_TYPE_ALIASES: Record<string, DependencyType> = {
  ОН: 'FS',
  НН: 'SS',
  ОО: 'FF',
  НО: 'SF',
};

export class ExcelImportValidationError extends Error {
  readonly code = 'validation_error';
  readonly issues: ExcelImportIssue[];

  constructor(message: string, issues: ExcelImportIssue[]) {
    super(message);
    this.name = 'ExcelImportValidationError';
    this.issues = issues;
  }
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/gu, 'е')
    .replace(/[%()[\]{}./\\,_\-:;"'`?+*=<>|]/gu, ' ')
    .replace(/\s+/gu, '');
}

function makeDefaultMapping(): ExcelImportMapping {
  return ALL_FIELDS.reduce((acc, field) => {
    acc[field] = { columnIndex: null, enabled: REQUIRED_FIELDS.includes(field) };
    return acc;
  }, {} as ExcelImportMapping);
}

function buildSuggestedMapping(headers: string[]): ExcelImportMapping {
  const mapping = makeDefaultMapping();
  const usedColumns = new Set<number>();

  for (const field of ALL_FIELDS) {
    const aliases = FIELD_ALIASES[field];
    const matchIndex = headers.findIndex((header, index) => {
      if (usedColumns.has(index)) {
        return false;
      }
      return aliases.includes(normalizeHeader(header));
    });

    if (matchIndex >= 0) {
      mapping[field] = {
        columnIndex: matchIndex,
        enabled: true,
      };
      usedColumns.add(matchIndex);
    }
  }

  return mapping;
}

function sanitizeMapping(headers: string[], input?: Partial<Record<ExcelImportField, Partial<ExcelImportColumnConfig>>>): ExcelImportMapping {
  const suggested = buildSuggestedMapping(headers);
  if (!input) {
    return suggested;
  }

  const next = makeDefaultMapping();
  for (const field of ALL_FIELDS) {
    const candidate = input[field];
    const fallback = suggested[field];
    const columnIndex = typeof candidate?.columnIndex === 'number' && candidate.columnIndex >= 0 && candidate.columnIndex < headers.length
      ? Math.trunc(candidate.columnIndex)
      : fallback.columnIndex;
    const enabled = typeof candidate?.enabled === 'boolean'
      ? candidate.enabled
      : fallback.enabled;

    next[field] = {
      columnIndex,
      enabled: REQUIRED_FIELDS.includes(field) ? true : enabled,
    };
  }

  return next;
}

function decodeFileBase64(fileName: string, fileBase64: string): Buffer {
  const trimmed = fileBase64.trim();
  if (!trimmed) {
    throw new ExcelImportValidationError('Пустой файл импорта', [{
      severity: 'error',
      message: 'Файл импорта пустой.',
    }]);
  }

  if (/\.xls$/iu.test(fileName)) {
    throw new ExcelImportValidationError('Формат .xls пока не поддерживается', [{
      severity: 'error',
      message: 'Поддерживаются файлы .xlsx. Формат .xls пока не поддерживается.',
    }]);
  }

  return Buffer.from(trimmed, 'base64');
}

function normalizeCellValue(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') {
      return value.text.trim();
    }
    if ('result' in value && (typeof value.result === 'string' || typeof value.result === 'number')) {
      return String(value.result).trim();
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? '').join('').trim();
    }
    return '';
  }

  return String(value).trim();
}

async function readWorkbookSheet(fileName: string, fileBuffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new ExcelImportValidationError('Лист не найден', [{
      severity: 'error',
      message: 'Не удалось прочитать первый лист Excel-файла.',
    }]);
  }

  const headerRow = worksheet.getRow(1);
  const headerValues = Array.from({ length: worksheet.columnCount }, (_, index) => (
    normalizeCellValue(headerRow.getCell(index + 1).value)
  ));

  if (headerValues.every((value) => !value)) {
    throw new ExcelImportValidationError('Пустая шапка файла', [{
      severity: 'error',
      message: 'В первой строке файла не найдены заголовки столбцов.',
    }]);
  }

  const rows: ParsedSheet['rows'] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = Array.from({ length: worksheet.columnCount }, (_, index) => (
      normalizeCellValue(row.getCell(index + 1).value)
    ));

    if (values.every((value) => !value)) {
      continue;
    }

    rows.push({ rowNumber, values });
  }

  return {
    sheetName: worksheet.name || fileName,
    headers: headerValues.map((value, index) => value || `Колонка ${index + 1}`),
    rows,
  };
}

function getMappedValue(row: ParsedSheet['rows'][number], mapping: ExcelImportMapping, field: ExcelImportField): string {
  const config = mapping[field];
  if (!config.enabled || config.columnIndex === null) {
    return '';
  }
  return row.values[config.columnIndex]?.trim() ?? '';
}

function parseDateValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === trimmed) {
      return trimmed;
    }
  }

  const ruMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/u);
  if (ruMatch) {
    const [, day, month, year] = ruMatch;
    const normalized = `${year}-${month}-${day}`;
    return parseDateValue(normalized);
  }

  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/u);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const normalized = `${year}-${month}-${day}`;
    return parseDateValue(normalized);
  }

  return null;
}

function parseInteger(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) {
    return null;
  }

  if (!/^-?\d+(?:\.\d+)?$/u.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function parseTaskType(value: string): TaskType {
  const normalized = normalizeHeader(value);
  return TYPE_ALIASES[normalized] ?? 'task';
}

function parseProgressValue(value: string): number | null {
  const numeric = parseInteger(value);
  if (numeric === null) {
    return null;
  }

  if (numeric >= 0 && numeric <= 1) {
    return Math.round(numeric * 100);
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function splitListValue(value: string): string[] {
  return value
    .split(/[;,]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseDependencyList(value: string, importIndex: number, rowNumber: number, issues: ExcelImportIssue[]): ParsedDependency[] {
  const items = splitListValue(value);
  const result: ParsedDependency[] = [];

  for (const item of items) {
    const match = item.match(/^(\d+)\s*(ОН|НН|ОО|НО)(?:\s*([+-])\s*(\d+))?$/u);
    if (!match) {
      issues.push({
        severity: 'error',
        rowNumber,
        importIndex,
        field: 'dependencies',
        message: `Некорректный формат связи: "${item}". Используйте формат вроде "1ОН" или "2НН+12".`,
      });
      continue;
    }

    const predecessorIndex = Number(match[1]);
    const dependencyType = DEPENDENCY_TYPE_ALIASES[match[2] ?? ''];
    const sign = match[3] === '-' ? -1 : 1;
    const lag = match[4] ? sign * Number(match[4]) : 0;

    if (!dependencyType) {
      issues.push({
        severity: 'error',
        rowNumber,
        importIndex,
        field: 'dependencies',
        message: `Неизвестный тип связи в значении "${item}".`,
      });
      continue;
    }

    result.push({
      importIndex: predecessorIndex,
      type: dependencyType,
      lag,
      label: item,
    });
  }

  return result;
}

function finalizeHierarchy(rows: ParsedImportRow[], issues: ExcelImportIssue[]): void {
  const stack: ParsedImportRow[] = [];

  for (const row of rows) {
    if (row.wbsLevel === 1) {
      row.parentImportIndex = null;
      row.parentTempId = undefined;
      stack.length = 0;
      stack.push(row);
      continue;
    }

    const previousLevel = stack.length > 0 ? stack[stack.length - 1]!.wbsLevel : 0;
    if (row.wbsLevel > previousLevel + 1) {
      issues.push({
        severity: 'error',
        rowNumber: row.rowNumber,
        importIndex: row.importIndex,
        field: 'wbsLevel',
        message: `Строка не может прыгать с уровня ${previousLevel} сразу на уровень ${row.wbsLevel}.`,
      });
      continue;
    }

    stack.length = row.wbsLevel - 1;
    const parent = stack[row.wbsLevel - 2];
    if (!parent) {
      issues.push({
        severity: 'error',
        rowNumber: row.rowNumber,
        importIndex: row.importIndex,
        field: 'wbsLevel',
        message: 'Для этого уровня не найден родитель в предыдущих строках.',
      });
      continue;
    }

    row.parentImportIndex = parent.importIndex;
    row.parentTempId = parent.tempId;
    stack[row.wbsLevel - 1] = row;
  }

  const parentIds = new Set(rows.map((row) => row.parentImportIndex).filter((value): value is number => value !== null));
  for (const row of rows) {
    row.isLeaf = !parentIds.has(row.importIndex);
  }
}

function parseImportRows(sheet: ParsedSheet, mapping: ExcelImportMapping): { rows: ParsedImportRow[]; issues: ExcelImportIssue[] } {
  const issues: ExcelImportIssue[] = [];
  const rows: ParsedImportRow[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (mapping[field].columnIndex === null) {
      issues.push({
        severity: 'error',
        field,
        message: `Не сопоставлен обязательный столбец "${FIELD_LABELS[field]}".`,
      });
    }
  }

  for (const [index, row] of sheet.rows.entries()) {
    const importIndex = index + 1;
    const rawValues: Partial<Record<ExcelImportField, string>> = {};
    for (const field of ALL_FIELDS) {
      const value = getMappedValue(row, mapping, field);
      if (value) {
        rawValues[field] = value;
      }
    }

    const name = getMappedValue(row, mapping, 'name');
    const wbsLevelValue = getMappedValue(row, mapping, 'wbsLevel');
    const startDateValue = getMappedValue(row, mapping, 'startDate');
    const endDateValue = getMappedValue(row, mapping, 'endDate');

    let rowHasFatal = false;

    if (!name) {
      issues.push({
        severity: 'error',
        rowNumber: row.rowNumber,
        importIndex,
        field: 'name',
        message: 'Не заполнено название задачи.',
      });
      rowHasFatal = true;
    }

    const wbsLevel = parseInteger(wbsLevelValue);
    if (wbsLevel === null || !Number.isInteger(wbsLevel) || wbsLevel < 1) {
      issues.push({
        severity: 'error',
        rowNumber: row.rowNumber,
        importIndex,
        field: 'wbsLevel',
        message: 'Уровень структуры должен быть целым числом 1 или больше.',
      });
      rowHasFatal = true;
    }

    const startDate = parseDateValue(startDateValue);
    if (!startDate) {
      issues.push({
        severity: 'error',
        rowNumber: row.rowNumber,
        importIndex,
        field: 'startDate',
        message: 'Дата начала должна быть в формате YYYY-MM-DD или DD.MM.YYYY.',
      });
      rowHasFatal = true;
    }

    const endDate = parseDateValue(endDateValue);
    if (!endDate) {
      issues.push({
        severity: 'error',
        rowNumber: row.rowNumber,
        importIndex,
        field: 'endDate',
        message: 'Дата окончания должна быть в формате YYYY-MM-DD или DD.MM.YYYY.',
      });
      rowHasFatal = true;
    }

    if (startDate && endDate && startDate > endDate) {
      issues.push({
        severity: 'error',
        rowNumber: row.rowNumber,
        importIndex,
        field: 'endDate',
        message: 'Дата окончания не может быть раньше даты начала.',
      });
      rowHasFatal = true;
    }

    const progressValue = getMappedValue(row, mapping, 'progress');
    const progress = progressValue ? parseProgressValue(progressValue) : null;
    if (progressValue && progress === null) {
      issues.push({
        severity: 'error',
        rowNumber: row.rowNumber,
        importIndex,
        field: 'progress',
        message: 'Поле % выполнения должно быть числом.',
      });
      rowHasFatal = true;
    }

    const workVolumeValue = getMappedValue(row, mapping, 'workVolume');
    const workVolume = workVolumeValue ? parseInteger(workVolumeValue) : null;
    if (workVolumeValue && workVolume === null) {
      issues.push({
        severity: 'error',
        rowNumber: row.rowNumber,
        importIndex,
        field: 'workVolume',
        message: 'Поле Объём должно быть числом.',
      });
      rowHasFatal = true;
    }

    const completedVolumeValue = getMappedValue(row, mapping, 'completedVolume');
    const completedVolume = completedVolumeValue ? parseInteger(completedVolumeValue) : null;
    if (completedVolumeValue && completedVolume === null) {
      issues.push({
        severity: 'error',
        rowNumber: row.rowNumber,
        importIndex,
        field: 'completedVolume',
        message: 'Поле Выполнено должно быть числом.',
      });
      rowHasFatal = true;
    }

    const dependenciesValue = getMappedValue(row, mapping, 'dependencies');
    const parsedDependencies = dependenciesValue
      ? parseDependencyList(dependenciesValue, importIndex, row.rowNumber, issues)
      : [];

    if (rowHasFatal || !startDate || !endDate || wbsLevel === null || !Number.isInteger(wbsLevel)) {
      continue;
    }

    rows.push({
      rowNumber: row.rowNumber,
      importIndex,
      name,
      wbsLevel,
      startDate,
      endDate,
      type: parseTaskType(getMappedValue(row, mapping, 'type')),
      progress: progress ?? undefined,
      workVolume: workVolume ?? undefined,
      workUnit: getMappedValue(row, mapping, 'workUnit') || undefined,
      completedVolume: completedVolume ?? undefined,
      dependencyLabels: parsedDependencies.map((item) => item.label),
      parsedDependencies,
      resourceNames: splitListValue(getMappedValue(row, mapping, 'resources')),
      parentImportIndex: null,
      tempId: randomUUID(),
      parentTempId: undefined,
      isLeaf: true,
      rawValues,
    });
  }

  finalizeHierarchy(rows, issues);

  const rowByImportIndex = new Map(rows.map((row) => [row.importIndex, row]));
  for (const row of rows) {
    for (const dependency of row.parsedDependencies) {
      if (dependency.importIndex === row.importIndex) {
        issues.push({
          severity: 'error',
          rowNumber: row.rowNumber,
          importIndex: row.importIndex,
          field: 'dependencies',
          message: `Задача не может зависеть сама от себя: "${dependency.label}".`,
        });
        continue;
      }

      if (!rowByImportIndex.has(dependency.importIndex)) {
        issues.push({
          severity: 'error',
          rowNumber: row.rowNumber,
          importIndex: row.importIndex,
          field: 'dependencies',
          message: `В связи "${dependency.label}" указана несуществующая строка ${dependency.importIndex}.`,
        });
      }
    }

    if (!row.isLeaf && row.resourceNames.length > 0) {
      issues.push({
        severity: 'warning',
        rowNumber: row.rowNumber,
        importIndex: row.importIndex,
        field: 'resources',
        message: 'Ресурсы у родительской задачи будут пропущены. Назначения импортируются только для leaf-задач.',
      });
    }
  }

  return { rows, issues };
}

export async function buildExcelImportPreview(input: {
  fileName: string;
  fileBase64: string;
  mapping?: Partial<Record<ExcelImportField, Partial<ExcelImportColumnConfig>>>;
  hierarchyMode?: ExcelImportHierarchyMode;
}): Promise<ExcelImportPreviewResponse> {
  void input.hierarchyMode;
  const fileBuffer = decodeFileBase64(input.fileName, input.fileBase64);
  const sheet = await readWorkbookSheet(input.fileName, fileBuffer);
  const mapping = sanitizeMapping(sheet.headers, input.mapping);
  const { rows, issues } = parseImportRows(sheet, mapping);

  return {
    fileName: input.fileName,
    sheetName: sheet.sheetName,
    columns: sheet.headers.map((header, index) => ({ index, header })),
    mapping,
    supportedFields: ALL_FIELDS.map((field) => ({
      field,
      label: FIELD_LABELS[field],
      required: REQUIRED_FIELDS.includes(field),
    })),
    rows: rows.map((row) => ({
      rowNumber: row.rowNumber,
      importIndex: row.importIndex,
      values: row.rawValues,
      normalized: {
        name: row.name,
        wbsLevel: row.wbsLevel,
        parentImportIndex: row.parentImportIndex,
        type: row.type,
        resourceNames: row.resourceNames,
        dependencyLabels: row.dependencyLabels,
        isLeaf: row.isLeaf,
      },
    })),
    issues,
    summary: {
      parsedRowCount: sheet.rows.length,
      taskCount: rows.length,
      dependencyCount: rows.reduce((sum, row) => sum + row.parsedDependencies.length, 0),
      resourceNameCount: new Set(rows.flatMap((row) => row.resourceNames.map((value) => value.toLowerCase()))).size,
    },
  };
}

async function resolveImportResources(projectId: string, names: string[]): Promise<{ resources: ProjectResource[]; createdCount: number }> {
  if (names.length === 0) {
    return { resources: [], createdCount: 0 };
  }

  const catalog = await resourceService.list({ projectId, includeInactive: true });
  const resourcesByName = new Map<string, ProjectResource[]>();
  for (const resource of catalog.resources) {
    const key = resource.name.trim().toLowerCase();
    const bucket = resourcesByName.get(key) ?? [];
    bucket.push(resource);
    resourcesByName.set(key, bucket);
  }

  const resolved: ProjectResource[] = [];
  let createdCount = 0;

  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) {
      continue;
    }

    const key = name.toLowerCase();
    const existing = resourcesByName.get(key) ?? [];
    let resource = existing.find((entry) => entry.isActive) ?? null;

    if (!resource && existing[0]) {
      resource = await resourceService.update({
        projectId,
        resourceId: existing[0].id,
        isActive: true,
      });
      existing[0] = resource;
    }

    if (!resource) {
      resource = await resourceService.create({
        projectId,
        name,
        scope: 'project',
      });
      createdCount += 1;
      resourcesByName.set(key, [...existing, resource]);
    }

    resolved.push(resource);
  }

  return { resources: resolved, createdCount };
}

export async function commitExcelImport(input: {
  projectId: string;
  userId: string;
  fileName: string;
  fileBase64: string;
  mapping?: Partial<Record<ExcelImportField, Partial<ExcelImportColumnConfig>>>;
  hierarchyMode?: ExcelImportHierarchyMode;
}): Promise<ExcelImportCommitResult> {
  const preview = await buildExcelImportPreview({
    fileName: input.fileName,
    fileBase64: input.fileBase64,
    mapping: input.mapping,
    hierarchyMode: input.hierarchyMode,
  });

  const blockingIssues = preview.issues.filter((issue) => issue.severity === 'error');
  if (blockingIssues.length > 0) {
    throw new ExcelImportValidationError('Файл импорта содержит ошибки', blockingIssues);
  }

  const fileBuffer = decodeFileBase64(input.fileName, input.fileBase64);
  const sheet = await readWorkbookSheet(input.fileName, fileBuffer);
  const mapping = sanitizeMapping(sheet.headers, input.mapping);
  const parsed = parseImportRows(sheet, mapping);
  const parsedRows = parsed.rows;

  const rowByImportIndex = new Map(parsedRows.map((row) => [row.importIndex, row]));

  const createTasks: CreateTaskInput[] = parsedRows.map((row) => ({
    id: row.tempId,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    type: row.type,
    parentId: row.parentTempId,
    progress: row.progress,
    workVolume: row.workVolume ?? null,
    workUnit: row.workUnit ?? null,
    completedVolume: row.completedVolume ?? 0,
    dependencies: row.parsedDependencies.map((dependency): TaskDependency => ({
      taskId: rowByImportIndex.get(dependency.importIndex)!.tempId,
      type: dependency.type,
      lag: dependency.lag,
    })),
  }));

  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { version: true },
  });

  if (!project) {
    throw new ExcelImportValidationError('Проект не найден', [{
      severity: 'error',
      message: 'Не удалось найти проект для импорта.',
    }]);
  }

  const actorType: ActorType = 'import';
  const historyGroupId = randomUUID();
  const historySeed: Omit<HistoryGroupContext, 'origin' | 'title' | 'finalizeGroup'> = {
    groupId: historyGroupId,
    requestContextId: randomUUID(),
    undoable: true,
  };

  const commitResponse = await commandService.commitCommand(
    {
      projectId: input.projectId,
      clientRequestId: randomUUID(),
      baseVersion: project.version,
      command: { type: 'create_tasks_batch', tasks: createTasks },
      history: {
        ...historySeed,
        origin: 'user_ui',
        title: 'Импорт из Excel',
        finalizeGroup: true,
      },
      includeSnapshot: false,
    },
    actorType,
    input.userId,
  );

  if (!commitResponse.accepted) {
    throw new ExcelImportValidationError('Не удалось закоммитить импорт', [{
      severity: 'error',
      message: `Импорт отклонён: ${commitResponse.reason}.`,
    }]);
  }

  const uniqueResourceNames = Array.from(new Set(
    parsedRows
      .filter((row) => row.isLeaf)
      .flatMap((row) => row.resourceNames.map((name) => name.trim()))
      .filter(Boolean),
  ));
  const { resources: importResources, createdCount } = await resolveImportResources(input.projectId, uniqueResourceNames);
  const resourceIdByName = new Map(importResources.map((resource) => [resource.name.trim().toLowerCase(), resource.id]));

  let assignedTaskCount = 0;
  for (const row of parsedRows) {
    if (!row.isLeaf || row.resourceNames.length === 0) {
      continue;
    }

    const resourceIds = Array.from(new Set(
      row.resourceNames
        .map((name) => resourceIdByName.get(name.trim().toLowerCase()) ?? null)
        .filter((value): value is string => Boolean(value)),
    ));

    if (resourceIds.length === 0) {
      continue;
    }

    await assignmentService.replaceForTask({
      projectId: input.projectId,
      taskId: row.tempId,
      resourceIds,
    });
    assignedTaskCount += 1;
  }

  return {
    importedTaskCount: parsedRows.length,
    createdResourceCount: createdCount,
    assignedTaskCount,
    newVersion: commitResponse.newVersion,
  };
}

export async function buildExcelImportTemplateBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GetGantt';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Импорт задач');
  sheet.columns = [
    { width: 14 },
    { width: 34 },
    { width: 14 },
    { width: 16 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 18 },
    { width: 24 },
  ];
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const rows = [
    [1, 'Подготовительный этап', new Date(Date.UTC(2026, 4, 12)), new Date(Date.UTC(2026, 4, 16)), 'задача', 15, null, null, null, null, null],
    [2, 'Разбивка осей', new Date(Date.UTC(2026, 4, 12)), new Date(Date.UTC(2026, 4, 13)), 'задача', 100, 120, 'м2', 120, null, 'Бригада 1'],
    [2, 'Подготовка площадки', new Date(Date.UTC(2026, 4, 14)), new Date(Date.UTC(2026, 4, 16)), 'задача', 0, 3, 'дн', 0, '2ОН', 'Экскаватор; Бригада 2'],
    [1, 'Монолит', new Date(Date.UTC(2026, 4, 19)), new Date(Date.UTC(2026, 4, 30)), 'задача', 0, null, null, null, '3ОН+2', null],
    [2, 'Фундамент', new Date(Date.UTC(2026, 4, 19)), new Date(Date.UTC(2026, 4, 23)), 'задача', 0, 40, 'м3', 0, null, 'Бригада 1'],
  ];

  sheet.addTable({
    name: 'ImportTasksTemplate',
    displayName: 'ImportTasksTemplate',
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: {
      theme: 'TableStyleMedium2',
      showRowStripes: true,
    },
    columns: [
      { name: 'Уровень структуры', filterButton: true },
      { name: 'Название задачи', filterButton: true },
      { name: 'Дата начала', filterButton: true },
      { name: 'Дата окончания', filterButton: true },
      { name: 'Тип', filterButton: true },
      { name: '% выполнения', filterButton: true },
      { name: 'Объём', filterButton: true },
      { name: 'Единица', filterButton: true },
      { name: 'Выполнено', filterButton: true },
      { name: 'Связи', filterButton: true },
      { name: 'Ресурсы', filterButton: true },
    ],
    rows,
  });

  sheet.getColumn(3).numFmt = 'dd.mm.yyyy';
  sheet.getColumn(4).numFmt = 'dd.mm.yyyy';

  const hintSheet = workbook.addWorksheet('Подсказки');
  hintSheet.columns = [{ width: 110 }];
  hintSheet.addRows([
    ['Как заполнять импорт:'],
    ['1. Иерархия задаётся только через столбец "Уровень структуры": 1 = корень, 2 = дочерняя, 3 = вложенная под уровень 2.'],
    ['2. Строки идут линейно сверху вниз. Родитель определяется автоматически по предыдущим строкам.'],
    ['3. Связи задаются только в русском формате: "1ОН", "2НН+12", "5ОО-3". Можно перечислять через запятую или точку с запятой.'],
    ['4. В колонке "Ресурсы" указывайте имена через запятую или точку с запятой. Новые ресурсы будут созданы автоматически.'],
    ['5. Даты используйте в формате YYYY-MM-DD или DD.MM.YYYY.'],
  ]);
  hintSheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
