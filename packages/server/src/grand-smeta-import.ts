import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import iconv from 'iconv-lite';
import { XMLParser } from 'fast-xml-parser';
import { getPrisma } from '@gantt/runtime-core/prisma';
import { assignmentService, commandService, resourceService } from '@gantt/mcp/services';
import type {
  ActorType,
  CreateTaskInput,
  HistoryGroupContext,
  ProjectResource,
  ResourceType,
  TaskType,
} from '@gantt/mcp/types';

type PreservedXmlNode = Record<string, unknown>;

export type GrandSmetaImportField =
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

export type GrandSmetaImportColumnConfig = {
  columnIndex: number | null;
  enabled: boolean;
};

export type GrandSmetaImportMapping = Record<GrandSmetaImportField, GrandSmetaImportColumnConfig>;

export type GrandSmetaImportOptions = {
  includeMaterials: boolean;
  includeMechanisms: boolean;
  normalizeUnitMultipliers: boolean;
};

export type GrandSmetaImportIssue = {
  severity: 'error' | 'warning';
  rowNumber?: number;
  importIndex?: number;
  field?: GrandSmetaImportField;
  message: string;
};

export type GrandSmetaImportPreviewResponse = {
  fileName: string;
  sheetName: string;
  columns: Array<{ index: number; header: string }>;
  mapping: GrandSmetaImportMapping;
  options: GrandSmetaImportOptions;
  supportedFields: Array<{ field: GrandSmetaImportField; label: string; required: boolean }>;
  rows: Array<{
    rowNumber: number;
    importIndex: number;
    values: Partial<Record<GrandSmetaImportField, string>>;
    normalized: {
      name: string;
      wbsLevel: number;
      parentImportIndex: number | null;
      type: TaskType;
      resourceNames: string[];
      dependencyLabels: string[];
      isLeaf: boolean;
    };
  }>;
  issues: GrandSmetaImportIssue[];
  summary: {
    parsedRowCount: number;
    taskCount: number;
    dependencyCount: number;
    resourceNameCount: number;
  };
};

export type GrandSmetaImportCommitResult = {
  importedTaskCount: number;
  createdResourceCount: number;
  assignedTaskCount: number;
  newVersion: number;
};

export class GrandSmetaImportValidationError extends Error {
  readonly code = 'validation_error';
  readonly issues: GrandSmetaImportIssue[];

  constructor(message: string, issues: GrandSmetaImportIssue[]) {
    super(message);
    this.name = 'GrandSmetaImportValidationError';
    this.issues = issues;
  }
}

type GrandSmetaParsedRow = {
  rowNumber: number;
  importIndex: number;
  name: string;
  wbsLevel: number;
  startDate: string;
  endDate: string;
  type: TaskType;
  workVolume?: number;
  workUnit?: string;
  parentImportIndex: number | null;
  parentTempId?: string;
  tempId: string;
  isLeaf: boolean;
  resourceRefs: GrandSmetaResourceRef[];
  rawValues: Partial<Record<GrandSmetaImportField, string>>;
};

type GrandSmetaResourceRef = {
  name: string;
  type: ResourceType;
  quantity?: number;
  unit?: string;
};

const FIELD_LABELS: Record<GrandSmetaImportField, string> = {
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

const FIELD_ORDER: GrandSmetaImportField[] = [
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

const DEFAULT_IMPORT_OPTIONS: GrandSmetaImportOptions = {
  includeMaterials: true,
  includeMechanisms: true,
  normalizeUnitMultipliers: true,
};

function buildFixedMapping(): GrandSmetaImportMapping {
  return FIELD_ORDER.reduce((acc, field, index) => {
    acc[field] = {
      columnIndex: index,
      enabled: true,
    };
    return acc;
  }, {} as GrandSmetaImportMapping);
}

function decodeGsfxFileBase64(fileName: string, fileBase64: string): Buffer {
  const trimmed = fileBase64.trim();
  if (!trimmed) {
    throw new GrandSmetaImportValidationError('Пустой файл импорта', [{
      severity: 'error',
      message: 'Файл импорта пустой.',
    }]);
  }

  if (!/\.gsfx$/iu.test(fileName)) {
    throw new GrandSmetaImportValidationError('Неподдерживаемый формат файла', [{
      severity: 'error',
      message: 'Для импорта из ГРАНД-Смета поддерживаются только файлы .gsfx.',
    }]);
  }

  return Buffer.from(trimmed, 'base64');
}

async function extractGsfxXml(fileName: string, fileBuffer: Buffer): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(fileBuffer);
  } catch {
    throw new GrandSmetaImportValidationError('Не удалось открыть GSFX', [{
      severity: 'error',
      message: `Файл "${fileName}" не похож на корректный архив Grand Сметы.`,
    }]);
  }

  const xmlEntry = zip.file('Data.xml');
  if (!xmlEntry) {
    throw new GrandSmetaImportValidationError('Data.xml не найден', [{
      severity: 'error',
      message: 'Внутри GSFX не найден файл Data.xml.',
    }]);
  }

  const xmlBuffer = await xmlEntry.async('nodebuffer');
  return iconv.decode(xmlBuffer, 'win1251');
}

function getNodeName(node: PreservedXmlNode): string | null {
  for (const key of Object.keys(node)) {
    if (key !== ':@') {
      return key;
    }
  }
  return null;
}

function getNodeChildren(node: PreservedXmlNode): PreservedXmlNode[] {
  const nodeName = getNodeName(node);
  if (!nodeName) {
    return [];
  }
  const value = node[nodeName];
  return Array.isArray(value) ? value.filter((entry): entry is PreservedXmlNode => typeof entry === 'object' && entry !== null) : [];
}

function getNodeAttributes(node: PreservedXmlNode): Record<string, string> {
  const attributes = node[':@'];
  if (!attributes || typeof attributes !== 'object') {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
}

function findFirstChild(node: PreservedXmlNode, childName: string): PreservedXmlNode | null {
  return getNodeChildren(node).find((child) => getNodeName(child) === childName) ?? null;
}

function findChildren(node: PreservedXmlNode, childName: string): PreservedXmlNode[] {
  return getNodeChildren(node).filter((child) => getNodeName(child) === childName);
}

function parseRussianDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/u);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function addDays(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseDecimal(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/u.test(normalized)) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeImportOptions(input?: Partial<GrandSmetaImportOptions>): GrandSmetaImportOptions {
  return {
    includeMaterials: input?.includeMaterials ?? DEFAULT_IMPORT_OPTIONS.includeMaterials,
    includeMechanisms: input?.includeMechanisms ?? DEFAULT_IMPORT_OPTIONS.includeMechanisms,
    normalizeUnitMultipliers: input?.normalizeUnitMultipliers ?? DEFAULT_IMPORT_OPTIONS.normalizeUnitMultipliers,
  };
}

function normalizeWorkUnit(
  workUnit: string | undefined,
  workVolume: number | undefined,
  options: GrandSmetaImportOptions,
): { workUnit?: string; workVolume?: number } {
  const trimmedUnit = workUnit?.trim();
  if (!trimmedUnit || !options.normalizeUnitMultipliers) {
    return {
      workUnit: trimmedUnit || undefined,
      workVolume,
    };
  }

  const normalizedSpacingUnit = trimmedUnit.replace(/[\u00A0\u202F]/gu, ' ');
  const match = normalizedSpacingUnit.match(/^(\d+(?:[.,]\d+)?)(?:\s*)([^\d].*)$/u);
  if (!match) {
    return {
      workUnit: trimmedUnit,
      workVolume,
    };
  }

  const multiplier = parseDecimal(match[1]);
  const normalizedUnit = match[2]?.trim();
  if (multiplier === undefined || !normalizedUnit) {
    return {
      workUnit: trimmedUnit,
      workVolume,
    };
  }

  return {
    workUnit: normalizedUnit,
    workVolume: workVolume === undefined ? undefined : workVolume * multiplier,
  };
}

function parsePositionResources(positionNode: PreservedXmlNode, options: GrandSmetaImportOptions): GrandSmetaResourceRef[] {
  const resourcesNode = findFirstChild(positionNode, 'Resources');
  if (!resourcesNode) {
    return [];
  }

  const resources: GrandSmetaResourceRef[] = [];
  for (const child of getNodeChildren(resourcesNode)) {
    const kind = getNodeName(child);
    const attrs = getNodeAttributes(child);
    const name = attrs.Caption?.trim();
    if (!name) {
      continue;
    }

    if (kind === 'Mat' && options.includeMaterials) {
      resources.push({
        name,
        type: 'material',
        quantity: parseDecimal(attrs.Quantity),
        unit: attrs.Units?.trim() || undefined,
      });
      continue;
    }

    if (kind === 'Mch' && options.includeMechanisms) {
      resources.push({
        name,
        type: 'equipment',
        quantity: parseDecimal(attrs.Quantity),
        unit: attrs.Units?.trim() || undefined,
      });
    }
  }

  const deduped = new Map<string, GrandSmetaResourceRef>();
  for (const resource of resources) {
    const key = `${resource.type}:${resource.name.trim().toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, resource);
    }
  }
  return Array.from(deduped.values());
}

function isMaterialCatalogPosition(positionNode: PreservedXmlNode): boolean {
  const attrs = getNodeAttributes(positionNode);
  const code = attrs.Code?.trim() ?? '';
  const hasResources = Boolean(findFirstChild(positionNode, 'Resources'));
  const quantityNode = findFirstChild(positionNode, 'Quantity');
  const quantityAttrs = quantityNode ? getNodeAttributes(quantityNode) : {};
  const quantityFx = quantityAttrs.Fx?.trim() ?? '';
  const referencesWorkResource = /(^|[^А-ЯA-Z0-9-])-?(?:Ф|F)\d+\.\s*(?:р|r)\d+/iu.test(quantityFx);

  if (hasResources) {
    return false;
  }

  if (/^(?:ФСБЦ|FSBC)/u.test(code)) {
    return true;
  }

  return referencesWorkResource;
}

function createRawValues(row: Pick<GrandSmetaParsedRow, 'wbsLevel' | 'name' | 'startDate' | 'endDate' | 'type' | 'workVolume' | 'workUnit' | 'resourceRefs'>): Partial<Record<GrandSmetaImportField, string>> {
  return {
    wbsLevel: String(row.wbsLevel),
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    type: row.type === 'milestone' ? 'веха' : 'задача',
    workVolume: row.workVolume !== undefined ? String(row.workVolume) : '',
    workUnit: row.workUnit ?? '',
    completedVolume: '',
    dependencies: '',
    progress: '',
    resources: row.resourceRefs.map((resource) => resource.name).join('; '),
  };
}

export function parseGrandSmetaXml(
  xmlText: string,
  sourceName: string,
  inputOptions?: Partial<GrandSmetaImportOptions>,
): { fileName: string; sheetName: string; rows: GrandSmetaParsedRow[]; issues: GrandSmetaImportIssue[]; options: GrandSmetaImportOptions } {
  const options = sanitizeImportOptions(inputOptions);
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false,
  });

  const parsed = parser.parse(xmlText);
  const documentNode = Array.isArray(parsed)
    ? parsed.find((node): node is PreservedXmlNode => typeof node === 'object' && node !== null && getNodeName(node) === 'Document')
    : null;

  if (!documentNode) {
    throw new GrandSmetaImportValidationError('Document не найден', [{
      severity: 'error',
      message: 'Не удалось разобрать корневой узел Document в Data.xml.',
    }]);
  }

  const propertiesNode = findFirstChild(documentNode, 'Properties');
  const docDatesNode = findFirstChild(documentNode, 'DocDates');
  const chaptersNode = findFirstChild(documentNode, 'Chapters');

  if (!chaptersNode) {
    throw new GrandSmetaImportValidationError('Разделы сметы не найдены', [{
      severity: 'error',
      message: 'В файле ГРАНД-Смета не найден блок Chapters.',
    }]);
  }

  const properties = propertiesNode ? getNodeAttributes(propertiesNode) : {};
  const docDates = docDatesNode ? getNodeAttributes(docDatesNode) : {};
  const baseDate = parseRussianDate(docDates['СreationDate'] ?? docDates.CreationDate ?? docDates.ApprovalDate) ?? new Date().toISOString().slice(0, 10);
  const description = properties.Description?.trim() || sourceName;
  const issues: GrandSmetaImportIssue[] = [{
    severity: 'warning',
    message: `GSFX не содержит календарных дат задач. Даты сгенерированы автоматически: по 1 дню на позицию, начиная с ${baseDate}.`,
  }];
  let skippedMaterialCount = 0;

  const rows: GrandSmetaParsedRow[] = [];
  let importIndex = 1;
  let leafIndex = 0;

  for (const chapterNode of findChildren(chaptersNode, 'Chapter')) {
    const chapterRowStartIndex = rows.length;
    const chapterAttrs = getNodeAttributes(chapterNode);
    const chapterName = chapterAttrs.Caption?.trim();
    if (!chapterName) {
      continue;
    }

    const chapterRow: GrandSmetaParsedRow = {
      rowNumber: importIndex,
      importIndex,
      name: chapterName,
      wbsLevel: 1,
      startDate: baseDate,
      endDate: baseDate,
      type: 'task',
      parentImportIndex: null,
      tempId: randomUUID(),
      isLeaf: false,
      resourceRefs: [],
      rawValues: {},
    };
    rows.push(chapterRow);
    importIndex += 1;

    let activeHeaderRow: GrandSmetaParsedRow | null = null;
    let pendingHeaderName: string | null = null;
    let chapterHasLeaf = false;

    for (const childNode of getNodeChildren(chapterNode)) {
      const childName = getNodeName(childNode);
      if (childName === 'Header') {
        const headerAttrs = getNodeAttributes(childNode);
        pendingHeaderName = headerAttrs.Caption?.trim() || null;
        activeHeaderRow = null;
        continue;
      }

      if (childName !== 'Position') {
        continue;
      }

      if (isMaterialCatalogPosition(childNode)) {
        skippedMaterialCount += 1;
        continue;
      }

      const positionAttrs = getNodeAttributes(childNode);
      const caption = positionAttrs.Caption?.trim();
      if (!caption) {
        issues.push({
          severity: 'warning',
          rowNumber: importIndex,
          message: 'Пропущена позиция без Caption в GSFX.',
        });
        continue;
      }

      const positionNumber = positionAttrs.Number?.trim();
      const quantityNode = findFirstChild(childNode, 'Quantity');
      const quantityAttrs = quantityNode ? getNodeAttributes(quantityNode) : {};
      const resourceRefs = parsePositionResources(childNode, options);
      const startDate = addDays(baseDate, leafIndex);
      const endDate = startDate;
      leafIndex += 1;
      chapterHasLeaf = true;

      const normalizedWork = normalizeWorkUnit(
        positionAttrs.Units?.trim() || undefined,
        parseDecimal(quantityAttrs.Result),
        options,
      );
      if (!activeHeaderRow && pendingHeaderName) {
        activeHeaderRow = {
          rowNumber: importIndex,
          importIndex,
          name: pendingHeaderName,
          wbsLevel: 2,
          startDate,
          endDate,
          type: 'task',
          parentImportIndex: chapterRow.importIndex,
          parentTempId: chapterRow.tempId,
          tempId: randomUUID(),
          isLeaf: false,
          resourceRefs: [],
          rawValues: {},
        };
        rows.push(activeHeaderRow);
        importIndex += 1;
      }
      const parentRow = activeHeaderRow ?? chapterRow;

      const positionRow: GrandSmetaParsedRow = {
        rowNumber: importIndex,
        importIndex,
        name: positionNumber ? `${positionNumber}. ${caption}` : caption,
        wbsLevel: activeHeaderRow ? 3 : 2,
        startDate,
        endDate,
        type: 'task',
        workVolume: normalizedWork.workVolume,
        workUnit: normalizedWork.workUnit,
        parentImportIndex: parentRow.importIndex,
        parentTempId: parentRow.tempId,
        tempId: randomUUID(),
        isLeaf: true,
        resourceRefs,
        rawValues: {},
      };
      positionRow.rawValues = createRawValues(positionRow);
      rows.push(positionRow);
      importIndex += 1;

      if (activeHeaderRow) {
        activeHeaderRow.startDate = activeHeaderRow.startDate > startDate ? startDate : activeHeaderRow.startDate;
        activeHeaderRow.endDate = activeHeaderRow.endDate < endDate ? endDate : activeHeaderRow.endDate;
      }
      chapterRow.startDate = chapterRow.startDate > startDate ? startDate : chapterRow.startDate;
      chapterRow.endDate = chapterRow.endDate < endDate ? endDate : chapterRow.endDate;
    }

    if (!chapterHasLeaf) {
      rows.splice(chapterRowStartIndex);
      importIndex = chapterRow.importIndex;
      issues.push({
        severity: 'warning',
        message: `Раздел "${chapterName}" пропущен, потому что в нём не найдено ни одной позиции.`,
      });
      continue;
    }

    chapterRow.rawValues = createRawValues(chapterRow);
    for (const row of rows) {
      if (row.parentImportIndex === chapterRow.importIndex && !row.isLeaf) {
        row.rawValues = createRawValues(row);
      }
    }
  }

  if (rows.length === 0) {
    throw new GrandSmetaImportValidationError('Пустая смета', [{
      severity: 'error',
      message: 'В GSFX не найдено ни одного раздела или позиции для импорта.',
    }]);
  }

  if (skippedMaterialCount > 0) {
    issues.push({
      severity: 'warning',
      message: `Материальные позиции из сметных каталогов пропущены: ${skippedMaterialCount}. Импортируются только работы и группирующие разделы.`,
    });
  }

  const selectedResourceCount = new Set(
    rows.flatMap((row) => row.resourceRefs.map((resource) => `${resource.type}:${resource.name.trim().toLowerCase()}`)),
  ).size;
  if (selectedResourceCount > 0) {
    issues.push({
      severity: 'warning',
      message: `Назначения из сметы будут импортированы по именам ресурсов. Количества (${selectedResourceCount} уник. ресурсов) пока не сохраняются в assignment-модели.`,
    });
  }

  return {
    fileName: sourceName,
    sheetName: description,
    rows,
    issues,
    options,
  };
}

export async function buildGrandSmetaImportPreview(input: {
  fileName: string;
  fileBase64: string;
  options?: Partial<GrandSmetaImportOptions>;
}): Promise<GrandSmetaImportPreviewResponse> {
  const fileBuffer = decodeGsfxFileBase64(input.fileName, input.fileBase64);
  const xmlText = await extractGsfxXml(input.fileName, fileBuffer);
  const parsed = parseGrandSmetaXml(xmlText, input.fileName, input.options);
  const mapping = buildFixedMapping();

  return {
    fileName: parsed.fileName,
    sheetName: parsed.sheetName,
    columns: FIELD_ORDER.map((field, index) => ({ index, header: FIELD_LABELS[field] })),
    mapping,
    options: parsed.options,
    supportedFields: FIELD_ORDER.map((field) => ({
      field,
      label: FIELD_LABELS[field],
      required: ['wbsLevel', 'name', 'startDate', 'endDate'].includes(field),
    })),
    rows: parsed.rows.map((row) => ({
      rowNumber: row.rowNumber,
      importIndex: row.importIndex,
      values: row.rawValues,
      normalized: {
        name: row.name,
        wbsLevel: row.wbsLevel,
        parentImportIndex: row.parentImportIndex,
        type: row.type,
        resourceNames: row.resourceRefs.map((resource) => resource.name),
        dependencyLabels: [],
        isLeaf: row.isLeaf,
      },
    })),
    issues: parsed.issues,
    summary: {
      parsedRowCount: parsed.rows.length,
      taskCount: parsed.rows.length,
      dependencyCount: 0,
      resourceNameCount: new Set(
        parsed.rows.flatMap((row) => row.resourceRefs.map((resource) => `${resource.type}:${resource.name.trim().toLowerCase()}`)),
      ).size,
    },
  };
}

async function resolveTypedImportResources(
  projectId: string,
  resources: GrandSmetaResourceRef[],
): Promise<{ resources: ProjectResource[]; createdCount: number }> {
  if (resources.length === 0) {
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

  for (const requested of resources) {
    const key = requested.name.trim().toLowerCase();
    const existing = resourcesByName.get(key) ?? [];
    let resource = existing.find((entry) => entry.isActive && entry.type === requested.type)
      ?? existing.find((entry) => entry.isActive)
      ?? null;

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
        name: requested.name,
        type: requested.type,
        scope: 'project',
      });
      createdCount += 1;
      resourcesByName.set(key, [...existing, resource]);
    }

    resolved.push(resource);
  }

  return { resources: resolved, createdCount };
}

export async function commitGrandSmetaImport(input: {
  projectId: string;
  userId: string;
  fileName: string;
  fileBase64: string;
  options?: Partial<GrandSmetaImportOptions>;
}): Promise<GrandSmetaImportCommitResult> {
  const preview = await buildGrandSmetaImportPreview({
    fileName: input.fileName,
    fileBase64: input.fileBase64,
    options: input.options,
  });
  const blockingIssues = preview.issues.filter((issue) => issue.severity === 'error');
  if (blockingIssues.length > 0) {
    throw new GrandSmetaImportValidationError('Файл импорта содержит ошибки', blockingIssues);
  }

  const fileBuffer = decodeGsfxFileBase64(input.fileName, input.fileBase64);
  const xmlText = await extractGsfxXml(input.fileName, fileBuffer);
  const parsed = parseGrandSmetaXml(xmlText, input.fileName, input.options);

  const createTasks: CreateTaskInput[] = parsed.rows.map((row) => ({
    id: row.tempId,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    type: row.type,
    parentId: row.parentTempId,
    progress: undefined,
    workVolume: row.workVolume ?? null,
    workUnit: row.workUnit ?? null,
    completedVolume: 0,
    dependencies: [],
  }));

  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { version: true },
  });

  if (!project) {
    throw new GrandSmetaImportValidationError('Проект не найден', [{
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
        title: 'Импорт из ГРАНД-Смета',
        finalizeGroup: true,
      },
      includeSnapshot: false,
    },
    actorType,
    input.userId,
  );

  if (!commitResponse.accepted) {
    throw new GrandSmetaImportValidationError('Не удалось закоммитить импорт', [{
      severity: 'error',
      message: `Импорт отклонён: ${commitResponse.reason}.`,
    }]);
  }

  const uniqueResources = Array.from(new Map(
    parsed.rows
      .filter((row) => row.isLeaf)
      .flatMap((row) => row.resourceRefs)
      .map((resource) => [`${resource.type}:${resource.name.trim().toLowerCase()}`, resource] as const),
  ).values());
  const { resources: importResources, createdCount } = await resolveTypedImportResources(input.projectId, uniqueResources);
  const resourceIdByKey = new Map(importResources.map((resource) => [`${resource.type}:${resource.name.trim().toLowerCase()}`, resource.id]));

  let assignedTaskCount = 0;
  for (const row of parsed.rows) {
    if (!row.isLeaf || row.resourceRefs.length === 0) {
      continue;
    }

    const resourceIds = Array.from(new Set(
      row.resourceRefs
        .map((resource) => resourceIdByKey.get(`${resource.type}:${resource.name.trim().toLowerCase()}`) ?? null)
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
    importedTaskCount: parsed.rows.length,
    createdResourceCount: createdCount,
    assignedTaskCount,
    newVersion: commitResponse.newVersion,
  };
}
