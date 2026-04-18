import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import type { ProjectExcelExportData } from './excel-export.js';

async function loadWorkbook(data: ProjectExcelExportData) {
  const { buildProjectExcelExportBuffer } = await import(new URL('./excel-export.ts', import.meta.url).href);
  const buffer = await buildProjectExcelExportBuffer(data);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  return workbook;
}

describe('buildProjectExcelExportBuffer', () => {
  it('renders compact period headers and reordered static columns', async () => {
    const workbook = await loadWorkbook({
      projectName: 'Demo',
      ganttDayMode: 'business',
      calendarDays: [],
      tasks: [
        {
          id: 'parent',
          name: 'Этап 1',
          parentId: null,
          startDate: '2026-04-01',
          endDate: '2026-04-03',
          sortOrder: 1,
          color: '#94A3B8',
          dependencies: [],
        },
        {
          id: 'child-a',
          name: 'Подготовка',
          parentId: 'parent',
          startDate: '2026-04-01',
          endDate: '2026-04-02',
          sortOrder: 1,
          color: '#22C55E',
          dependencies: [],
        },
        {
          id: 'child-b',
          name: 'Монтаж очень длинного этапа с несколькими словами',
          parentId: 'parent',
          startDate: '2026-04-03',
          endDate: '2026-04-05',
          sortOrder: 2,
          color: '#2563EB',
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
    assert.equal(sheet.views[0]?.showGridLines, false);
    assert.equal(sheet.getCell('A3').value, '№');
    assert.equal(sheet.getCell('B3').value, 'Задача');
    assert.equal(sheet.getCell('C3').value, 'Начало');
    assert.equal(sheet.getCell('D3').value, 'Окончание');
    assert.equal(sheet.getCell('E3').value, 'Длит.');
    assert.equal(sheet.getCell('F3').value, '%');
    assert.equal(sheet.getCell('G3').value, 'Связи');
    assert.ok((sheet.getColumn('G').width ?? 0) >= 20);
    assert.ok((sheet.getColumn('G').width ?? 0) > (sheet.getColumn('F').width ?? 0));
    assert.equal(sheet.getColumn('H').width, 20 / 7);
    assert.equal(sheet.getCell('H1').value, '2026');
    assert.equal(sheet.getCell('I1').value, null);
    assert.equal(sheet.getCell('H2').value, 'Апрель');
    assert.equal(sheet.getCell('I2').value, null);
    assert.equal(sheet.getCell('H3').value, 1);
    assert.equal((sheet.getCell('K3').font as any)?.color?.argb, 'FFDC2626');
    assert.deepEqual(sheet.getCell('A1').border, {});
    assert.equal(sheet.getCell('A1').fill?.type, 'pattern');
    assert.equal(sheet.getCell('H1').alignment?.wrapText, undefined);
    assert.ok((sheet.properties.defaultRowHeight ?? 0) >= 21);

    assert.equal(sheet.getCell('A4').value, '1');
    assert.equal(sheet.getCell('B4').value, 'Этап 1');
    assert.equal(sheet.getCell('B4').font?.bold, true);
    assert.equal(sheet.getCell('A5').value, '1.1');
    assert.equal(sheet.getCell('B5').value, 'Подготовка');
    assert.equal(sheet.getCell('B5').alignment?.indent, 1);
    assert.equal(sheet.getCell('A6').value, '1.2');
    assert.equal(sheet.getCell('C6').type, ExcelJS.ValueType.Date);
    assert.equal(sheet.getCell('E6').value, 3);
    assert.equal(sheet.getCell('F6').value, 0);
    assert.equal(sheet.getCell('G6').value, '[1.1]ОН+2, [missing]НН');
    assert.equal(sheet.getCell('G6').alignment?.wrapText, undefined);
    assert.equal(sheet.getCell('I6').fill?.type, 'pattern');
    assert.equal(sheet.getCell('K6').fill?.type, 'pattern');
    assert.equal(sheet.getCell('M6').fill, undefined);
    assert.equal((sheet.getCell('H4').border as any)?.left?.color?.argb, 'FF64748B');
    assert.equal((sheet.getCell('H4').fill as any)?.fgColor?.argb, 'FFCBD5E1');
    assert.ok((sheet.getRow(6).height ?? 0) > (29 / 1.333));
  });

  it('produces an empty-state workbook when the project has no tasks', async () => {
    const workbook = await loadWorkbook({
      projectName: 'Empty',
      ganttDayMode: 'business',
      calendarDays: [],
      tasks: [],
    });

    const sheet = workbook.getWorksheet('Gantt');
    assert.ok(sheet);
    assert.equal(sheet.getCell('B4').value, 'Нет задач');
  });
});
