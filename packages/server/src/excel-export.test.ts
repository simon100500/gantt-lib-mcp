import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import type { ProjectExcelExportData, ProjectExcelExportMode } from './excel-export.js';

function assertThemeColor(
  color: { theme?: number; tint?: number; argb?: string } | undefined,
  expected: { theme: number; tint?: number },
) {
  assert.ok(color);
  assert.equal(color.theme, expected.theme);
  assert.equal(color.tint, expected.tint);
}

function assertArgbColor(
  color: { theme?: number; tint?: number; argb?: string } | undefined,
  expectedArgb: string,
) {
  assert.ok(color);
  assert.equal(color.argb, expectedArgb);
}

function assertFillBackgroundArgb(
  fill: {
    type?: string;
    pattern?: string;
    fgColor?: { theme?: number; tint?: number; argb?: string };
    bgColor?: { theme?: number; tint?: number; argb?: string };
  } | undefined,
  expectedArgb: string,
) {
  assert.ok(fill);
  const color = fill.pattern === 'solid' ? fill.fgColor : (fill.bgColor ?? fill.fgColor);
  assert.ok(color);
  assert.equal(color.argb, expectedArgb);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatMonthLabel(date: Date): string {
  const month = date.toLocaleDateString('ru-RU', { month: 'long', timeZone: 'UTC' });
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${date.getUTCFullYear()}`;
}

function getWeekendDateInRange(start: Date, end: Date): Date {
  for (let cursor = new Date(start.getTime()); cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) return cursor;
  }
  return start;
}

function getMondayAfterStart(start: Date, end: Date): Date | null {
  for (let cursor = addDays(start, 1); cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    if (cursor.getUTCDay() === 1) return cursor;
  }
  return null;
}

function columnName(columnNumber: number): string {
  let current = columnNumber;
  let label = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }
  return label;
}

async function loadWorkbook(data: ProjectExcelExportData, mode: ProjectExcelExportMode = 'gantt') {
  const { buildProjectExcelExportBuffer } = await import(new URL('./excel-export.ts', import.meta.url).href);
  const buffer = await buildProjectExcelExportBuffer(data, { mode });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  return workbook;
}

describe('buildProjectExcelExportBuffer', () => {
  it('renders title, compact calendar header, print settings, and weekend day highlight', async () => {
    const today = new Date();
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const timelineEnd = addDays(today, 2);
    const weekendDate = getWeekendDateInRange(monthStart, timelineEnd);
    const mondayDate = getMondayAfterStart(monthStart, timelineEnd);
    const todayColumnName = columnName(8 + Math.floor((today.getTime() - monthStart.getTime()) / 86_400_000));
    const weekendColumnName = columnName(8 + Math.floor((weekendDate.getTime() - monthStart.getTime()) / 86_400_000));
    const mondayColumnName = mondayDate
      ? columnName(8 + Math.floor((mondayDate.getTime() - monthStart.getTime()) / 86_400_000))
      : null;
    const timelineDays = Math.floor((timelineEnd.getTime() - monthStart.getTime()) / 86_400_000) + 1;
    const approximateWidth = (8 + 44 + 14 + 14 + 12 + 8 + 20) + timelineDays * DAY_WIDTH;
    const expectedLandscape = approximateWidth > 170 || timelineDays > 32;

    const workbook = await loadWorkbook({
      projectName: 'Demo',
      ganttDayMode: 'business',
      calendarWeeklyPattern: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
      calendarDays: [
        {
          date: toIsoDate(weekendDate),
          kind: 'non_working',
        },
      ],
      tasks: [
        {
          id: 'parent',
          name: 'Этап 1',
          parentId: null,
          startDate: toIsoDate(monthStart),
          endDate: toIsoDate(addDays(monthStart, 2)),
          sortOrder: 1,
          color: '#94A3B8',
          progress: 100,
          dependencies: [],
        },
        {
          id: 'child-a',
          name: 'Подготовка',
          parentId: 'parent',
          startDate: toIsoDate(monthStart),
          endDate: toIsoDate(addDays(monthStart, 1)),
          sortOrder: 1,
          color: '#22C55E',
          progress: 0,
          dependencies: [],
        },
        {
          id: 'child-parent',
          name: 'Подэтап',
          parentId: 'parent',
          startDate: toIsoDate(addDays(monthStart, 1)),
          endDate: toIsoDate(addDays(monthStart, 4)),
          sortOrder: 2,
          color: '#94A3B8',
          progress: 35,
          dependencies: [],
        },
        {
          id: 'deep-parent',
          name: 'Глубокий этап',
          parentId: 'child-parent',
          startDate: toIsoDate(addDays(monthStart, 2)),
          endDate: toIsoDate(addDays(monthStart, 4)),
          sortOrder: 1,
          color: '#94A3B8',
          progress: 15,
          dependencies: [],
        },
        {
          id: 'deep-child',
          name: 'Вложенная задача',
          parentId: 'deep-parent',
          startDate: toIsoDate(addDays(monthStart, 3)),
          endDate: toIsoDate(addDays(monthStart, 4)),
          sortOrder: 1,
          color: '#2563EB',
          progress: 0,
          dependencies: [],
        },
        {
          id: 'child-b',
          name: 'Монтаж очень длинного этапа с несколькими словами',
          parentId: 'parent',
          startDate: toIsoDate(addDays(monthStart, 2)),
          endDate: toIsoDate(timelineEnd),
          sortOrder: 3,
          color: '#2563EB',
          progress: 0,
          dependencies: [
            {
              predecessorTaskId: 'child-a',
              predecessorTaskName: 'Подготовка',
              type: 'FS',
              lag: 2,
            },
            {
              predecessorTaskId: 'missing',
              predecessorTaskName: null,
              type: 'SS',
              lag: 0,
            },
          ],
        },
      ],
    });

    const sheet = workbook.getWorksheet('Gantt');
    assert.ok(sheet);
    assert.match(((workbook.model.themes as unknown as Record<string, string> | undefined)?.theme1) ?? '', /GetGantt Theme/);
    assert.equal(sheet.views[0]?.showGridLines, false);
    assert.equal(sheet.getCell('A1').value, 'ГетГант / Demo');
    assert.equal(sheet.pageSetup.paperSize, 9);
    assert.equal(sheet.pageSetup.orientation, expectedLandscape ? 'landscape' : 'portrait');
    assert.equal(sheet.pageSetup.fitToWidth, expectedLandscape ? 0 : 1);
    assert.equal(sheet.pageSetup.fitToHeight, expectedLandscape ? 1 : 0);
    assert.match(sheet.headerFooter?.oddFooter ?? '', /GetGantt\.ru/);
    assert.match(sheet.headerFooter?.oddFooter ?? '', /Дата экспорта:/);
    assert.match(sheet.headerFooter?.oddFooter ?? '', /Страница &P из &N/);
    assert.equal(sheet.getCell('A3').value, '№');
    assert.equal(sheet.getCell('A3').alignment?.horizontal, 'left');
    assert.equal(sheet.getCell('B3').value, 'Задача');
    assert.equal(sheet.getCell('C3').value, 'Начало');
    assert.equal(sheet.getCell('D3').value, 'Оконч.');
    assert.equal(sheet.getCell('E3').value, 'Длит.');
    assert.equal(sheet.getCell('F3').value, '%');
    assert.equal(sheet.getCell('G3').value, 'Связи');
    assert.ok((sheet.getColumn('G').width ?? 0) >= 20);
    assert.ok((sheet.getColumn('G').width ?? 0) > (sheet.getColumn('F').width ?? 0));
    assert.ok(Math.abs((sheet.getColumn('H').width ?? 0) - DAY_WIDTH) < 0.25);
    assert.equal(sheet.getCell('H2').value, formatMonthLabel(monthStart));
    assert.equal(sheet.getCell('I2').value, null);
    assert.equal(sheet.getCell('H3').value, 1);
    assertThemeColor((sheet.getCell('H2').fill as any)?.fgColor, { theme: 0 });
    assertThemeColor((sheet.getCell('H3').fill as any)?.fgColor, { theme: 0 });
    assertThemeColor((sheet.getCell(`${weekendColumnName}2`).font as any)?.color, { theme: 1 });
    assertArgbColor((sheet.getCell(`${weekendColumnName}3`).font as any)?.color, 'FFDC2626');
    assertArgbColor((sheet.getCell(`${todayColumnName}3`).fill as any)?.fgColor, 'FFDC2626');
    assertThemeColor((sheet.getCell(`${todayColumnName}3`).font as any)?.color, { theme: 0 });
    assertArgbColor((sheet.getCell(`${todayColumnName}4`).border as any)?.left?.color, 'FFDC2626');
    if (mondayColumnName) {
      assert.equal((sheet.getCell(`${mondayColumnName}2`).border as any)?.left, undefined);
      assert.equal((sheet.getCell(`${mondayColumnName}3`).border as any)?.left?.style, 'thin');
    }
    assert.deepEqual(sheet.getCell('A1').border, {});
    assert.equal(sheet.getCell('A3').fill?.type, 'pattern');
    assert.equal((sheet.getCell('I3').border as any)?.left, undefined);
    assert.ok((sheet.properties.defaultRowHeight ?? 0) >= 21);

    assert.equal(sheet.getCell('A4').value, '1');
    assert.equal(sheet.getCell('A4').alignment?.horizontal, 'left');
    assert.equal(sheet.getCell('B4').value, 'Этап 1');
    assert.equal(sheet.getCell('B4').font?.bold, true);
    assert.equal(sheet.getCell('F4').value, 1);
    assert.equal(sheet.getCell('F4').numFmt, '0%');
    assert.equal(sheet.getCell('A5').value, '1.1');
    assert.equal(sheet.getCell('B5').value, 'Подготовка');
    assert.equal(sheet.getCell('B5').alignment?.indent, 1);
    assert.equal(sheet.getCell('A6').value, '1.2');
    assert.equal(sheet.getCell('B6').value, 'Подэтап');
    assertThemeColor((sheet.getCell('B6').fill as any)?.fgColor, { theme: 4, tint: 0.7999816888943144 });
    assertThemeColor((sheet.getCell('I6').fill as any)?.fgColor, { theme: 4, tint: 0.3999755851924192 });
    assert.equal(sheet.getCell('A7').value, '1.2.1');
    assert.equal(sheet.getCell('B7').value, 'Глубокий этап');
    assertThemeColor((sheet.getCell('B7').fill as any)?.fgColor, { theme: 4, tint: 0.7999816888943144 });
    assertThemeColor((sheet.getCell('J7').fill as any)?.fgColor, { theme: 4, tint: 0.5999938962981048 });
    assert.equal(sheet.getCell('A9').value, '1.3');
    assert.equal(sheet.getCell('C9').type, ExcelJS.ValueType.Date);
    assert.equal(sheet.getCell('E9').value, Math.floor((timelineEnd.getTime() - addDays(monthStart, 2).getTime()) / 86_400_000) + 1);
    assert.equal(sheet.getCell('F9').value, 0);
    assert.equal(sheet.getCell('G9').value, '[1.1]ОН+2, [missing]НН');
    assert.equal(sheet.getCell('G9').alignment?.horizontal, 'left');
    assert.equal(sheet.getCell('I9').fill?.type, 'pattern');
    assert.equal(sheet.getCell(`${todayColumnName}9`).fill?.type, 'pattern');
    assertArgbColor((sheet.getCell('A4').border as any)?.top?.color, 'FF4B5563');
    assertArgbColor((sheet.getCell('H4').border as any)?.top?.color, 'FF4B5563');
    assertThemeColor((sheet.getCell('H4').border as any)?.left?.color, { theme: 4 });
    assertThemeColor((sheet.getCell('B4').fill as any)?.fgColor, { theme: 4, tint: 0.5999938962981048 });
    assertThemeColor((sheet.getCell('H4').fill as any)?.fgColor, { theme: 4, tint: -0.249977111117893 });
    assert.ok((sheet.getRow(9).height ?? 0) > (29 / 1.333));
  });

  it('produces an empty-state workbook when the project has no tasks', async () => {
    const workbook = await loadWorkbook({
      projectName: 'Empty',
      ganttDayMode: 'business',
      calendarWeeklyPattern: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
      calendarDays: [],
      tasks: [],
    });

    const sheet = workbook.getWorksheet('Gantt');
    assert.ok(sheet);
    assert.equal(sheet.getCell('B4').value, 'Нет задач');
  });

  it('renders a two-row plan-fact export with fact warning coloring', async () => {
    const today = new Date();
    const start = addDays(today, -1);
    const end = addDays(today, 1);
    const yesterdayColumnName = columnName(10);
    const todayColumnName = columnName(11);
    const tomorrowColumnName = columnName(12);

    const workbook = await loadWorkbook({
      projectName: 'Fact Demo',
      ganttDayMode: 'business',
      calendarWeeklyPattern: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
      calendarDays: [],
      tasks: [
        {
          id: 'task-1',
          name: 'Бетон',
          parentId: null,
          startDate: toIsoDate(start),
          endDate: toIsoDate(end),
          sortOrder: 1,
          color: '#2563EB',
          progress: 0,
          workVolume: 3,
          workUnit: 'м',
          completedVolume: 2,
          progressEntries: [
            { entryDate: toIsoDate(today), amount: 0 },
            { entryDate: toIsoDate(end), amount: 2 },
          ],
          dependencies: [],
        },
      ],
    }, 'plan-fact');

    const sheet = workbook.getWorksheet('План-факт');
    assert.ok(sheet);
    assert.equal(sheet.getCell('A1').value, 'ГетГант / Fact Demo / План-факт');
    assert.equal(sheet.getCell('C3').value, 'Начало');
    assert.equal(sheet.getCell('D3').value, 'Оконч.');
    assert.equal(sheet.getCell('E3').value, 'Объём');
    assert.equal(sheet.getCell('F3').value, 'Ед.');
    assert.equal(sheet.getCell('G3').value, '');
    assert.equal(sheet.getCell('H3').value, 'На дату');
    assert.equal(sheet.getCell('I3').value, '%');
    assert.ok((sheet.getColumn('G').width ?? 0) < 10);
    assert.ok(Math.abs((sheet.getColumn('J').width ?? 0) - (28 / 7)) < 0.25);
    assert.equal(sheet.getCell('E4').value, 3);
    assert.equal(sheet.getCell('F4').value, 'м');
    assert.equal(sheet.getCell('G4').value, 'План');
    assert.equal(sheet.getCell('G5').value, 'Факт');
    assert.equal(sheet.getCell('H4').value, 1);
    assert.equal(sheet.getCell('H5').value, 2);
    assert.equal(sheet.getCell('I4').value, 1 / 3);
    assert.equal(sheet.getCell('I5').value, 2 / 3);
    assert.equal(sheet.getCell('I4').numFmt, '0%');
    assert.equal(sheet.getCell('I5').numFmt, '0%');
    assert.equal(sheet.getCell('E5').value, null);
    assert.equal(sheet.getCell('F5').value, null);
    assert.ok((sheet.model.merges ?? []).includes('A4:A5'));
    assert.ok((sheet.model.merges ?? []).includes('B4:B5'));
    assert.equal(sheet.getCell(`${yesterdayColumnName}4`).value, 1);
    assert.equal(sheet.getCell(`${todayColumnName}4`).value, 1);
    assert.equal(sheet.getCell(`${tomorrowColumnName}4`).value, 1);
    assertFillBackgroundArgb(sheet.getCell(`${yesterdayColumnName}5`).fill as any, 'FFFCD4DD');
    assertFillBackgroundArgb(sheet.getCell(`${todayColumnName}5`).fill as any, 'FFFCD4DD');
    assertArgbColor((sheet.getCell(`${todayColumnName}5`).font as any)?.color, 'FFDC2626');
    assert.equal(sheet.getCell(`${todayColumnName}5`).value, 0);
    assert.equal((sheet.getCell(`${tomorrowColumnName}5`).fill as any)?.pattern, 'gray0625');
    assertThemeColor((sheet.getCell(`${tomorrowColumnName}5`).fill as any)?.fgColor, { theme: 6, tint: 0.5999938962981048 });
    assertFillBackgroundArgb(sheet.getCell(`${tomorrowColumnName}5`).fill as any, 'FFC8F0C8');
    assertArgbColor((sheet.getCell(`${tomorrowColumnName}5`).font as any)?.color, 'FF15803D');
    assert.equal(sheet.getCell(`${tomorrowColumnName}5`).value, 2);
    assertArgbColor((sheet.getCell('C5').font as any)?.color, 'FFDC2626');
    assert.equal(sheet.getCell('D5').value, null);
    assertArgbColor((sheet.getCell('H5').font as any)?.color, 'FF15803D');
    assertArgbColor((sheet.getCell('I5').font as any)?.color, 'FF15803D');
  });
});

const DAY_WIDTH = 21 / 7;
